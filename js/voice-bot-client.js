class VoiceBot {
  // ── Public config ──────────────────────────────────────────────────────

  /** WebSocket URL of the FastAPI relay server */
  wsUrl = "";

  /** Called with transcript text as the bot responds */
  onText = null;

  /** Called with "connected" | "disconnected" | "error" */
  onStatus = null;

  /** Called with true/false when bot audio starts/stops playing */
  onSpeaking = null;

  // ── Private state ──────────────────────────────────────────────────────

  #ws            = null;
  #audioCtx      = null;
  #processor     = null;
  #micStream     = null;
  #nextPlayTime  = 0;       // Scheduled end-time of the last audio chunk
  #activeSources = new Set(); // BufferSources currently playing or scheduled
  #dropStaleAudio = false;  // Ignore straggler chunks until turn_complete
  #isActive      = false;
  #isSpeaking    = false;

  // Internal constants
  static #SEND_SAMPLE_RATE    = 16_000;   // Gemini Live expects 16 kHz input
  static #RECEIVE_SAMPLE_RATE = 24_000;   // Gemini Live sends 24 kHz output
  static #BUFFER_SIZE         = 4_096;    // ScriptProcessor frame size

  constructor(wsUrl) {
    this.wsUrl = wsUrl;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Opens the WebSocket and starts mic capture.
   * Resolves once the WebSocket connection is established.
   * Rejects if the WS fails to open or mic permission is denied.
   */
  async start() {
    if (this.#isActive) return;

    this.#audioCtx = new AudioContext();
    await this.#openWebSocket();
    await this.#startMicrophone();

    this.#isActive = true;
    this.#emit("onStatus", "connected");
    console.log("[VoiceBot] Started. AudioContext sample rate:", this.#audioCtx.sampleRate);
  }

  /** Tears down mic, WebSocket, and AudioContext cleanly. */
  stop() {
    this.#isActive = false;
    this.#dropStaleAudio = false;
    this.#stopAllPlayback();

    if (this.#micStream)  this.#micStream.getTracks().forEach(t => t.stop());
    if (this.#processor)  { this.#processor.disconnect(); this.#processor = null; }
    if (this.#ws)         { this.#ws.close(); this.#ws = null; }
    if (this.#audioCtx)   { this.#audioCtx.close(); this.#audioCtx = null; }

    this.#setSpeaking(false);
    this.#emit("onStatus", "disconnected");
    console.log("[VoiceBot] Stopped.");
  }

  // ── WebSocket ──────────────────────────────────────────────────────────

  #openWebSocket() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        this.#ws = ws;
        resolve();
      };

      ws.onerror = (e) => {
        this.#emit("onStatus", "error");
        reject(new Error(`[VoiceBot] WebSocket error: ${e}`));
      };

      ws.onclose = () => {
        if (this.#isActive) {
          // Unexpected close — clean up
          this.stop();
        }
      };

      ws.onmessage = (event) => this.#handleServerMessage(event);
    });
  }

  #handleServerMessage(event) {
    if (event.data instanceof ArrayBuffer) {
      // Binary frame = PCM audio chunk from Gemini (Int16, 24 kHz, mono)
      this.#schedulePCMPlayback(event.data);
      return;
    }

    // Text frame = JSON control/transcript message
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "text") {
        this.#emit("onText", msg.content);
      }

      if (msg.type === "interrupted") {
        // User barged in: stop in-flight audio and ignore stale chunks until
        // turn_complete (Gemini order: interrupted → turn_complete → new audio).
        this.#dropStaleAudio = true;
        this.#stopAllPlayback();
      }

      if (msg.type === "turn_complete") {
        // End of turn; allow the next response's audio through.
        this.#dropStaleAudio = false;
      }
    } catch {
      console.warn("[VoiceBot] Received non-JSON text frame:", event.data);
    }
  }

  // ── Microphone capture ─────────────────────────────────────────────────

  async #startMicrophone() {
    this.#micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: VoiceBot.#SEND_SAMPLE_RATE, // browser may or may not honor this
      },
      video: false,
    });

    const source    = this.#audioCtx.createMediaStreamSource(this.#micStream);
    const processor = this.#audioCtx.createScriptProcessor(
      VoiceBot.#BUFFER_SIZE,
      1,  // input channels
      1,  // output channels
    );

    processor.onaudioprocess = (e) => {
      if (!this.#isActive || this.#ws?.readyState !== WebSocket.OPEN) return;

      const float32    = e.inputBuffer.getChannelData(0);
      const nativeRate = this.#audioCtx.sampleRate;

      // Downsample to 16 kHz if needed (e.g. browser runs at 44100 or 48000)
      const resampled  = VoiceBot.#downsample(float32, nativeRate, VoiceBot.#SEND_SAMPLE_RATE);

      // Convert Float32 → Int16 PCM
      const int16      = VoiceBot.#float32ToInt16(resampled);

      this.#ws.send(int16.buffer);
    };

    // ScriptProcessorNode MUST be connected to the destination graph to fire.
    // We route through a silent GainNode to avoid feedback/echo.
    const silentGain = this.#audioCtx.createGain();
    silentGain.gain.value = 0;

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(this.#audioCtx.destination);

    this.#processor = processor;
  }

  // ── Audio playback ─────────────────────────────────────────────────────

  /**
   * Decodes a raw Int16 PCM buffer (24 kHz, mono) and schedules it for
   * gapless playback, chaining each chunk immediately after the previous one.
   */
  /** Stops all scheduled/playing bot audio immediately (used on barge-in). */
  #stopAllPlayback() {
    for (const source of this.#activeSources) {
      try { source.stop(); } catch { /* already ended */ }
    }
    this.#activeSources.clear();
    if (this.#audioCtx) {
      this.#nextPlayTime = this.#audioCtx.currentTime;
    }
    this.#setSpeaking(false);
  }

  #schedulePCMPlayback(arrayBuffer) {
    if (this.#dropStaleAudio) return;

    const int16   = new Int16Array(arrayBuffer);
    const float32 = VoiceBot.#int16ToFloat32(int16);

    const buffer  = this.#audioCtx.createBuffer(
      1,
      float32.length,
      VoiceBot.#RECEIVE_SAMPLE_RATE,
    );
    buffer.copyToChannel(float32, 0);

    const source = this.#audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.#audioCtx.destination);
    this.#activeSources.add(source);

    // Chain: start immediately after the last scheduled chunk ends
    const now     = this.#audioCtx.currentTime;
    const startAt = Math.max(now, this.#nextPlayTime);
    source.start(startAt);
    this.#nextPlayTime = startAt + buffer.duration;

    if (!this.#isSpeaking) this.#setSpeaking(true);
    source.onended = () => {
      this.#activeSources.delete(source);
      if (this.#audioCtx && this.#nextPlayTime <= this.#audioCtx.currentTime + 0.05) {
        this.#setSpeaking(false);
      }
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Linear interpolation downsample (good enough for voice at these rates). */
  static #downsample(buffer, fromRate, toRate) {
    if (fromRate === toRate) return buffer;
    const ratio     = fromRate / toRate;
    const outLength = Math.floor(buffer.length / ratio);
    const output    = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      // Simple linear interpolation between adjacent samples
      const pos   = i * ratio;
      const index = Math.floor(pos);
      const frac  = pos - index;
      const a     = buffer[index]     ?? 0;
      const b     = buffer[index + 1] ?? 0;
      output[i]   = a + frac * (b - a);
    }
    return output;
  }

  /** Clamp Float32 [-1, 1] → Int16 [-32768, 32767] */
  static #float32ToInt16(float32) {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s   = Math.max(-1, Math.min(1, float32[i]));
      int16[i]  = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  /** Int16 → Float32 for AudioBuffer */
  static #int16ToFloat32(int16) {
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }

  #setSpeaking(state) {
    if (this.#isSpeaking === state) return;
    this.#isSpeaking = state;
    this.#emit("onSpeaking", state);
  }

  #emit(event, payload) {
    if (typeof this[event] === "function") this[event](payload);
  }
}

