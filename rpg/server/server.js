import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const app = express();
app.get('/health',(_,res)=>res.json({ok:true,game:'PUREFXAI RPG',online:players.size}));
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

function publicPlayer(p){return {id:p.id,name:p.name,x:Math.round(p.x),y:Math.round(p.y),hp:p.hp,maxHp:p.maxHp,xp:p.xp,level:p.level,pets:p.pets,pvp:p.pvp}}
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
      const p={id:playerId,name:safeName,x:420+Math.random()*160,y:380+Math.random()*120,hp:100,maxHp:100,xp:0,level:1,pets:[],pvp:false,lastAttack:0,lastCapture:0};
      players.set(playerId,p);sockets.set(playerId,ws);send(ws,{type:'welcome',id:playerId,player:publicPlayer(p)});event(ws,'ยินดีต้อนรับสู่ NEXUS');return;
    }
    const p=players.get(playerId);if(!p)return;
    if(msg.type==='move'){
      const mag=Math.hypot(Number(msg.x)||0,Number(msg.y)||0)||1;
      p.x=clamp(p.x+(Number(msg.x)||0)/mag*12,40,2160);p.y=clamp(p.y+(Number(msg.y)||0)/mag*12,80,1460);
    }
    if(msg.type==='togglePvp'){p.pvp=!p.pvp;event(ws,p.pvp?'เปิดโหมด PVP แล้ว':'ปิดโหมด PVP แล้ว')}
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
  ws.on('close',()=>{if(playerId){players.delete(playerId);sockets.delete(playerId)}});
});

setInterval(()=>{
  for(const mob of mobs.values()){
    mob.x=clamp(mob.x+mob.vx,80,2100);mob.y=clamp(mob.y+mob.vy,100,1400);
    if(Math.random()<.025){mob.vx=(Math.random()-.5)*18;mob.vy=(Math.random()-.5)*18}
  }
  broadcast(snapshot());
},1000/15);

server.listen(PORT,()=>console.log(`PUREFXAI RPG server online on :${PORT}`));
