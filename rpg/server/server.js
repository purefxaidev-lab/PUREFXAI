import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

const PORT = Number(process.env.PORT || 8080);
const app = express();
app.use(express.json({limit:'16kb'}));
const allowedOrigins=new Set((process.env.ALLOWED_ORIGINS||'http://localhost:5173').split(',').map(x=>x.trim()).filter(Boolean));
app.use((req,res,next)=>{const origin=req.headers.origin;if(origin&&allowedOrigins.has(origin))res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');res.setHeader('access-control-allow-headers','content-type');if(req.method==='OPTIONS')return res.sendStatus(204);next()});
app.get('/health',(_,res)=>res.json({ok:true,game:'PUREFXAI RPG',online:players.size}));
const tokenRate=new Map();
const dailyUsage=new Map();
const dayKey=()=>new Date().toISOString().slice(0,10);
function usageFor(player){const current=dailyUsage.get(player.name);if(!current||current.day!==dayKey()){const fresh={day:dayKey(),textTokens:0,voiceMinutes:0,farmMs:0};dailyUsage.set(player.name,fresh);return fresh}return current}
function authenticatedPlayer(req){const p=players.get(String(req.body?.playerId||''));return p&&req.headers['x-player-token']===p.sessionToken?p:null}
app.post('/api/gemini/token',async(req,res)=>{
  const origin=req.headers.origin;
  if(origin&&!allowedOrigins.has(origin))return res.status(403).json({error:'Origin not allowed'});
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:'Gemini Live ยังไม่ได้ตั้งค่า Secret บนเซิร์ฟเวอร์'});
  if(!authenticatedPlayer(req))return res.status(401).json({error:'Player session ไม่ถูกต้อง'});
  const player=authenticatedPlayer(req);const usage=usageFor(player);const voiceLimit=Number(process.env.DAILY_VOICE_MINUTES||30);if(usage.voiceMinutes+15>voiceLimit)return res.status(429).json({error:`โควตาเสียงวันนี้ครบ ${voiceLimit} นาทีแล้ว`});usage.voiceMinutes+=15;
  const key=req.ip||'unknown';const last=tokenRate.get(key)||0;if(Date.now()-last<15000)return res.status(429).json({error:'กรุณารอ 15 วินาทีก่อนเริ่มเสียงใหม่'});tokenRate.set(key,Date.now());
  try{
    const model=process.env.GEMINI_LIVE_MODEL||'gemini-3.1-flash-live-preview';
    const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{apiVersion:'v1alpha'}});
    const token=await client.authTokens.create({config:{uses:1,expireTime:new Date(Date.now()+30*60*1000).toISOString(),newSessionExpireTime:new Date(Date.now()+60*1000),liveConnectConstraints:{model,config:{responseModalities:['AUDIO'],sessionResumption:{}}},httpOptions:{apiVersion:'v1alpha'}}});
    res.json({token:token.name,model,expiresIn:60});
  }catch(error){console.error('Gemini token error:',error.message);res.status(502).json({error:'สร้าง Gemini Live session ไม่สำเร็จ'})}
});
const npcHistory=new Map();
const chatRate=new Map();
app.post('/api/npc/chat',async(req,res)=>{
  const player=authenticatedPlayer(req);if(!player)return res.status(401).json({error:'Player session ไม่ถูกต้อง'});
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:'Gemini API ยังไม่ได้ตั้งค่า Secret บนเซิร์ฟเวอร์'});
  const message=String(req.body?.message||'').trim().slice(0,240);if(!message)return res.status(400).json({error:'ข้อความว่าง'});
  const usage=usageFor(player);const textLimit=Number(process.env.DAILY_TEXT_TOKEN_LIMIT||20000);if(usage.textTokens>=textLimit)return res.status(429).json({error:`โควตา Gemini วันนี้ครบ ${textLimit.toLocaleString()} tokens แล้ว`});
  const last=chatRate.get(player.id)||0;if(Date.now()-last<900)return res.status(429).json({error:'ส่งข้อความเร็วเกินไป'});chatRate.set(player.id,Date.now());
  const history=npcHistory.get(player.id)||[];
  const context=`ชื่อ ${player.name}, เลเวล ${player.level}, HP ${player.hp}/${player.maxHp}, สัตว์ในทีม ${player.pets.map(p=>p.name).join(', ')||'ยังไม่มี'}, PVP ${player.pvp?'เปิด':'ปิด'}`;
  try{
    const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});const model=process.env.GEMINI_TEXT_MODEL||'gemini-3.5-flash';
    const contents=[...history,{role:'user',parts:[{text:message}]}];
    const response=await client.models.generateContent({model,contents,config:{temperature:.8,maxOutputTokens:220,systemInstruction:`คุณคือ ASTRA ไกด์สาวในเกม PUREFXAI RPG: Nexus Beasts ตอบภาษาไทยเป็นหลัก สดใส ฉลาด กระชับ ไม่เกิน 3 ประโยค ช่วยเรื่องโลกในเกม เควสต์ การต่อสู้ การจับ Nexus Beast และทีมสัตว์ ห้ามสร้างรางวัลหรือแก้ข้อมูลเกมเอง หากผู้เล่นขอการกระทำให้บอกขั้นตอนที่ระบบรองรับ สถานะล่าสุด: ${context}`}});
    const used=Number(response.usageMetadata?.totalTokenCount||message.length/3+String(response.text||'').length/3);usage.textTokens=Math.min(textLimit,usage.textTokens+Math.ceil(used));const reply=String(response.text||'ฉันยังตอบไม่ได้ในตอนนี้ค่ะ').trim();history.push({role:'user',parts:[{text:message}]},{role:'model',parts:[{text:reply}]});npcHistory.set(player.id,history.slice(-10));res.json({reply,model,usage:{used:Math.ceil(used),remaining:Math.max(0,textLimit-usage.textTokens)}});
  }catch(error){console.error('Gemini chat error:',error.message);res.status(502).json({error:'ASTRA เชื่อมต่อ Gemini ไม่สำเร็จ'})}
});
const server=createServer(app);
const wss=new WebSocketServer({server});
const players=new Map();
const sockets=new Map();
const creatures=[
  {name:'Voltbit',color:'#64eaff',glyph:'ϟ',rarity:1},
  {name:'Mossling',color:'#9cff55',glyph:'❋',rarity:1},
  {name:'Emberoo',color:'#ff8161',glyph:'✦',rarity:2},
  {name:'Nyxwing',color:'#a678ff',glyph:'◆',rarity:3}
];
const mobs=new Map();
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function spawnMob(index){
  const base=creatures[index%creatures.length]; const id=randomUUID();
  mobs.set(id,{id,...base,x:260+Math.random()*1550,y:240+Math.random()*1050,hp:100,maxHp:100,level:1+Math.floor(Math.random()*5),vx:(Math.random()-.5)*16,vy:(Math.random()-.5)*16});
}
for(let i=0;i<20;i++) spawnMob(i);

function publicPlayer(p){const usage=usageFor(p),limit=Number(process.env.DAILY_AUTO_FARM_MINUTES||120);return {id:p.id,name:p.name,x:Math.round(p.x),y:Math.round(p.y),hp:p.hp,maxHp:p.maxHp,xp:p.xp,level:p.level,pets:p.pets,pvp:p.pvp,autoFarm:p.autoFarm,farmMinutesLeft:Math.max(0,Math.ceil(limit-usage.farmMs/60000))}}
function snapshot(){return {type:'snapshot',players:Object.fromEntries([...players].map(([id,p])=>[id,publicPlayer(p)])),mobs:Object.fromEntries([...mobs].map(([id,m])=>[id,{...m,hp:Math.round(m.hp)}]))}}
function send(ws,data){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data))}
function event(ws,message){send(ws,{type:'event',message})}
function broadcast(data){const text=JSON.stringify(data);for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(text)}

function levelUp(p){
  while(p.xp>=p.level*100){p.xp-=p.level*100;p.level++;p.maxHp+=12;p.hp=p.maxHp;event(sockets.get(p.id),`LEVEL UP! ตอนนี้คุณเลเวล ${p.level}`)}
}
function nearest(origin,list,max=130){return list.filter(x=>distance(origin,x)<=max).sort((a,b)=>distance(origin,a)-distance(origin,b))[0]}

wss.on('connection',ws=>{
  let playerId=null;
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw)}catch{return}
    if(msg.type==='join'&&!playerId){
      playerId=randomUUID();
      const safeName=String(msg.name||'PURE-HERO').replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,18)||'PURE-HERO';
      const p={id:playerId,sessionToken:randomUUID(),name:safeName,x:420+Math.random()*160,y:380+Math.random()*120,hp:100,maxHp:100,xp:0,level:1,pets:[],pvp:false,autoFarm:false,lastAttack:0,lastCapture:0,nextFarmAttack:0};
      players.set(playerId,p);sockets.set(playerId,ws);send(ws,{type:'welcome',id:playerId,sessionToken:p.sessionToken,player:publicPlayer(p)});event(ws,'ยินดีต้อนรับสู่ NEXUS');return;
    }
    const p=players.get(playerId);if(!p)return;
    if(msg.type==='move'){
      const mag=Math.hypot(Number(msg.x)||0,Number(msg.y)||0)||1;
      p.x=clamp(p.x+(Number(msg.x)||0)/mag*12,40,2160);p.y=clamp(p.y+(Number(msg.y)||0)/mag*12,80,1460);
    }
    if(msg.type==='togglePvp'){p.pvp=!p.pvp;event(ws,p.pvp?'เปิดโหมด PVP แล้ว':'ปิดโหมด PVP แล้ว')}
    if(msg.type==='toggleAutoFarm'){
      const usage=usageFor(p),limit=Number(process.env.DAILY_AUTO_FARM_MINUTES||120)*60000;if(usage.farmMs>=limit){p.autoFarm=false;event(ws,'โควตา Auto Farm วันนี้หมดแล้ว');return}
      p.autoFarm=!p.autoFarm;if(p.autoFarm)p.pvp=false;event(ws,p.autoFarm?'เริ่ม Auto Farm · ระบบจะไม่จับสัตว์และไม่ PVP':'หยุด Auto Farm แล้ว');
    }
    if(msg.type==='attack'&&Date.now()-p.lastAttack>550){
      p.lastAttack=Date.now();
      const rival=p.pvp?nearest(p,[...players.values()].filter(x=>x.id!==p.id&&x.pvp&&x.hp>0),125):null;
      if(rival){
        const damage=10+p.level*2+(p.pets[0]?.level||0);rival.hp=Math.max(0,rival.hp-damage);event(sockets.get(rival.id),`${p.name} โจมตีคุณ ${damage} ดาเมจ`);
        if(!rival.hp){p.xp+=50;rival.hp=rival.maxHp;rival.x=420;rival.y=420;event(ws,`ชนะ PVP กับ ${rival.name} +50 EXP`);levelUp(p)}
      }else{
        const mob=nearest(p,[...mobs.values()].filter(x=>x.hp>0),120);
        if(!mob){event(ws,'ไม่มีเป้าหมายในระยะ');return}
        const damage=14+p.level*3+(p.pets[0]?.level||0);mob.hp=Math.max(0,mob.hp-damage);
        if(!mob.hp){p.xp+=20+mob.level*8;event(ws,`กำจัด ${mob.name} +${20+mob.level*8} EXP`);levelUp(p);mobs.delete(mob.id);setTimeout(()=>spawnMob(Math.floor(Math.random()*creatures.length)),2800)}
      }
    }
    if(msg.type==='capture'&&Date.now()-p.lastCapture>900){
      p.lastCapture=Date.now();
      if(p.pets.length>=3){event(ws,'ทีมสัตว์เลี้ยงเต็มแล้ว');return}
      const mob=nearest(p,[...mobs.values()].filter(x=>x.hp>0),140);
      if(!mob){event(ws,'เข้าใกล้ Nexus Beast ก่อน');return}
      if(mob.hp>35){event(ws,'ลด HP ของสัตว์ให้ต่ำกว่า 35% ก่อนจับ');return}
      const chance=clamp(.72-mob.rarity*.12+(35-mob.hp)/100,.18,.82);
      if(Math.random()<chance){
        p.pets.push({id:randomUUID(),name:mob.name,color:mob.color,glyph:mob.glyph,level:mob.level,rarity:mob.rarity});p.xp+=35;event(ws,`จับ ${mob.name} สำเร็จ!`);mobs.delete(mob.id);levelUp(p);setTimeout(()=>spawnMob(Math.floor(Math.random()*creatures.length)),2400);
      }else event(ws,`${mob.name} หลุดออกจาก Nexus Core`);
    }
  });
  ws.on('close',()=>{if(playerId){players.delete(playerId);sockets.delete(playerId);npcHistory.delete(playerId);chatRate.delete(playerId)}});
});

setInterval(()=>{
  const now=Date.now();
  for(const p of players.values())if(p.autoFarm){
    const usage=usageFor(p),limit=Number(process.env.DAILY_AUTO_FARM_MINUTES||120)*60000;usage.farmMs+=1000/15;if(usage.farmMs>=limit){p.autoFarm=false;event(sockets.get(p.id),'Auto Farm ครบโควตาวันนี้แล้ว');continue}
    const mob=nearest(p,[...mobs.values()].filter(x=>x.hp>0),500);if(!mob)continue;const d=distance(p,mob);
    if(d>105){p.x=clamp(p.x+(mob.x-p.x)/d*3.2,40,2160);p.y=clamp(p.y+(mob.y-p.y)/d*3.2,80,1460)}
    else if(now>=p.nextFarmAttack){p.nextFarmAttack=now+850;mob.hp=Math.max(0,mob.hp-(10+p.level*2+(p.pets[0]?.level||0)));if(!mob.hp){p.xp+=20+mob.level*8;event(sockets.get(p.id),`Auto Farm กำจัด ${mob.name} +${20+mob.level*8} EXP`);levelUp(p);mobs.delete(mob.id);setTimeout(()=>spawnMob(Math.floor(Math.random()*creatures.length)),2800)}}
  }
  for(const mob of mobs.values()){
    mob.x=clamp(mob.x+mob.vx,80,2100);mob.y=clamp(mob.y+mob.vy,100,1400);
    if(Math.random()<.025){mob.vx=(Math.random()-.5)*18;mob.vy=(Math.random()-.5)*18}
  }
  broadcast(snapshot());
},1000/15);

server.listen(PORT,()=>console.log(`PUREFXAI RPG server online on :${PORT}`));
