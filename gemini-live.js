class GeminiLiveClient {
  constructor(options) {
    this.options = options;
    this.socket = null;
    this.micStream = null;
    this.inputContext = null;
    this.outputContext = null;
    this.processor = null;
    this.nextPlayTime = 0;
    this.connected = false;
  }

  async connect(systemInstruction) {
    const tokenUrl = new URL(this.options.tokenEndpoint);
    tokenUrl.searchParams.set('mode', this.options.mode || 'chat');
    const idToken = await this.options.getAuthToken?.();
    if (!idToken) throw new Error('Please sign in before starting Gemini Live');
    const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: { Authorization: `Bearer ${idToken}` } });
    if (!tokenResponse.ok) throw new Error(`Token server returned ${tokenResponse.status}`);
    const { token } = await tokenResponse.json();
    if (!token) throw new Error('Token server did not return an ephemeral token');
    const endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
    this.socket = new WebSocket(endpoint);
    this.socket.addEventListener('message', event => this.handleMessage(event));
    this.socket.addEventListener('error', () => this.options.onError?.(new Error('Gemini WebSocket error')));
    this.socket.addEventListener('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.options.onStatus?.('disconnected');
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Gemini connection timeout')), 12000);
      this.socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Gemini connection failed')); }, { once: true });
    });
    const setup = {
      model: `models/${this.options.model || 'gemini-3.1-flash-live-preview'}`,
      responseModalities: ['AUDIO'],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.options.voice || 'Aoede' } } },
      systemInstruction: { parts: [{ text: systemInstruction }] },
    };
    if (this.options.translationTarget) setup.translationConfig = { targetLanguageCode: this.options.translationTarget };
    this.socket.send(JSON.stringify({
      setup: {
        ...setup,
      },
    }));
  }

  async startMicrophone() {
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.inputContext = new (window.AudioContext || window.webkitAudioContext)();
    this.outputContext = new (window.AudioContext || window.webkitAudioContext)();
    await Promise.all([this.inputContext.resume(), this.outputContext.resume()]);
    const source = this.inputContext.createMediaStreamSource(this.micStream);
    this.processor = this.inputContext.createScriptProcessor(2048, 1, 1);
    const silent = this.inputContext.createGain(); silent.gain.value = 0;
    this.processor.onaudioprocess = event => {
      if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return;
      const pcm = this.resampleTo16k(event.inputBuffer.getChannelData(0), this.inputContext.sampleRate);
      this.socket.send(JSON.stringify({ realtimeInput: { audio: { data: this.int16ToBase64(pcm), mimeType: 'audio/pcm;rate=16000' } } }));
      const level = Math.min(1, Math.sqrt(pcm.reduce((sum, value) => sum + (value / 32768) ** 2, 0) / Math.max(1, pcm.length)) * 5);
      this.options.onInputLevel?.(level);
    };
    source.connect(this.processor); this.processor.connect(silent); silent.connect(this.inputContext.destination);
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.setupComplete) {
      this.connected = true;
      this.startMicrophone().then(() => this.options.onStatus?.('connected')).catch(error => this.options.onError?.(error));
      return;
    }
    const content = message.serverContent;
    if (!content) return;
    if (content.interrupted) this.stopQueuedAudio();
    if (content.inputTranscription?.text) this.options.onTranscript?.(content.inputTranscription.text, 'user', !content.turnComplete);
    if (content.outputTranscription?.text) this.options.onTranscript?.(content.outputTranscription.text, 'bot', !content.turnComplete);
    for (const part of content.modelTurn?.parts || []) {
      const inline = part.inlineData || part.inline_data;
      if (inline?.data && /audio\/pcm/.test(inline.mimeType || inline.mime_type || 'audio/pcm')) this.playPcm(inline.data, 24000);
      if (part.text) this.options.onTranscript?.(part.text, 'bot', !content.turnComplete);
    }
    if (content.turnComplete) this.options.onTurnComplete?.();
  }

  sendText(text) {
    if (!this.connected) return false;
    this.socket.send(JSON.stringify({ realtimeInput: { text } }));
    return true;
  }

  playPcm(base64, sampleRate) {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const buffer = this.outputContext.createBuffer(1, samples.length, sampleRate);
    const channel = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) { channel[i] = samples[i] / 32768; sum += channel[i] ** 2; }
    this.options.onOutputLevel?.(Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 4));
    const source = this.outputContext.createBufferSource(); source.buffer = buffer; source.connect(this.outputContext.destination);
    this.nextPlayTime = Math.max(this.outputContext.currentTime + .015, this.nextPlayTime);
    source.start(this.nextPlayTime); this.nextPlayTime += buffer.duration;
    source.addEventListener('ended', () => { if (this.outputContext.currentTime >= this.nextPlayTime - .08) this.options.onOutputLevel?.(0); });
  }

  stopQueuedAudio() {
    this.nextPlayTime = this.outputContext?.currentTime || 0;
    this.options.onOutputLevel?.(0);
  }

  resampleTo16k(input, inputRate) {
    if (inputRate === 16000) return Int16Array.from(input, value => Math.max(-1, Math.min(1, value)) * 32767);
    const ratio = inputRate / 16000, length = Math.floor(input.length / ratio), output = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0; for (let j = start; j < end; j++) sum += input[j];
      output[i] = Math.max(-1, Math.min(1, sum / Math.max(1, end - start))) * 32767;
    }
    return output;
  }

  int16ToBase64(samples) {
    const bytes = new Uint8Array(samples.buffer); let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  close() {
    this.connected = false;
    this.processor?.disconnect(); this.micStream?.getTracks().forEach(track => track.stop());
    this.inputContext?.close(); this.outputContext?.close(); this.socket?.close();
    this.options.onOutputLevel?.(0); this.options.onInputLevel?.(0);
  }
}

window.GeminiLiveClient = GeminiLiveClient;
