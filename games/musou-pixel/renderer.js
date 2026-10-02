/* Presentation only. World positions, hitboxes, HP and skill rules stay in mira-musou.html. */
"use strict";
window.MusouPixel = (() => {
  const atlases = {};
  let clock = 0, previousHp = 100, hurt = 0, swing = 0;
  const deaths = [], previousEnemies = new Map();
  const config = {
    mira: { rows: 3, height: 304, rowBounds: [0,337,661,1024], anchors: [197,573,956,1350,196,577,966,1345,206,585,950,1355] },
    ninja: { rows: 2, height: 340, split: 804 },
    oni: { rows: 2, height: 344, split: 815 },
    mage: { rows: 2, height: 300, split: 807 },
    bosses: { rows: 3, height: 190, rowBounds: [0,330,635,1024] }
  };
  const load = src => new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めません: " + src)); img.src = src;
  });
  async function atlas(name) {
    const spec = config[name], img = await load("musou-pixel/" + name + ".png");
    const pixelStep = name === "bosses" ? 2 : 4;
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const pixels = x.getImageData(0, 0, c.width, c.height), d = pixels.data;
    // Generated chroma backgrounds can differ slightly from exact #00ff00.
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+1] > 110 && d[i+1] > d[i] * 1.45 && d[i+1] > d[i+2] * 1.45) d[i+3] = 0;
    }
    x.putImageData(pixels, 0, 0);
    const frames = [];
    for (let row = 0; row < spec.rows; row++) for (let col = 0; col < 4; col++) {
      const bounds = row === 1 && spec.split ? [0,384,spec.split,1152,1536] : [0,384,768,1152,1536];
      const left = Math.round(bounds[col] * img.width / 1536), right = Math.round(bounds[col+1] * img.width / 1536);
      const top = spec.rowBounds ? spec.rowBounds[row] : Math.round(row * img.height / spec.rows);
      const bottom = spec.rowBounds ? spec.rowBounds[row+1] : Math.round((row+1) * img.height / spec.rows);
      let minX = right, maxX = left, minY = bottom, maxY = top;
      for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
        if (d[(py * c.width + px) * 4 + 3] > 128) {
          minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        }
      }
      const index = row * 4 + col;
      const frame = document.createElement("canvas");
      frame.width = Math.ceil((right-left)/pixelStep); frame.height = Math.ceil((bottom-top)/pixelStep);
      const fx = frame.getContext("2d"); fx.imageSmoothingEnabled = false;
      fx.drawImage(c,left,top,right-left,bottom-top,0,0,frame.width,frame.height);
      // Body anchor is independent of outstretched weapons, preserving attack reach visually.
      const bodyX = spec.anchors ? spec.anchors[index] * img.width / 1536 : left + (right-left)*.45;
      frames.push({image:frame, ax:(bodyX-left)/pixelStep, ay:(maxY-top+1)/pixelStep, bounds:{minX,maxX,minY,maxY}, source:[left,top,right-left,bottom-top]});
    }
    atlases[name] = {frames, height: spec.height/pixelStep};
  }
  async function init() { await Promise.all(Object.keys(config).map(atlas)); }
  function sprite(ctx,name,frame,x,feet,height,face=1,alpha=1) {
    const a = atlases[name]; if (!a) return;
    const f = a.frames[frame]; if (!f) return;
    const referenceHeight=name==="bosses"?(frame<4?190:frame<8?196:246)/2:a.height;
    const scale = height/referenceHeight;
    ctx.save(); ctx.imageSmoothingEnabled=false; ctx.globalAlpha *= alpha;
    ctx.translate(Math.round(x),Math.round(feet)); ctx.scale(face,1);
    ctx.drawImage(f.image, Math.round(-f.ax*scale),Math.round(-f.ay*scale),Math.round(f.image.width*scale),Math.round(f.image.height*scale));
    ctx.restore();
  }
  function reset(p) { previousHp=p.hp; hurt=0; swing=0; deaths.length=0; previousEnemies.clear(); }
  function attack() { swing=.28; }
  function tick(dt,p,enemies) {
    clock+=dt; hurt=Math.max(0,hurt-dt); swing=Math.max(0,swing-dt);
    if(p.hp<previousHp) { hurt=.26; MusouVoice.play("hurt",2,1.5); }
    previousHp=p.hp;
    const alive=new Set(enemies.map(e=>e.id));
    for(const [id,e] of previousEnemies) if(!alive.has(id)&&e.hp<=0) deaths.push({...e,life:.4});
    previousEnemies.clear(); for(const e of enemies) previousEnemies.set(e.id,e);
    for(const e of deaths) e.life-=dt;
    while(deaths.length&&deaths[0].life<=0) deaths.shift();
  }
  function player(ctx,p,camera) {
    let frame = Math.floor(clock*2)%2;
    if(Math.abs(p.vx)>60) frame=2+Math.floor(clock*10)%4;
    if(!p.ground) frame=9;
    if(swing>0||p.atk>0) frame=swing>.19?6:swing>.07?7:8;
    if(p.special>0) frame=11;
    if(hurt>0) frame=10;
    sprite(ctx,"mira",frame,p.x-camera,p.y+112,196,p.face,p.inv>0&&Math.floor(clock*15)%2?.55:1);
  }
  function enemy(ctx,e,p,camera) {
    const height={ninja:166,oni:204,mage:182}[e.type];
    const face=p.x<e.x?-1:1;
    let frame=Math.floor(clock*9+e.id*.31)%4;
    if(e.attack>0) frame=e.attack>.2?4:5;
    if(e.flash>0) frame=6;
    sprite(ctx,e.type,frame,e.x-camera,e.y+92,height,face);
    if(e.hp<e.maxHp) {
      ctx.fillStyle="#101528";ctx.fillRect(e.x-camera-36,e.y+78-height,72,6);
      ctx.fillStyle="#f08592";ctx.fillRect(e.x-camera-35,e.y+79-height,70*Math.max(0,e.hp/e.maxHp),4);
    }
  }
  function dead(ctx,p,camera) {
    for(const e of deaths) sprite(ctx,e.type,7,e.x-camera,e.y+92,{ninja:166,oni:204,mage:182}[e.type],p.x<e.x?-1:1,Math.min(1,e.life*5));
  }
  function boss(ctx,b,p,camera,stage) {
    const row=stage===1?0:stage===4?2:1;
    let frame=Math.floor(clock*2)%2;
    if(b.attack>0) frame=2; if(b.flash>0) frame=3;
    sprite(ctx,"bosses",row*4+frame,b.x-camera,b.y+154,[0,310,340,365,420][stage],p.x<b.x?-1:1);
  }
  function background(ctx,img,camera,w,h,ground,stage) {
    ctx.fillStyle=stage%2?"#151f3a":"#354761";ctx.fillRect(0,0,w,h);
    if(img) {
      const height=h, width=height*img.width/img.height;
      ctx.imageSmoothingEnabled=false;
      for(let i=-1;i<Math.ceil(w/width)+2;i++) ctx.drawImage(img,Math.round(i*width-camera*.16%width),0,Math.ceil(width)+1,Math.ceil(height));
      const sy=Math.floor(img.height*.79);
      for(let i=-1;i<Math.ceil(w/width)+2;i++)ctx.drawImage(img,0,sy,img.width,img.height-sy,Math.round(i*width-camera%width),Math.round(ground),Math.ceil(width)+1,Math.ceil(h-ground));
      return;
    }
    ctx.fillStyle=stage%2?"#27334b":"#7b8da3";ctx.fillRect(0,ground,w,h-ground);
    ctx.fillStyle=stage%2?"#7f8ba0":"#d3ddeb";ctx.fillRect(0,ground,w,6);
    for(let row=0;row<6;row++) for(let col=-2;col<w/96+2;col++) {
      const x=Math.round(col*96-(camera%96)+(row%2)*48), y=Math.round(ground+8+row*28);
      ctx.fillStyle=stage%2?"#141e34":"#536983";ctx.fillRect(x,y,93,2);ctx.fillRect(x,y,2,27);
      ctx.fillStyle=stage%2?"#36455e":"#92a5b9";ctx.fillRect(x+5,y+5,83,2);
    }
  }
  return {init,sprite,player,enemy,boss,dead,tick,reset,attack,background,atlases,get time(){return clock;}};
})();

window.MusouVoice = (() => {
  const lines={start:"ミラ無双、ゲームスタートです。行きますよ！",attack:"えいっ！","attack-alt":"やあっ！",ultimate:"奥義！",future:"未来視！",skill:"未来は、私が切り開きます！",hurt:"きゃっ！",boss:"強敵です。気をつけて！","stage-clear":"やりました！ 次のステージへ進みましょう。","all-clear":"ゲームクリア、ありがとうございました！","game-over":"大丈夫。もう一度、一緒に挑戦しましょう。","level-up":"レベルアップ！",heal:"回復！"};
  const clips={}, last={}; let current=null, priority=0, enabled=true, paused=false, attackIndex=0, lastAttack=-100, pendingLevel=false;
  const base=new URL("musou-pixel/voice/",document.baseURI);
  function restore(){ const music=document.querySelector("#bgm"); if(music)music.volume=.46; }
  function stop(clearPending=true){ if(clearPending)pendingLevel=false; if(current){current.pause();current.currentTime=0;} current=null;priority=0;restore();const caption=document.querySelector("#voiceCaption");if(caption)caption.textContent=""; }
  function play(name,importance=1,cooldown=2) {
    const now=performance.now()/1000;
    if(!enabled||paused||now-(last[name]??-100)<cooldown)return false;
    if(current&&!current.ended&&priority>=importance){if(name==="level-up")pendingLevel=true;return false;}
    stop(false);last[name]=now;priority=importance;
    const clip=clips[name]||(clips[name]=new Audio(new URL(name+".ogg",base)));
    current=clip;clip.volume=.85;clip.currentTime=0;
    const caption=document.querySelector("#voiceCaption");if(caption)caption.textContent=lines[name];
    document.querySelector("#bgm").volume=.18;
    clip.onended=()=>{if(current===clip){current=null;priority=0;restore();if(caption)caption.textContent="";if(pendingLevel){pendingLevel=false;play("level-up",5,0);}}};
    clip.play().catch(()=>{if(current===clip){current=null;priority=0;restore();if(caption)caption.textContent="";}});
    return true;
  }
  function attack(){
    const now=performance.now()/1000;
    if(now-lastAttack<1.1)return;
    if(play(attackIndex%2 ? "attack-alt" : "attack",1,0)){attackIndex++;lastAttack=now;}
  }
  function pause(value){paused=value;if(current){if(value)current.pause();else current.play().catch(()=>{});}}
  function toggle(){enabled=!enabled;if(!enabled)stop();return enabled;}
  return {play,attack,pause,stop,toggle,lines};
})();
