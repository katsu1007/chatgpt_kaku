import { openCad, prepare, toSvg } from "https://cdn.jsdelivr.net/npm/ezpzfile-cad@0.1.0/dist/index.js";
const $=id=>document.getElementById(id);
const state={drawing:null,sheet:null,prepared:null,layers:[],hidden:new Uint8Array(0),busy:false,rooms:[],roomGrid:null};
function status(s){$("status").textContent=s;}
function setProgress(ratio,message){$("progress").hidden=false;$("progressBar").style.width=Math.max(0,Math.min(100,ratio*100))+"%";if(message)status(message);}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderLayers(){const host=$("layerList");host.replaceChildren();if(!state.layers.length){host.innerHTML='<div class="empty">レイヤー情報がありません。</div>';return;}state.layers.forEach((layer,index)=>{const row=document.createElement("label");row.className="layer-row";const check=document.createElement("input");check.type="checkbox";check.checked=!state.hidden[index];check.addEventListener("change",()=>{state.hidden[index]=check.checked?0:1;renderDrawing();});const name=document.createElement("span");name.className="layer-name";name.textContent=layer.name;const sub=document.createElement("small");sub.className="layer-sub";sub.textContent=(layer.visible?"読込時：表示":"読込時：非表示")+(layer.scale?" · 縮尺 1:"+layer.scale:"");name.append(sub);const count=document.createElement("span");count.className="layer-count";count.textContent=Number(layer.actualItems??layer.items??0).toLocaleString();row.append(check,name,count);host.append(row);});$("allOn").disabled=false;$("allOff").disabled=false;}
function renderDrawing(){if(!state.prepared)return;$("canvas").innerHTML=toSvg(state.prepared,state.hidden);const node=$("canvas").querySelector("svg");if(node){node.style.width="100%";node.style.height="100%";node.style.minWidth="100%";node.style.minHeight="100%";node.setAttribute("preserveAspectRatio","xMidYMid meet");}if(state.rooms.length)renderRooms();}
function showReport(){const d=state.drawing,s=state.sheet,info=d.meta.info||{};$("entityCount").textContent=Number(info.items??s.items.length).toLocaleString();$("layerCount").textContent=state.layers.length.toLocaleString();$("textCount").textContent=s.items.filter(x=>x.kind==="text").length.toLocaleString();const rows=[["形式",d.meta.label||d.meta.format],["バージョン",info.version||"—"],["図面メモ",info.memo||s.name||"—"],["用紙",info.paper||"—"],["縮尺",info.scales||"—"],["シート",d.sheets.length],["解析要素",info.figures??s.items.length],["ブロック定義",info.blocks??"—"],["完全性",s.completeness||"未判定"]];$("meta").innerHTML=rows.map(([k,v])=>"<div><dt>"+esc(k)+"</dt><dd>"+esc(v)+"</dd></div>").join("");const warnings=[...(d.meta.warnings||[]),...(s.warnings||[])];const visible=state.layers.filter(x=>x.visible).length;$("inspection").innerHTML="<strong>読込完了：レイヤー情報を保持</strong><ul><li>レイヤー："+state.layers.length+"件（読込時表示 "+visible+"件）</li><li>図形要素："+s.items.length.toLocaleString()+"件</li><li>座標：mm基準のシート座標</li><li>各要素に元レイヤー名を保持</li></ul>"+(warnings.length?"<strong>警告（"+warnings.length+"件）</strong><ul>"+warnings.slice(0,30).map(w=>"<li>"+esc(w)+"</li>").join("")+"</ul>":"<p>パーサーからの警告はありません。</p>")+"<p class='muted'>※元のJw_cad画面との完全一致は、対象ファイルでの照合が必要です。</p>";}

function detectRooms(){
 if(!state.sheet)return;
 const s=state.sheet,W=s.size.w,H=s.size.h;
 // JWWの座標は用紙上のmm。縮尺図面では部屋面積が実寸m²より極端に小さくなるため、
 // 実寸0.25m²という固定条件では候補が全滅する。ここでは図面上の画素数で候補を残す。
 const aspect=W/Math.max(H,1);
 const nx=Math.max(240,Math.min(1100,Math.round(850*Math.sqrt(aspect))));
 const ny=Math.max(240,Math.min(1100,Math.round(850/Math.sqrt(aspect))));
 const cw=W/nx,ch=H/ny,N=nx*ny,wall=new Uint8Array(N),seen=new Uint8Array(N);
 const mark=(x,y)=>{
  const ix=Math.round(x/cw),iy=Math.round(y/ch);
  // 斜め線の4近傍すり抜けを抑えるため、線を約1セル太らせる
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const xx=ix+dx,yy=iy+dy;
   if(xx>=0&&xx<nx&&yy>=0&&yy<ny)wall[yy*nx+xx]=1;
  }
 };
 const drawLine=(x1,y1,x2,y2)=>{
  const steps=Math.max(1,Math.ceil(Math.hypot((x2-x1)/cw,(y2-y1)/ch)*2));
  for(let k=0;k<=steps;k++){const t=k/steps;mark(x1+(x2-x1)*t,y1+(y2-y1)*t);}
 };
 let usedItems=0,usedLines=0,skippedHidden=0;
 for(const it of s.items){
  if(it.layer!=null){const li=state.layers.findIndex(x=>x.name===it.layer);if(li>=0&&state.hidden[li]){skippedHidden++;continue;}}
  if(it.kind==="line"&&it.pts?.length>=4){
   usedItems++;for(let k=0;k+3<it.pts.length;k+=2){drawLine(it.pts[k],it.pts[k+1],it.pts[k+2],it.pts[k+3]);usedLines++;}
  }else if(it.kind==="arc"&&Number.isFinite(it.r)&&it.r>0){
   usedItems++;const sweep=it.a1-it.a0,n=Math.max(16,Math.ceil(Math.abs(sweep)*it.r/Math.min(cw,ch)*2));
   let px=it.cx+it.r*Math.cos(it.a0),py=it.cy+it.r*Math.sin(it.a0);
   for(let k=1;k<=n;k++){const a=it.a0+sweep*k/n,x=it.cx+it.r*Math.cos(a),y=it.cy+it.r*Math.sin(a);drawLine(px,py,x,y);px=x;py=y;usedLines++;}
  }else if(it.kind==="fill"&&it.pts?.length>=6){
   usedItems++;for(let k=0;k+3<it.pts.length;k+=2){drawLine(it.pts[k],it.pts[k+1],it.pts[k+2],it.pts[k+3]);usedLines++;}
   drawLine(it.pts[it.pts.length-2],it.pts[it.pts.length-1],it.pts[0],it.pts[1]);usedLines++;
  }
 }
 const regions=[],queue=new Int32Array(N);let rid=0;
 for(let p=0;p<N;p++){
  if(wall[p]||seen[p])continue;
  let head=0,tail=0;queue[tail++]=p;seen[p]=1;
  let area=0,sx=0,sy=0,minx=nx,miny=ny,maxx=0,maxy=0;
  while(head<tail){
   const q=queue[head++],x=q%nx,y=(q/nx)|0;area++;sx+=x;sy+=y;
   if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;
   const ns=[x?q-1:-1,x<nx-1?q+1:-1,y?q-nx:-1,y<ny-1?q+nx:-1];
   for(const z of ns)if(z>=0&&!wall[z]&&!seen[z]){seen[z]=1;queue[tail++]=z;}
  }
  regions.push({id:rid++,seed:p,area,cx:sx/area,cy:sy/area,minx,miny,maxx,maxy,touchesEdge:minx===0||miny===0||maxx===nx-1||maxy===ny-1});
 }
 const inside=regions.filter(r=>!r.touchesEdge).sort((a,b)=>b.area-a.area);
 // 旧条件の「0.25m²」は縮尺図面に対して不適切。格子セル数で小さなノイズだけを除外する。
 const viable=inside.filter(r=>r.area>=12&&r.area<=N*.8);
 state.rooms=viable.map((r,i)=>({...r,name:"区画 "+(i+1),drawingAreaCm2:r.area*cw*ch/100}));
 state.roomGrid={ids:null,nx,ny,cw,ch,regions:viable.map(r=>r.id),regionMap:null};
 // region IDs are kept in a compact grid for rendering; rerun flood-fill IDs in one pass.
 const regionMap=new Int32Array(N);regionMap.fill(-1);
 for(const r of viable){
  let head=0,tail=0;const q=new Int32Array(r.area);
  q[tail++]=r.seed;regionMap[r.seed]=r.id;
  while(head<tail){
   const z=q[head++],x=z%nx,y=(z/nx)|0;
   for(const n of [x?z-1:-1,x<nx-1?z+1:-1,y?z-nx:-1,y<ny-1?z+nx:-1]){
    if(n>=0&&regionMap[n]===-1&&!wall[n]){regionMap[n]=r.id;q[tail++]=n;}
   }
  }
 }
 state.roomGrid={ids:regionMap,nx,ny,cw,ch};
 renderRooms();
 const list=state.rooms.map(r=>"<li>"+esc(r.name)+"："+r.drawingAreaCm2.toFixed(1)+" cm²（図面上）</li>").join("");
 const biggest=inside.slice(0,5).map(r=>r.area+"セル"+(r.touchesEdge?"・外周接触":"")).join(" / ")||"なし";
 $("inspection").insertAdjacentHTML("beforeend","<p><strong>区画抽出："+state.rooms.length+"件</strong></p>"+(list?"<ol>"+list+"</ol>":"")+"<p>診断：境界候補 "+usedItems.toLocaleString()+"要素／線分 "+usedLines.toLocaleString()+"本、非表示スキップ "+skippedHidden.toLocaleString()+"要素。格子 "+nx+" × "+ny+"。外周に接する領域 "+regions.filter(r=>r.touchesEdge).length+"件。内部領域 "+inside.length+"件。内部領域上位： "+esc(biggest)+"。</p><p>面積は縮尺換算前の図面上の値。実寸面積ではありません。家具・寸法線などの混入を避けるレイヤー別境界指定は次段階で必要です。</p>");
}
function renderRooms(){
 const svg=$("canvas").querySelector("svg");if(!svg||!state.roomGrid)return;const old=svg.querySelector("#roomOverlay");if(old)old.remove();const oldLabels=svg.querySelector("#roomLabels");if(oldLabels)oldLabels.remove();
 const {ids,nx,ny,cw,ch}=state.roomGrid,H=state.sheet.size.h,g=document.createElementNS("http://www.w3.org/2000/svg","g");g.id="roomOverlay";g.setAttribute("transform","translate(0 "+H+") scale(1 -1)");
 const colors=["#ff6b6b","#4dabf7","#51cf66","#fcc419","#cc5de8","#20c997","#ff922b","#845ef7"];
 for(let ri=0;ri<state.rooms.length;ri++){const room=state.rooms[ri],col=colors[ri%colors.length];let d="";for(let y=room.miny;y<=room.maxy;y++){let x=room.minx;while(x<=room.maxx){while(x<=room.maxx&&ids[y*nx+x]!==room.id)x++;if(x>room.maxx)break;const a=x;while(x<=room.maxx&&ids[y*nx+x]===room.id)x++;d+="M"+(a*cw)+" "+(y*ch)+"h"+((x-a)*cw)+"v"+ch+"h-"+((x-a)*cw)+"z";}}const p=document.createElementNS("http://www.w3.org/2000/svg","path");p.setAttribute("d",d);p.setAttribute("fill",col);p.setAttribute("fill-opacity",".20");p.setAttribute("stroke",col);p.setAttribute("stroke-width",Math.max(cw,ch)*.12);g.append(p);}
 svg.append(g);
 const labels=document.createElementNS("http://www.w3.org/2000/svg","g");labels.id="roomLabels";for(const room of state.rooms){const t=document.createElementNS("http://www.w3.org/2000/svg","text");t.setAttribute("x",room.cx*cw);t.setAttribute("y",H-room.cy*ch);t.setAttribute("text-anchor","middle");t.setAttribute("font-size",Math.max(100,Math.min(350,Math.min(cw,ch)*3)));t.setAttribute("font-weight","bold");t.setAttribute("fill","#111");t.setAttribute("stroke","#fff");t.setAttribute("stroke-width","35");t.setAttribute("paint-order","stroke");t.textContent=room.name;labels.append(t);}svg.append(labels);
 $("toggleRooms").disabled=!state.rooms.length;$("toggleRooms").textContent="区画表示中";
}
async function load(file){if(!file||state.busy)return;state.busy=true;$("drawingName").textContent=file.name;$("drawingMeta").textContent="解析中…";$("fileHint").textContent=(file.size/1024).toFixed(1)+" KB · ブラウザ内解析";$("fit").disabled=true;setProgress(0,"ファイル解析中");try{const bytes=new Uint8Array(await file.arrayBuffer());const drawing=await openCad(bytes,(stage,ratio)=>setProgress(ratio,stage),{name:file.name});if(drawing.kind!=="2d")throw new Error("このファイルは2D図面として読み込めません。");if(!drawing.sheets?.length)throw new Error("図面シートがありません。");state.drawing=drawing;state.sheet=drawing.sheets[0];state.layers=(drawing.layers||[]).map(x=>({...x}));const counts=new Map();for(const item of state.sheet.items){if(item.layer!=null&&item.layer!==""){counts.set(item.layer,(counts.get(item.layer)||0)+1);}}const known=new Set(state.layers.map(x=>x.name));for(const [name,count] of counts){if(!known.has(name)){state.layers.push({name,color:"#000000",visible:true,items:count});known.add(name);}}for(const layer of state.layers){layer.actualItems=counts.get(layer.name)||0;}state.prepared=prepare(state.sheet,state.layers.map(x=>x.name));state.hidden=Uint8Array.from(state.layers.map(x=>x.visible===false?1:0));renderLayers();renderDrawing();showReport();$("drawingMeta").textContent=(drawing.meta.label||drawing.meta.format)+" · "+state.sheet.items.length.toLocaleString()+"要素 · "+state.layers.length+"レイヤー";$("coords").textContent=state.sheet.size.w.toLocaleString()+" × "+state.sheet.size.h.toLocaleString()+" mm";$("fit").disabled=false;$("detectRooms").disabled=false;$("toggleRooms").disabled=true;state.rooms=[];state.roomGrid=null;setProgress(1,"読込完了");$("fileHint").textContent="レイヤーのチェックを切り替えて、図面の構成を確認できます。";}catch(error){state.drawing=null;state.sheet=null;state.prepared=null;state.layers=[];state.hidden=new Uint8Array(0);$("canvas").innerHTML="<div class='placeholder'><strong>読み込みに失敗しました</strong><p>"+esc(error?.message||error)+"</p></div>";$("drawingMeta").textContent="読込失敗";$("entityCount").textContent="—";$("layerCount").textContent="—";$("textCount").textContent="—";$("layerList").innerHTML='<div class="empty">読込成功後にレイヤー一覧が表示されます。</div>';$("inspection").textContent="読込失敗："+(error?.message||error);$("coords").textContent="座標未取得";status("読込失敗");}finally{state.busy=false;}}
$("detectRooms").addEventListener("click",detectRooms);$("toggleRooms").addEventListener("click",()=>{const g=$("canvas").querySelector("#roomOverlay");if(g){g.remove();$("canvas").querySelector("#roomLabels")?.remove();$("toggleRooms").textContent="区画表示";}else renderRooms();});$("file").addEventListener("change",e=>load(e.target.files?.[0]));$("allOn").addEventListener("click",()=>{state.hidden.fill(0);renderLayers();renderDrawing();});$("allOff").addEventListener("click",()=>{state.hidden.fill(1);renderLayers();renderDrawing();});$("fit").addEventListener("click",renderDrawing);
