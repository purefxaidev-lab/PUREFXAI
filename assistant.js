(() => {
  const root = document.querySelector('#aiCompanion');
  if (!root) return;
  const toggle = document.querySelector('#companionToggle');
  const close = document.querySelector('#aiClose');
  const chat = document.querySelector('#aiChat');
  const form = document.querySelector('#aiForm');
  const input = document.querySelector('#aiInput');
  const messages = document.querySelector('#aiMessages');
  const voiceButton = document.querySelector('#voiceButton');
  const voiceLabel = document.querySelector('#voiceLabel');
  const status = document.querySelector('#aiStatus');
  const pupils = root.querySelector('.pupils');
  const companionName = document.querySelector('#companionName');
  const characterButtons = [...document.querySelectorAll('[data-pick]')];
  const liveModeButtons = [...document.querySelectorAll('[data-live-mode]')];
  const liveConfig = window.PUREFXAI_CONFIG || {};
  const endpoint = window.PUREFXAI_CONFIG?.sessionEndpoint?.trim();

  let pc, dc, micStream, audioContext, analyser, speakingFrame;
  let gemini = null;
  let transcriptNode = null;
  const geminiTranscript = { user: null, bot: null };
  const characters = {
    astra: { name: 'ASTRA', greeting: 'Astra สาวไซเบอร์ผู้มั่นใจและฉลาดเฉียบคม' },
    sakura: { name: 'SAKURA', greeting: 'Sakura สาวแสนอบอุ่น ร่าเริง และเป็นกันเอง' },
    luna: { name: 'LUNA', greeting: 'Luna สาวลึกลับ สุขุม และเก่งด้านเทคโนโลยี' },
    hikari: { name: 'HIKARI', greeting: 'Hikari สาวสดใส หรูหรา และเต็มไปด้วยพลังบวก' },
  };
  let liveMode = 'chat';
  try { liveMode = localStorage.getItem('purefxai-live-mode') || 'chat'; } catch {}

  function selectLiveMode(mode, announce = true) {
    liveMode = mode === 'translate' ? 'translate' : 'chat';
    liveModeButtons.forEach(button => button.classList.toggle('active', button.dataset.liveMode === liveMode));
    try { localStorage.setItem('purefxai-live-mode', liveMode); } catch {}
    window.PUREFXAI_AUTH?.savePreference?.('liveMode', liveMode).catch?.(() => {});
    if (gemini || pc) disconnectLive(false);
    voiceLabel.textContent = liveMode === 'translate' ? 'เริ่มล่ามสด 3.5' : 'เริ่ม Gemini Live';
    if (announce) addMessage(liveMode === 'translate' ? 'เปิดโหมดล่ามสดแล้วค่ะ พูดภาษาไทยเพื่อแปลเป็นภาษาอังกฤษแบบเสียงสด' : 'เปิดโหมด AI สนทนาแล้วค่ะ ถามคำถามหรือสั่งงานด้วยเสียงได้เลย', 'system');
  }
  liveModeButtons.forEach(button => button.addEventListener('click', () => selectLiveMode(button.dataset.liveMode)));
  selectLiveMode(liveMode, false);

  const setOpen = (open) => {
    root.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    chat.setAttribute('aria-hidden', String(!open));
    if (open) setTimeout(() => input.focus(), 450);
  };
  toggle.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));

  addEventListener('pointermove', (event) => {
    const rect = root.getBoundingClientRect();
    const x = Math.max(-3, Math.min(3, (event.clientX - (rect.left + rect.width / 2)) / 90));
    const y = Math.max(-2, Math.min(2, (event.clientY - (rect.top + 145)) / 120));
    pupils.style.transform = `translate(${x}px,${y}px)`;
  }, { passive: true });

  function addMessage(text, type = 'bot') {
    const node = document.createElement('div');
    node.className = `ai-message ${type}`;
    node.textContent = text;
    messages.append(node);
    messages.scrollTop = messages.scrollHeight;
    if ((type === 'user' || type === 'bot') && text) window.PUREFXAI_AUTH?.saveChat?.(type, text, { character: root.dataset.character, liveMode }).catch?.(() => {});
    return node;
  }

  function selectCharacter(id, announce = true) {
    const character = characters[id] || characters.astra;
    root.dataset.character = id;
    companionName.textContent = character.name;
    characterButtons.forEach(button => button.classList.toggle('active', button.dataset.pick === id));
    try { localStorage.setItem('purefxai-character', id); } catch {}
    window.PUREFXAI_AUTH?.savePreference?.('character', id).catch?.(() => {});
    if (announce) addMessage(`เปลี่ยนเป็น ${character.name} แล้วค่ะ — ${character.greeting} ✨`, 'system');
    if (gemini?.connected) {
      addMessage('บุคลิกใหม่จะทำงานเต็มรูปแบบในการเชื่อมต่อ Live ครั้งถัดไปค่ะ', 'system');
    } else if (dc?.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'session.update', session: { type: 'realtime', instructions: `You are ${character.name}, ${character.greeting}. You are a female anime AI assistant for PUREFXAI. Reply naturally and concisely in Thai unless the user speaks another language.` } }));
    }
  }
  characterButtons.forEach(button => button.addEventListener('click', () => selectCharacter(button.dataset.pick)));
  let savedCharacter = 'astra';
  try { savedCharacter = localStorage.getItem('purefxai-character') || 'astra'; } catch {}
  selectCharacter(savedCharacter, false);

  function demoReply(text) {
    const t = text.toLowerCase();
    if (/สวัสดี|hello|hi/.test(t)) return 'สวัสดีค่ะ ✨ ยินดีต้อนรับสู่ PUREFXAI มีอะไรให้ฉันช่วยไหมคะ';
    if (/purefxai|ทำอะไร|บริการ/.test(t)) return 'PUREFXAI เชี่ยวชาญ AI Film, Generative Design, Intelligent Products, Automation และกลยุทธ์ AI ค่ะ';
    if (/ทอง|gold/.test(t)) return 'PUREFXAI พัฒนาระบบ Gold Intelligence สำหรับวิเคราะห์ข้อมูลตลาดและสัญญาณแบบเรียลไทม์ค่ะ';
    return 'ตอนนี้ฉันอยู่ในโหมดสาธิตค่ะ ระบบ Live จะตอบได้เต็มความสามารถเมื่อเชื่อม Worker และ Gemini API แล้ว';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user'); input.value = '';
    if (gemini?.connected) {
      gemini.sendText(text);
      return;
    }
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }));
      dc.send(JSON.stringify({ type: 'response.create' }));
      return;
    }
    const typing = addMessage('กำลังคิด', 'bot typing');
    setTimeout(() => { typing.remove(); addMessage(demoReply(text)); }, 650);
  });

  async function connectLive() {
    if (liveConfig.provider === 'gemini') return connectGeminiLive();
    if (pc) return disconnectLive();
    if (!endpoint) {
      addMessage('ตัวละครและแชตพร้อมแล้ว แต่ยังต้องตั้งค่า Worker URL เพื่อเปิด ChatGPT Live Voice ค่ะ', 'system');
      status.textContent = 'รอเชื่อม Live API';
      return;
    }
    try {
      status.textContent = 'กำลังขอใช้ไมโครโฟน…'; voiceLabel.textContent = 'กำลังเชื่อมต่อ…';
      pc = new RTCPeerConnection();
      const audio = document.createElement('audio'); audio.autoplay = true;
      pc.ontrack = (event) => { audio.srcObject = event.streams[0]; startLipSync(event.streams[0]); };
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      pc.addTrack(micStream.getAudioTracks()[0]);
      dc = pc.createDataChannel('oai-events');
      dc.addEventListener('open', () => {
        root.classList.add('connected'); status.textContent = 'กำลังฟังคุณอยู่'; voiceLabel.textContent = 'จบการสนทนา';
        addMessage('เชื่อมต่อ Live Voice แล้วค่ะ พูดกับฉันได้เลย 🎙️', 'system');
      });
      dc.addEventListener('message', handleRealtimeEvent);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp });
      if (!response.ok) throw new Error(`Session server returned ${response.status}`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
    } catch (error) {
      console.error(error); addMessage('เชื่อมต่อ Live Voice ไม่สำเร็จ กรุณาตรวจ Worker URL, API key และสิทธิ์ไมโครโฟนค่ะ', 'system');
      disconnectLive(false); status.textContent = 'เชื่อมต่อไม่สำเร็จ';
    }
  }

  async function connectGeminiLive() {
    if (gemini) return disconnectLive();
    const tokenEndpoint = liveConfig.tokenEndpoint?.trim();
    if (!tokenEndpoint) {
      addMessage('ระบบ Gemini Live พร้อมแล้ว แต่ยังต้องใส่ Worker token URL ใน config.js ก่อนค่ะ', 'system');
      status.textContent = 'รอเชื่อม Gemini Live';
      return;
    }
    if (!window.PUREFXAI_AUTH?.user) {
      addMessage('กรุณาเข้าสู่ระบบก่อนใช้งาน Gemini Live เพื่อปกป้องโควตาและบันทึกประวัติของคุณค่ะ', 'system');
      window.PUREFXAI_AUTH?.open?.();
      return;
    }
    const selected = characters[root.dataset.character] || characters.astra;
    const isTranslate = liveMode === 'translate';
    const model = isTranslate ? 'gemini-3.5-live-translate-preview' : 'gemini-3.1-flash-live-preview';
    const instructions = isTranslate
      ? 'Act only as a precise, natural live interpreter. Translate every spoken utterance into English. Preserve tone, intent, names, numbers, and technical terms. Do not answer questions; translate them.'
      : `You are ${selected.name}, ${selected.greeting}. You are the beautiful anime female AI assistant for PUREFXAI in Bangkok. Speak naturally, warmly, and concisely in Thai unless the user speaks another language. You know PUREFXAI services: AI film, generative design, intelligent products, automation, AI strategy, and Gold Intelligence. Never claim to know live market prices unless a connected tool provides them.`;
    try {
      status.textContent = 'กำลังเชื่อม Gemini Live…'; voiceLabel.textContent = 'กำลังเชื่อมต่อ…';
      gemini = new window.GeminiLiveClient({
        tokenEndpoint,
        model,
        mode: liveMode,
        translationTarget: isTranslate ? 'en' : undefined,
        voice: liveConfig.voice,
        getAuthToken: () => window.PUREFXAI_AUTH.getToken(),
        onStatus: state => {
          if (state === 'connected') {
            root.classList.add('connected'); status.textContent = 'Gemini Live · กำลังฟัง'; voiceLabel.textContent = 'จบการสนทนา';
            addMessage(`เชื่อมต่อ ${model} แล้วค่ะ ${isTranslate ? 'เริ่มพูดภาษาไทยเพื่อแปลเป็นอังกฤษได้เลย' : `พูดกับ ${selected.name} ได้เลย`} 🎙️`, 'system');
          } else if (state === 'disconnected' && gemini) {
            root.classList.remove('connected'); status.textContent = 'การเชื่อมต่อสิ้นสุด';
          }
        },
        onTranscript: handleGeminiTranscript,
        onTurnComplete: finishGeminiTurn,
        onInputLevel: level => { if (level > .08) status.textContent = 'Gemini Live · กำลังฟัง…'; },
        onOutputLevel: level => { root.style.setProperty('--talk', Math.min(1, level).toFixed(2)); if (level > .05) status.textContent = `${selected.name} กำลังพูด…`; },
        onError: error => {
          console.error(error); addMessage('Gemini Live เกิดข้อผิดพลาด กรุณาตรวจ Worker, API key และสิทธิ์ไมโครโฟนค่ะ', 'system');
        },
      });
      await gemini.connect(instructions);
    } catch (error) {
      console.error(error); addMessage('เชื่อมต่อ Gemini Live ไม่สำเร็จ กรุณาตรวจ token URL และ API key ใหม่ค่ะ', 'system');
      gemini?.close(); gemini = null; status.textContent = 'เชื่อมต่อไม่สำเร็จ'; voiceLabel.textContent = 'เริ่ม Gemini Live';
    }
  }

  function handleGeminiTranscript(text, type) {
    if (!text) return;
    if (!geminiTranscript[type]) geminiTranscript[type] = addMessage('', `${type}${type === 'bot' ? ' typing' : ''}`);
    geminiTranscript[type].textContent += text;
    messages.scrollTop = messages.scrollHeight;
  }

  function finishGeminiTurn() {
    Object.values(geminiTranscript).forEach(node => node?.classList.remove('typing'));
    geminiTranscript.user = geminiTranscript.bot = null;
    status.textContent = 'Gemini Live · กำลังฟัง';
    root.style.setProperty('--talk', 0);
  }

  function handleRealtimeEvent(event) {
    const data = JSON.parse(event.data);
    if (data.type === 'input_audio_buffer.speech_started') status.textContent = 'กำลังฟัง…';
    if (data.type === 'input_audio_buffer.speech_stopped') status.textContent = 'กำลังคิด…';
    if (data.type === 'response.created') { status.textContent = 'กำลังตอบ…'; transcriptNode = addMessage('', 'bot typing'); }
    const delta = data.delta || data.text || data.transcript;
    if (delta && /transcript\.delta|output_text\.delta/.test(data.type)) {
      if (!transcriptNode) transcriptNode = addMessage('', 'bot typing');
      transcriptNode.textContent += delta; messages.scrollTop = messages.scrollHeight;
    }
    if (/response\.(done|output_audio_transcript\.done)/.test(data.type)) {
      transcriptNode?.classList.remove('typing'); transcriptNode = null; status.textContent = 'กำลังฟังคุณอยู่';
    }
    if (data.type === 'conversation.item.input_audio_transcription.completed' && data.transcript) addMessage(data.transcript, 'user');
    if (data.type === 'error') addMessage(data.error?.message || 'เกิดข้อผิดพลาดในการสนทนา', 'system');
  }

  function startLipSync(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser(); analyser.fftSize = 64;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(bins);
      const level = bins.reduce((a, b) => a + b, 0) / bins.length / 155;
      root.style.setProperty('--talk', Math.min(1, level).toFixed(2));
      speakingFrame = requestAnimationFrame(update);
    }; update();
  }

  function disconnectLive(showMessage = true) {
    gemini?.close(); gemini = null;
    dc?.close(); pc?.close(); micStream?.getTracks().forEach(track => track.stop());
    if (speakingFrame) cancelAnimationFrame(speakingFrame); audioContext?.close();
    pc = dc = micStream = audioContext = analyser = null;
    root.classList.remove('connected'); root.style.setProperty('--talk', 0);
    status.textContent = 'พร้อมช่วยคุณ'; voiceLabel.textContent = liveConfig.provider === 'gemini' ? 'เริ่ม Gemini Live' : 'เริ่ม Live Voice';
    if (showMessage) addMessage('จบการสนทนาด้วยเสียงแล้วค่ะ', 'system');
  }
  voiceButton.addEventListener('click', connectLive);
  addEventListener('beforeunload', () => disconnectLive(false));
})();
