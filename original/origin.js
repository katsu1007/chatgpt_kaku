const $=id=>document.getElementById(id);
const state={entities:[],zones:[],selected:-1,bounds:null,source:""};
const svgNS="http://www.w3.org/2000/svg";
function setStatus(s){$("status").textContent=s}
function el(tag,attrs={},parent){const n=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(parent)parent.append(n);return n}
function parseDxf(source){
 const lines=source.replace(/\r/g,"").split("\n"),pairs=[];
 for(let i=0;i+1<lines.length;i+=2)pairs.push([lines[i].trim(),lines[i+1].trim()]);
 const out=[];let section="",entity=null;
 const flush=()=>{if(entity){out.push(entity);entity=null}};
 for(const [code,value] of pairs){
  if(code==="0"){flush();if(value==="SECTION"){section="";}else if(value==="ENDSEC"){section="";}else if(["LINE","LWPOLYLINE","TEXT","MTEXT","ARC","CIRCLE"].includes(value)&&section==="ENTITIES")entity={type:value,layer:"0",points:[],raw:[]};}
  else if(code==="2"&&section===""){section=value;}
  else if(entity){entity.raw.push([code,value]);if(code==="8")entity.layer=value;if(code==="10")entity.x=Number(value);if(code==="20")entity.y=Number(value);if(code==="11")entity.x2=Number(value);if(code==="21")entity.y2=Number(value);if(code==="40")entity.radius=Number(value);if(code==="50")entity.start=Number(value);if(code==="51")entity.end=Number(value);if(code==="1"||code==="3")entity.text=(entity.text||"")+value;if(entity.type==="LWPOLYLINE"&&code==="10")entity.points.push({x:Number(value),y:0});if(entity.type==="LWPOLYLINE"&&code==="20"&&entity.points.length)entity.points[entity.points.length-1].y=Number(value);}
 }
 flush();return out.filter(e=>["LINE","LWPOLYLINE","TEXT","MTEXT","ARC","CIRCLE"].includes(e.type));
}
function boundsOf(entities){let xs=[],ys=[];for(const e of entities){if(e.type==="LINE"){xs.push(e.x,e.x2);ys.push(e.y,e.y2)}else if(e.type==="LWPOLYLINE"){for(const p of e.points){xs.push(p.x);ys.push(p.y)}}else if(e.type==="CIRCLE"||e.type==="ARC"){xs.push(e.x-e.radius,e.x+e.radius);ys.push(e.y-e.radius,e.y+e.radius)}else if(Number.isFinite(e.x)&&Number.isFinite(e.y)){xs.push(e.x);ys.push(e.y)}}if(!xs.length)return null;return{x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)}}
function entityBox(e){let b;if(e.type==="LINE")b={x0:Math.min(e.x,e.x2),y0:Math.min(e.y,e.y2),x1:Math.max(e.x,e.x2),y1:Math.max(e.y,e.y2)};else if(e.type==="LWPOLYLINE"&&e.points.length)b={x0:Math.min(...e.points.map(p=>p.x)),y0:Math.min(...e.points.map(p=>p.y)),x1:Math.max(...e.points.map(p=>p.x)),y1:Math.max(...e.points.map(p=>p.y))};else if(e.type==="CIRCLE"||e.type==="ARC")b={x0:e.x-e.radius,y0:e.y-e.radius,x1:e.x+e.radius,y1:e.y+e.radius};else if(Number.isFinite(e.x)&&Number.isFinite(e.y))b={x0:e.x,y0:e.y,x1:e.x,y1:e.y};return b}
function discoverZones(entities,bounds){
 // Spatial island candidates: intentionally kept as candidates, never auto-labelled as rooms.
 const boxes=entities.map((e,i)=>({i,b:entityBox(e)})).filter(x=>x.b);
 if(!boxes.length)return[];
 const span=Math.max(bounds.x1-bounds.x0,bounds.y1-bounds.y0,1),gap=span*.018;
 const parent=boxes.map((_,i)=>i),find=x=>parent[x]===x?x:(parent[x]=find(parent[x]));
 const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i].b,b=boxes[j].b;const dx=Math.max(0,a.x0-b.x1,b.x0-a.x1),dy=Math.max(0,a.y0-b.y1,b.y0-a.y1);if(Math.hypot(dx,dy)<=gap)join(i,j)}
 const groups=new Map();boxes.forEach((x,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x.i)});
 return [...groups.values()].filter(g=>g.length>=2).map((indices,n)=>{const bb=indices.map(i=>entityBox(entities[i]));return{id:n,indices,box:{x0:Math.min(...bb.map(b=>b.x0)),y0:Math.min(...bb.map(b=>b.y0)),x1:Math.max(...bb.map(b=>b.x1)),y1:Math.max(...bb.map(b=>b.y1))}}).sort((a,b)=>(b.indices.length-a.indices.length)).slice(0,40).map((z,i)=>({...z,id:i}));
}
function render(){
 const svg=$("drawing");svg.replaceChildren();const b=state.bounds;if(!b){svg.setAttribute("viewBox","0 0 1200 800");return}
 const pad=Math.max((b.x1-b.x0)*.05,(b.y1-b.y0)*.05,1),w=Math.max(b.x1-b.x0+pad*2,1),h=Math.max(b.y1-b.y0+pad*2,1);
 svg.setAttribute("viewBox",`${b.x0-pad} ${-b.y1-pad} ${w} ${h}`);
 const g=el("g",{transform:"scale(1,-1)"},svg);
 const chosen=state.selected<0?null:state.zones[state.selected],indices=chosen?new Set(chosen.indices):null;
 state.entities.forEach((e,i)=>{if(indices&&!indices.has(i))return;const cls="entity";
  if(e.type==="LINE")el("line",{x1:e.x,y1:e.y,x2:e.x2,y2:e.y2,class:cls},g);
  else if(e.type==="LWPOLYLINE"&&e.points.length>1)el("polyline",{points:e.points.map(p=>p.x+","+p.y).join(" "),class:cls},g);
  else if(e.type==="CIRCLE")el("circle",{cx:e.x,cy:e.y,r:e.radius,class:cls},g);
  else if(e.type==="ARC"){const rad=e.radius,a=e.start*Math.PI/180,c=e.end*Math.PI/180,x1=e.x+rad*Math.cos(a),y1=e.y+rad*Math.sin(a),x2=e.x+rad*Math.cos(c),y2=e.y+rad*Math.sin(c);el("path",{d:`M ${x1} ${y1} A ${rad} ${rad} 0 ${Math.abs(c-a)>Math.PI?1:0} 1 ${x2} ${y2}`,class:cls},g)}
  else if(e.text){const t=el("text",{x:e.x,y:e.y,class:"drawing-text",transform:`scale(1,-1) translate(0 ${-2*e.y})`},svg);t.textContent=e.text}
 });
 if(chosen){const z=chosen.box;el("rect",{x:z.x0,y:-z.y1,width:z.x1-z.x0,height:z.y1-z.y0,class:"zone-frame"},g)}
 $("entityCount").textContent=state.entities.length.toLocaleString();$("zoneCount").textContent=state.zones.length;$("textCount").textContent=state.entities.filter(e=>e.text).length;
 const list=$("zoneList");list.replaceChildren();if(!state.zones.length){list.innerHTML='<div class="empty">区画候補を検出できませんでした。図面全体を表示しています。</div>'}else{const all=document.createElement("button");all.className="zone"+(state.selected<0?" active":"");all.textContent="図面全体";all.onclick=()=>{state.selected=-1;render()};list.append(all);state.zones.forEach((z,i)=>{const btn=document.createElement("button");btn.className="zone"+(state.selected===i?" active":"");btn.innerHTML=`区画候補 ${i+1}<small>${z.indices.length} 要素 · 自動分類前</small>`;btn.onclick=()=>{state.selected=i;render()};list.append(btn)})}
 $("inspection").innerHTML=state.zones.length?`<strong>${state.zones.length} 個の空間クラスター候補</strong><br>これは図形の近接関係による仮区画です。部屋・階・壁・開口として確定するには、寸法・閉領域・文字・レイヤーの照合が必要です。`:"空間クラスター候補なし。図面の縮尺・座標・レイヤーを確認してください。";
}
async function load(file){if(!file)return;state.source=file.name;const ext=file.name.split(".").pop().toLowerCase();$("drawingName").textContent=file.name;setStatus("ファイル判定中");
 if(ext==="jww"||ext==="jwc"){state.entities=[];state.zones=[];state.bounds=null;render();setStatus("JWWデコーダー未接続");$("inspection").textContent="JWWファイルを受け取りましたが、独立したJWWバイナリデコーダーはまだ実装されていません。誤った図形を表示せず、未解析として停止しました。";$("drawingMeta").textContent="JWW · 未解析";return}
 const text=await file.text();let entities=[];
 if(ext==="dxf")entities=parseDxf(text);else if(ext==="svg"){const doc=new DOMParser().parseFromString(text,"image/svg+xml");const vb=doc.documentElement.getAttribute("viewBox");$("inspection").textContent="SVGファイルを受け取りました。SVGの図形要素変換は次段階で追加します。";setStatus("SVG読込・変換待ち");return}else{setStatus("未対応形式");return}
 state.entities=entities;state.bounds=boundsOf(entities);state.zones=state.bounds?discoverZones(entities,state.bounds):[];state.selected=-1;
 $("drawingMeta").textContent=`DXF · ${entities.length.toLocaleString()}要素 · 座標系未確定`;setStatus(entities.length?"図形データ読込完了":"図形データなし");render();
}
$("file").addEventListener("change",e=>load(e.target.files[0]));
const drop=$("drop");drop.addEventListener("dragover",e=>{e.preventDefault();drop.style.outline="2px solid #54d6cf"});drop.addEventListener("dragleave",()=>drop.style.outline="");drop.addEventListener("drop",e=>{e.preventDefault();drop.style.outline="";load(e.dataTransfer.files[0])});
$("fit").onclick=()=>{state.selected=-1;render()};$("reset").onclick=()=>{state.selected=-1;render()};
