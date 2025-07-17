/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

const RESUME_DATA = `
Kartavya Master
kartavyamaster17@gmail.com • 706XXXX868 • LinkedIn • Github • Portfolio

Professional Summary & Skills
AI Developer with a B.Tech in Artificial Intelligence and Data Science and hands-on experience building production-ready GenAl applications. Skilled in Generative AI, LangChain, RAG (Retrieval-Augmented Generation), Prompt Engineering, Backend Development with strong foundations in Machine Learning, Natural Language Processing(NLP) and Generative AI. Proficient in building AI Agents, voice-based AI agents, MCP Tools, Backend-API development, and prompt optimization to reduce hallucinations and improve model efficiency.

Professional Work Experience
• GenAI Intern | Mirai Minds LLP
  o Your work experience and on which technology you have worked with

• GenAI Intern | TECOSYS
  o Your work experience and on which technology you have worked with

• AI Intern | YHills, E-Cell (IIT Hydrabad)
  o Your work experience and on which technology you have worked with

Selected Projects
• 

Education
• SARVAJANIK COLLAGE OF ENGINEERING AND TECHNOLOGY (SCET-SU) (2021 - 2025)
  B.Tech in Artificial Intelligence and Data Science
  C.CGPA = 8.6

Certifications/Courses
• AI Agents Fundamentals [Link]
• Prompt Engineering for ChatGPT [Link]
• Generative Al with Langchain and Huggingface [Link]
• Prompt Design in Vertex AI Skill Badge [Link]
• Develop GenAI Apps with Gemini and Streamlit Skill Badge [Link]
`;

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white; /* Added for better visibility */
      padding: 5px;
      background-color: rgba(0,0,0,0.3); /* Added for better visibility */
      border-radius: 5px; /* Added for better visibility */
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex; /* For centering icon */
        align-items: center; /* For centering icon */
        justify-content: center; /* For centering icon */

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button[disabled] {
        display: none;
      }
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY, // Changed from GEMINI_API_KEY
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';
    const systemInstruction = `You are a helpful AI assistant. You have been provided with Kartavya Master's resume. Please answer questions based on this resume. If asked about contact details, provide the email and phone number from the resume.

Kartavya Master's Resume:
---
${RESUME_DATA}
---
`;

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Connection Opened. Ask me about Kartavya Master.');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () =>{
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if(interrupted) {
              for(const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(`Error: ${e.message}`);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus(`Connection Closed: ${e.reason || 'Unknown reason'}`);
          },
        },
        config: {
          systemInstruction: systemInstruction, // Added system instruction
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
            // languageCode: 'en-GB'
          },
        },
      });
    } catch (e) {
      console.error(e);
      this.updateError(`Failed to initialize session: ${(e as Error).message}`);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.error = ''; // Clear previous errors when a new status is set
  }

  private updateError(msg: string) {
    this.error = msg;
    this.status = ''; // Clear status when an error occurs
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    // Ensure session is initialized before starting recording
    if (!this.session) {
        this.updateError('Session not initialized. Please wait or refresh.');
        try {
            await this.initSession(); // Attempt to re-initialize
            if(!this.session) { // if still not initialized
                 this.updateError('Failed to re-initialize session. Cannot start recording.');
                 return;
            }
        } catch (e) {
            this.updateError(`Error re-initializing session: ${(e as Error).message}`);
            return;
        }
    }


    this.inputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256; // Standard buffer size
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1, // Number of input channels
        1, // Number of output channels
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording || !this.session) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        try {
            this.session.sendRealtimeInput({media: createBlob(pcmData)});
        } catch (err) {
            console.error('Error sending realtime input:', err);
            this.updateError(`Error sending audio: ${(err as Error).message}`);
            // Optionally, you might want to stop recording or re-init session here
        }
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      // It's often recommended not to connect scriptProcessorNode to destination
      // if you don't want to playback the raw input.
      // However, if your setup requires it for analysis or other reasons, keep it.
      // For this app, it seems inputNode is used for visualization, so this might be fine.
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);


      this.isRecording = true;
      this.updateStatus('🔴 Recording... Ask me about Kartavya!');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${(err as Error).message}`);
      this.stopRecording(); // Clean up if start recording fails
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && this.inputAudioContext.state !== 'closed') {
        // Only update status if it wasn't already an error or a specific message
        if (!this.error && this.status !== 'Recording stopped. Click Start to begin again.') {
             this.updateStatus('Recording stopped. Click Start to begin again.');
        }
    }


    this.isRecording = false;

    if (this.scriptProcessorNode) {
        this.scriptProcessorNode.disconnect();
        this.scriptProcessorNode.onaudioprocess = null; // Important to remove the handler
        this.scriptProcessorNode = null;
    }
    if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
    }


    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Don't close inputAudioContext here, it might be needed for next recording
    // this.inputAudioContext.close();

    // Only update status if it wasn't already an error
    if (!this.error) {
        this.updateStatus('Recording stopped. Click Start to begin again.');
    }
  }

  private async reset() {
    this.stopRecording(); // Ensure recording is stopped before resetting
    if (this.session) {
      try {
        await this.session.close();
      } catch (e) {
        console.warn('Error closing session during reset:', e);
      }
      this.session = null;
    }
    this.sources.forEach(source => source.stop());
    this.sources.clear();
    this.nextStartTime = 0;
    
    // Re-initialize audio contexts if they were closed or in a bad state
    if (this.inputAudioContext.state === 'closed') {
        this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
        this.inputNode = this.inputAudioContext.createGain();
    }
    if (this.outputAudioContext.state === 'closed') {
        this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        this.outputNode = this.outputAudioContext.createGain();
        this.outputNode.connect(this.outputAudioContext.destination);
    }
    
    this.initAudio(); // Reset nextStartTime specifically
    this.updateStatus('Clearing session...');
    try {
        await this.initSession(); // Re-initialize the session
        this.updateStatus('Session cleared. Ready to start.');
    } catch (e) {
        this.updateError(`Failed to re-initialize session after reset: ${(e as Error).message}`);
    }
  }

  render() {
    return html`
      <div>
        <div class="controls">
          <button
            id="resetButton"
            aria-label="Reset Session"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="36px"
              viewBox="0 -960 960 960"
              width="36px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            aria-label="Start Recording"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="45" />
            </svg>
          </button>
          <button
            id="stopButton"
            aria-label="Stop Recording"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#ffffff" 
              xmlns="http://www.w3.org/2000/svg">
              <rect x="15" y="15" width="70" height="70" rx="10" />
            </svg>
          </button>
        </div>

        <div id="status" role="status" aria-live="polite">
         ${this.error ? `Error: ${this.error}` : this.status}
        </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}