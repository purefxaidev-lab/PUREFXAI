import Phaser from 'phaser';
import './style.css';

const WORLD = { width: 2200, height: 1500 };
const state = { id: null, players: {}, mobs: {}, pets: [], hp: 100, maxHp: 100, xp: 0, level: 1, pvp: false };
const ui = Object.fromEntries(['loadingScreen','loadingStatus','onlineCount','playerName','level','hpBar','hpText','xpBar','xpText','petCount','petSlots','questProgress','pvpBadge','toast'].map(id => [id, document.getElementById(id)]));
let socket;
let gameScene;
let toastTimer;

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
      ui.playerName.textContent = msg.player.name;
    }
    if (msg.type === 'snapshot') {
      state.players = msg.players;
      state.mobs = msg.mobs;
      ui.onlineCount.textContent = Object.keys(msg.players).length;
      const me = msg.players[state.id];
      if (me) Object.assign(state, { hp: me.hp, maxHp: me.maxHp, xp: me.xp, level: me.level, pets: me.pets, pvp: me.pvp });
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

class NexusScene extends Phaser.Scene {
  constructor(){ super('Nexus'); this.entities = new Map(); this.lastMove = 0; }
  create() {
    gameScene = this;
    this.createTextures();
    this.cameras.main.setBounds(0,0,WORLD.width,WORLD.height).setZoom(1);
    this.physics.world.setBounds(0,0,WORLD.width,WORLD.height);
    this.drawWorld();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,E,P');
    this.input.keyboard.on('keydown-SPACE', () => send({type:'attack'}));
    this.input.keyboard.on('keydown-E', () => send({type:'capture'}));
    this.input.keyboard.on('keydown-P', () => send({type:'togglePvp'}));
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
