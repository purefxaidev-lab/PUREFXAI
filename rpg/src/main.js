import Phaser from 'phaser';
import { GoogleGenAI, Modality } from '@google/genai';
import './style.css';

const WORLD = { width: 2200, height: 1500 };
const state = { id: null, sessionToken: null, players: {}, mobs: {}, pets: [], hp: 100, maxHp: 100, xp: 0, level: 1, pvp: false, autoFarm: false };
const ui = Object.fromEntries(['loadingScreen','loadingStatus','onlineCount','playerName','level','hpBar','hpText','xpBar','xpText','petCount','petSlots','questProgress','pvpBadge','farmBadge','toast','npcVoice','npcStatus','voiceButton','transcript','npcChatLog','npcChatForm','npcChatInput'].map(id => [id, document.getElementById(id)]));
let socket;
let gameScene;
let toastTimer;
let liveVoice;

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1900);
}

function updateHud() {
  const hp = Math.max(0, state.hp / state.maxHp * 100);
  const required = state.level * 100;
  ui.hpBar.style.width = `${hp}%`;
  ui.hpText.textContent = `${state.hp} / ${state.maxHp}`;
  ui.xpBar.style.width = `${Math.min(100, state.xp / required * 100)}%`;
  ui.xpText.textContent = `${state.xp} / ${required}`;
  ui.level.textContent = state.level;
  ui.petCount.textContent = `${state.pets.length} / 3`;
  ui.questProgress.style.width = state.pets.length ? '100%' : '0%';
  ui.pvpBadge.textContent = state.pvp ? 'PVP ACTIVE' : 'PVP OFF';
  ui.pvpBadge.classList.toggle('active', state.pvp);
  ui.farmBadge.textContent = state.autoFarm ? `AUTO FARM · ${state.farmMinutesLeft || 0}M` : 'AUTO FARM OFF';
  ui.farmBadge.classList.toggle('active', state.autoFarm);
  ui.petSlots.innerHTML = [0,1,2].map(i => {
    const pet = state.pets[i];
    return pet ? `<button class="captured" style="--pet:${pet.color}"><i>${pet.glyph}</i><span>${pet.name} · LV.${pet.level}</span></button>` : '<button><i>+</i><span>EMPTY</span></button>';
  }).join('');
}

function connect() {
  const url = import.meta.env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:${import.meta.env.VITE_WS_PORT || 8080}`;
  socket = new WebSocket(url);
  socket.addEventListener('open', () => {
    const savedName = localStorage.getItem('purefxai-name') || `PURE-${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem('purefxai-name', savedName);
    socket.send(JSON.stringify({ type: 'join', name: savedName }));
    ui.loadingStatus.textContent = 'เชื่อมต่อสำเร็จ · กำลังเข้าสู่โลก';
    setTimeout(() => ui.loadingScreen.classList.add('ready'), 450);
  });
  socket.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'welcome') {
      state.id = msg.id;
      state.sessionToken = msg.sessionToken;
      ui.playerName.textContent = msg.player.name;
    }
    if (msg.type === 'snapshot') {
      state.players = msg.players;
      state.mobs = msg.mobs;
      ui.onlineCount.textContent = Object.keys(msg.players).length;
      const me = msg.players[state.id];
      if (me) Object.assign(state, { hp: me.hp, maxHp: me.maxHp, xp: me.xp, level: me.level, pets: me.pets, pvp: me.pvp, autoFarm: me.autoFarm, farmMinutesLeft: me.farmMinutesLeft });
      updateHud();
      gameScene?.syncWorld(msg);
    }
    if (msg.type === 'event') showToast(msg.message);
  });
  socket.addEventListener('close', () => {
    ui.loadingScreen.classList.remove('ready');
    ui.loadingStatus.textContent = 'การเชื่อมต่อขาดหาย · กำลังลองใหม่';
    setTimeout(connect, 1800);
  });
  socket.addEventListener('error', () => socket.close());
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function bytesToBase64(bytes) {
  let binary='';
  for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary=atob(value);const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}

class GeminiNpcVoice {
  constructor(){this.session=null;this.inputContext=null;this.outputContext=null;this.source=null;this.stream=null;this.nextPlayTime=0;this.active=false;this.transcript='';}
  async start(){
    if(this.active)return this.stop();
    ui.npcStatus.textContent='กำลังขอสิทธิ์ไมโครโฟน…';
    const apiBase=import.meta.env.VITE_API_URL||`${location.protocol}//${location.hostname}:${import.meta.env.VITE_WS_PORT||8080}`;
    const tokenResponse=await fetch(`${apiBase}/api/gemini/token`,{method:'POST',headers:{'content-type':'application/json','x-player-token':state.sessionToken},body:JSON.stringify({playerId:state.id})});
    if(!tokenResponse.ok){const data=await tokenResponse.json().catch(()=>({}));throw new Error(data.error||'ขอ Gemini Live token ไม่สำเร็จ')}
    const {token,model}=await tokenResponse.json();
    this.outputContext=new AudioContext({sampleRate:24000});
    const ai=new GoogleGenAI({apiKey:token,apiVersion:'v1alpha'});
    const gameContext=`ผู้เล่นชื่อ ${ui.playerName.textContent} เลเวล ${state.level} HP ${state.hp}/${state.maxHp} มีสัตว์ในทีม ${state.pets.map(p=>p.name).join(', ')||'ยังไม่มี'} อยู่ในโลก Nexus City`;
    this.session=await ai.live.connect({
      model,
      config:{
        responseModalities:[Modality.AUDIO],
        speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}},
        inputAudioTranscription:{},outputAudioTranscription:{},
        systemInstruction:{parts:[{text:`คุณคือ ASTRA ไกด์สาวของเกม PUREFXAI RPG: Nexus Beasts พูดภาษาไทยเป็นหลัก น้ำเสียงสดใส ฉลาด กระชับ ไม่เกิน 2-3 ประโยคต่อครั้ง ช่วยเรื่องเควสต์ การจับสัตว์ ทีมสัตว์ และโลกในเกมเท่านั้น ห้ามอ้างว่าเป็นมนุษย์ ข้อมูลเกมปัจจุบัน: ${gameContext}`}]}
      },
      callbacks:{
        onopen:()=>this.captureMicrophone(),
        onmessage:message=>this.handleMessage(message),
        onerror:error=>this.fail(error?.message||'Gemini Live error'),
        onclose:()=>this.stop(false)
      }
    });
    this.active=true;ui.npcVoice.classList.add('live');ui.npcStatus.textContent='ASTRA กำลังฟัง · พูดได้เลย';
  }
  async captureMicrophone(){
    this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    this.inputContext=new AudioContext({sampleRate:16000});
    const source=this.inputContext.createMediaStreamSource(this.stream);const processor=this.inputContext.createScriptProcessor(2048,1,1);
    processor.onaudioprocess=event=>{
      if(!this.active||!this.session)return;const float=event.inputBuffer.getChannelData(0);const pcm=new Int16Array(float.length);
      for(let i=0;i<float.length;i++)pcm[i]=Math.max(-32768,Math.min(32767,float[i]*32768));
      this.session.sendRealtimeInput({audio:{data:bytesToBase64(new Uint8Array(pcm.buffer)),mimeType:'audio/pcm;rate=16000'}});
    };
    source.connect(processor);processor.connect(this.inputContext.destination);this.source=processor;
  }
  handleMessage(message){
    const content=message.serverContent;
    if(content?.interrupted)this.stopPlayback();
    const inputText=content?.inputTranscription?.text;const outputText=content?.outputTranscription?.text;
    if(inputText||outputText){this.transcript=(outputText||inputText).trim();ui.transcript.textContent=this.transcript;ui.transcript.classList.toggle('show',Boolean(this.transcript))}
    const parts=content?.modelTurn?.parts||[];
    for(const part of parts){const data=part.inlineData?.data;if(data)this.playPcm(data)}
  }
  playPcm(data){
    const bytes=base64ToBytes(data);const view=new DataView(bytes.buffer);const samples=new Float32Array(bytes.length/2);
    for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
    const buffer=this.outputContext.createBuffer(1,samples.length,24000);buffer.copyToChannel(samples,0);const source=this.outputContext.createBufferSource();source.buffer=buffer;source.connect(this.outputContext.destination);
    this.nextPlayTime=Math.max(this.nextPlayTime,this.outputContext.currentTime);source.start(this.nextPlayTime);this.nextPlayTime+=buffer.duration;ui.npcVoice.classList.add('speaking');source.onended=()=>{if(this.outputContext.currentTime>=this.nextPlayTime-.05)ui.npcVoice.classList.remove('speaking')};
  }
  stopPlayback(){this.nextPlayTime=this.outputContext?.currentTime||0;ui.npcVoice.classList.remove('speaking')}
  fail(message){showToast(message);ui.npcStatus.textContent='เชื่อมต่อเสียงไม่สำเร็จ';this.stop(false)}
  stop(close=true){this.active=false;this.stream?.getTracks().forEach(track=>track.stop());this.source?.disconnect();this.inputContext?.close();if(close)this.session?.close();this.session=null;ui.npcVoice.classList.remove('live','speaking');ui.npcStatus.textContent='เข้าใกล้แล้วกดเพื่อสนทนาด้วยเสียง';}
}

ui.voiceButton.addEventListener('click',async()=>{try{liveVoice||=new GeminiNpcVoice();await liveVoice.start()}catch(error){liveVoice?.fail(error.message)}});

function addChatMessage(role,text){const p=document.createElement('p');p.className=role;p.textContent=text;ui.npcChatLog.appendChild(p);ui.npcChatLog.scrollTop=ui.npcChatLog.scrollHeight}
ui.npcChatForm.addEventListener('submit',async event=>{
  event.preventDefault();const message=ui.npcChatInput.value.trim();if(!message||!state.id)return;
  addChatMessage('user',message);ui.npcChatInput.value='';ui.npcChatInput.disabled=true;ui.npcStatus.textContent='ASTRA กำลังคิดด้วย Gemini 3.5 Flash…';
  try{
    const apiBase=import.meta.env.VITE_API_URL||`${location.protocol}//${location.hostname}:${import.meta.env.VITE_WS_PORT||8080}`;
    const response=await fetch(`${apiBase}/api/npc/chat`,{method:'POST',headers:{'content-type':'application/json','x-player-token':state.sessionToken},body:JSON.stringify({playerId:state.id,message,context:{level:state.level,hp:state.hp,maxHp:state.maxHp,pets:state.pets.map(p=>p.name),pvp:state.pvp}})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'NPC chat failed');addChatMessage('astra',data.reply);
  }catch(error){addChatMessage('astra',`การเชื่อมต่อสะดุด: ${error.message}`)}finally{ui.npcChatInput.disabled=false;ui.npcChatInput.focus();ui.npcStatus.textContent='พิมพ์หรือกดไมค์เพื่อคุยกับฉัน'}
});

class NexusScene extends Phaser.Scene {
  constructor(){ super('Nexus'); this.entities = new Map(); this.lastMove = 0; }
  create() {
    gameScene = this;
    this.createTextures();
    this.cameras.main.setBounds(0,0,WORLD.width,WORLD.height).setZoom(1);
    this.physics.world.setBounds(0,0,WORLD.width,WORLD.height);
    this.drawWorld();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,E,P,F');
    this.input.keyboard.on('keydown-SPACE', () => send({type:'attack'}));
    this.input.keyboard.on('keydown-E', () => send({type:'capture'}));
    this.input.keyboard.on('keydown-P', () => send({type:'togglePvp'}));
    this.input.keyboard.on('keydown-F', () => send({type:'toggleAutoFarm'}));
  }
  createTextures() {
    const g = this.make.graphics({x:0,y:0,add:false});
    g.fillStyle(0x1b2942).fillCircle(32,36,24).fillStyle(0xbcff35).fillTriangle(32,4,18,25,46,25).fillStyle(0x61e9ff).fillCircle(24,34,4).fillCircle(40,34,4).fillStyle(0xffffff).fillRoundedRect(25,44,14,4,2); g.generateTexture('hero',64,68); g.clear();
    g.fillStyle(0x8b67ff).fillCircle(28,32,23).fillStyle(0xc4b6ff).fillTriangle(8,16,19,4,22,20).fillTriangle(34,20,38,4,49,17).fillStyle(0xffffff).fillCircle(20,30,4).fillCircle(36,30,4).fillStyle(0x101526).fillCircle(20,30,2).fillCircle(36,30,2); g.generateTexture('beast',56,58); g.destroy();
  }
  drawWorld() {
    const bg = this.add.graphics();
    bg.fillStyle(0x09101f).fillRect(0,0,WORLD.width,WORLD.height);
    bg.lineStyle(1,0x21304a,.32);
    for(let x=0;x<WORLD.width;x+=64) bg.lineBetween(x,0,x,WORLD.height);
    for(let y=0;y<WORLD.height;y+=64) bg.lineBetween(0,y,WORLD.width,y);
    const zones=[{x:220,y:180,w:520,h:340,c:0x172542},{x:900,y:160,w:660,h:420,c:0x102e33},{x:510,y:780,w:820,h:470,c:0x261b3e}];
    zones.forEach((z,i)=>{bg.fillStyle(z.c,.7).fillRoundedRect(z.x,z.y,z.w,z.h,42);bg.lineStyle(2,[0x61e9ff,0xbcff35,0x9b73ff][i],.28).strokeRoundedRect(z.x,z.y,z.w,z.h,42)});
    this.add.text(275,220,'NEXUS CITY',{fontFamily:'Inter',fontSize:'34px',fontStyle:'bold',color:'#6d819f'}).setAlpha(.4);
    this.add.text(960,210,'VERDANT GRID',{fontFamily:'Inter',fontSize:'34px',fontStyle:'bold',color:'#5e968e'}).setAlpha(.4);
    this.add.text(570,840,'VOID GARDEN · PVP',{fontFamily:'Inter',fontSize:'34px',fontStyle:'bold',color:'#8c6db0'}).setAlpha(.4);
  }
  syncWorld(msg) {
    const alive = new Set();
    Object.values(msg.players).forEach(p => {
      alive.add(`p-${p.id}`);
      let entity = this.entities.get(`p-${p.id}`);
      if(!entity){
        const sprite=this.add.image(p.x,p.y,'hero').setTint(p.id===state.id?0xffffff:0x8aa7d8);
        const name=this.add.text(p.x,p.y-48,p.name,{fontFamily:'Inter',fontSize:'11px',fontStyle:'bold',color:p.pvp?'#ff557c':'#ffffff'}).setOrigin(.5);
        entity={sprite,name,targetX:p.x,targetY:p.y}; this.entities.set(`p-${p.id}`,entity);
        if(p.id===state.id) this.cameras.main.startFollow(sprite,true,.08,.08);
      }
      entity.targetX=p.x; entity.targetY=p.y; entity.name.setText(`${p.pvp?'⚔ ':''}${p.name} · ${p.level}`); entity.name.setColor(p.pvp?'#ff557c':'#ffffff');
    });
    Object.values(msg.mobs).forEach(m => {
      alive.add(`m-${m.id}`);
      let entity=this.entities.get(`m-${m.id}`);
      if(!entity){
        const sprite=this.add.image(m.x,m.y,'beast').setTint(Phaser.Display.Color.HexStringToColor(m.color).color);
        const name=this.add.text(m.x,m.y-42,`${m.name} · ${m.hp}%`,{fontFamily:'Inter',fontSize:'10px',fontStyle:'bold',color:'#d6e3ff'}).setOrigin(.5);
        entity={sprite,name,targetX:m.x,targetY:m.y};this.entities.set(`m-${m.id}`,entity);
      }
      entity.targetX=m.x;entity.targetY=m.y;entity.name.setText(`${m.name} · ${m.hp}%`);
    });
    for(const [key,entity] of this.entities) if(!alive.has(key)){entity.sprite.destroy();entity.name.destroy();this.entities.delete(key)}
  }
  update(time) {
    for(const entity of this.entities.values()){
      entity.sprite.x=Phaser.Math.Linear(entity.sprite.x,entity.targetX,.28); entity.sprite.y=Phaser.Math.Linear(entity.sprite.y,entity.targetY,.28);
      entity.name.setPosition(entity.sprite.x,entity.sprite.y-46);
    }
    if(time-this.lastMove>45){
      const x=(this.keys.D.isDown?1:0)-(this.keys.A.isDown?1:0), y=(this.keys.S.isDown?1:0)-(this.keys.W.isDown?1:0);
      if(x||y) send({type:'move',x,y}); this.lastMove=time;
    }
  }
}

new Phaser.Game({type:Phaser.AUTO,parent:'game',width:1280,height:720,backgroundColor:'#080d18',physics:{default:'arcade'},scene:[NexusScene],scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true,pixelArt:false}});
connect();
updateHud();
