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
  const endpoint = window.PUREFXAI_CONFIG?.sessionEndpoint?.trim();

  let pc, dc, micStream, audioContext, analyser, speakingFrame;
  let transcriptNode = null;

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
    return node;
  }

  function demoReply(text) {
    const t = text.toLowerCase();
    if (/สวัสดี|hello|hi/.test(t)) return 'สวัสดีค่ะ ✨ ยินดีต้อนรับสู่ PUREFXAI มีอะไรให้ฉันช่วยไหมคะ';
    if (/purefxai|ทำอะไร|บริการ/.test(t)) return 'PUREFXAI เชี่ยวชาญ AI Film, Generative Design, Intelligent Products, Automation และกลยุทธ์ AI ค่ะ';
    if (/ทอง|gold/.test(t)) return 'PUREFXAI พัฒนาระบบ Gold Intelligence สำหรับวิเคราะห์ข้อมูลตลาดและสัญญาณแบบเรียลไทม์ค่ะ';
    return 'ตอนนี้ฉันอยู่ในโหมดสาธิตค่ะ ระบบ Live จะตอบได้เต็มความสามารถเมื่อเชื่อม Worker และ OpenAI API แล้ว';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user'); input.value = '';
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }));
      dc.send(JSON.stringify({ type: 'response.create' }));
      return;
    }
    const typing = addMessage('กำลังคิด', 'bot typing');
    setTimeout(() => { typing.remove(); addMessage(demoReply(text)); }, 650);
  });

  async function connectLive() {
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
    dc?.close(); pc?.close(); micStream?.getTracks().forEach(track => track.stop());
    if (speakingFrame) cancelAnimationFrame(speakingFrame); audioContext?.close();
    pc = dc = micStream = audioContext = analyser = null;
    root.classList.remove('connected'); root.style.setProperty('--talk', 0);
    status.textContent = 'พร้อมช่วยคุณ'; voiceLabel.textContent = 'เริ่ม Live Voice';
    if (showMessage) addMessage('จบการสนทนาด้วยเสียงแล้วค่ะ', 'system');
  }
  voiceButton.addEventListener('click', connectLive);
  addEventListener('beforeunload', () => disconnectLive(false));
})();
