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

const RESUME_DATA = `Yash Prajapati
+91-9313077125 | yashprajapati1007@gmail.com | LinkedIn.com/in/yashprajapati1007

PROJECTS											           
Partial Line Loss Correction: Certificate
•	As a part of ISRO’s research, single-handedly developed a ConvLSTM-based model for predicting missing data in INSAT 3DS satellite images, using thousands of image sequences.
•	Implemented a binary mask approach to restore missing pixels, normalizing pixel values and achieving a MAE of 0.006, and accuracy of about 98% with minimal image modifications.

Lead Generator agent: JSON file
•	Engineered an AI-powered lead generation agent in n8n to automate the end-to-end prospecting workflow.
•	Automated web scraping using Apify to collect business data from target locations.
•	Processed and summarized text with Hugging Face (BART) for concise business insights.
•	Generated personalized HTML marketing emails through the Cohere API, tailored to company profiles

EXPERIENCE											           
AI/ML Intern, Moweb Technologies Pvt. ltd	     				Aug. 2025 – Present
•	Developed an AI-driven lead–property matching system using content-based filtering with cosine similarity, replacing the client’s existing rule-based recommender.
•	Improved CNN model accuracy from 76% to 91% by redesigning the network architecture and optimizing hyperparameters for image classification.

AI/ML Intern, SAC-ISRO, Ahmedabad						Jan. 2025 – Apr. 2025
•	Conducted research in the fields of image reconstruction and image prediction using various CNN models and LSTM.
•	Utilized INSAT-3DS Satellite data by MOSDAC, ISRO for training the model for the image prediction. The research achieved an accuracy of about 98% with MAE of 0.0006.

SKILLS											           
AI Automation: n8n, AI APIs, LangChain, Langraph, MCP
Generative AI: LLMs, NLP, RAG (Retrieval-Augmented Generation), Vector database, Prompt Engineering, Hugging Face
ML/DL: Supervised & Unsupervised Algorithms, Model Optimization, CNN, LSTM, Transformers
Libraries & Frameworks: TensorFlow, Keras, scikit-learn, NumPy, Pandas, Matplotlib, OpenCV, Pydantic
Programming Languages: Python, JavaScript
Tools: GitHub, Visual Studio Code, Jupyter Notebook, Google Colab
Soft skills: Patience, Leadership, problem-solving

EDUCATION											           
Bachelor of Engineering, Information and Communication Technology (ICT)		Oct. 2021 – June. 2025
Sal Institute of Technology and Engineering Research, Ahmedabad, CGPA: 7.72

ACHIEVEMENTS										           
•	Enhanced a skin cancer detection POC by redesigning the CNN architecture and data augmentation pipeline, achieving 91% accuracy (from 76%) and improving model sensitivity through recall-based evaluation.
•	Led university football team to 3 inter-college championships by valuing every player and making quick, strategic on-field decisions.
`;

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';

  private client: GoogleGenAI | undefined;
  private session: Session | null = null;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream | null = null;
  private sourceNode: AudioNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
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
    this.setupMessageListener();
  }

  private setupMessageListener() {
    // Listen for messages from parent window (portfolio page)
    this.messageHandler = (event) => {
      // Check if the message is from our portfolio page
      if (event.data && typeof event.data === 'object' && event.data.action === 'stopVoiceBot') {
        console.log('Received stop command from parent window');
        this.stopRecording();
        this.reset();
      }
    };
    
    window.addEventListener('message', this.messageHandler);
  }

  private messageHandler: ((event: MessageEvent) => void) | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up the message listener when component is destroyed
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: import.meta.env.VITE_GEMINI_API_KEY // Changed from GEMINI_API_KEY

    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';
    const systemInstruction = `You are a helpful AI assistant. You have been provided with Yash Prajapati's resume. Please answer questions based on this resume. If asked about contact details, provide the email and phone number from the resume.

Yash Prajapati's Resume:
---
${RESUME_DATA}
---
`;

    try {
      if (!this.client) {
        throw new Error('GoogleGenAI client not initialized');
      }
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Connection Opened. Ask me about Yash Prajapati.');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio = (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) as any;

            if (audio && typeof audio === 'object' && 'data' in audio) {
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
        this.mediaStream!,
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
      this.updateStatus('🔴 Recording... Ask me about Yash!');
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