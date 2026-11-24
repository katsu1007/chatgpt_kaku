import { extractRoomHierarchy } from "./room-engine.js?v=20261124-multiframe1";
let openCad,prepare,toSvg,findFrames;
let cadImportPromise;
async function ensureCadLibrary(){if(openCad&&prepare&&toSvg)return;if(!cadImportPromise)cadImportPromise=import("https://cdn.jsdelivr.net/npm/ezpzfile-cad@0.1.0/dist/index.js").then(m=>{openCad=m.openCad;prepare=m.prepare;toSvg=m.toSvg;findFrames=m.findFrames;}).catch(e=>{cadImportPromise=null;throw new Error("CAD読込ライブラリを取得できません。通信状態を確認して再読み込みしてください。詳細: "+(e?.message||e));});await cadImportPromise;}
const $=id=>document.getElementById(id);
const state={drawing:null,rawSheet:null,sheet:null,prepared:null,layers:[],hidden:new Uint8Array(0),boundaryLayers:new Set(),busy:false,rooms:[],roomGrid:null,frames:[],frameIndex:-1};
function status(s){$("status").textContent=s;}
function setProgress(ratio,message){$("progress").hidden=false;$("progressBar").style.width=Math.max(0,Math.min(100,ratio*100))+"%";if(message)status(message);}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function itemBounds(it){
 if(it.kind==="line"||it.kind==="fill"){const p=it.pts||[];let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let i=0;i+1<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1]);}return [x0,y0,x1,y1];}
 if(it.kind==="arc")return [it.cx-it.r,it.cy-it.r,it.cx+it.r,it.cy+it.r];
 if(it.kind==="text")return [it.x,it.y,it.x+Math.max(1,String(it.text||"").length)*it.size*.6,it.y+it.size];
 if(it.kind==="image")return [it.x,it.y,it.x+it.w,it.y+it.h];
 return [Infinity,Infinity,-Infinity,-Infinity];
}
function clipSegment(x0,y0,x1,y1,b){
 let t0=0,t1=1,dx=x1-x0,dy=y1-y0;
 for(const [p,q] of [[-dx,x0-b[0]],[dx,b[2]-x0],[-dy,y0-b[1]],[dy,b[3]-y0]]){
  if(Math.abs(p)<1e-9){if(q<0)return null;continue;}
  const t=q/p;if(p<0){if(t>t1)return null;if(t>t0)t0=t;}else{if(t<t0)return null;if(t<t1)t1=t;}
 }
 return [x0+t0*dx,y0+t0*dy,x0+t1*dx,y0+t1*dy];
}
function sliceSheetForFrame(source,frame){
 const [x0,y0,x1,y1]=frame,pad=Math.max(x1-x0,y1-y0)*.006,box=[x0-pad,y0-pad,x1+pad,y1+pad],items=[];
 const edgeTol=Math.max(x1-x0,y1-y0)*.0005;
 for(const it of source.items){
  if(it.kind==="line"){
   for(let i=0;i+3<it.pts.length;i+=2){
    const ax=it.pts[i],ay=it.pts[i+1],bx=it.pts[i+2],by=it.pts[i+3];
    // The detected sheet frame itself is not an architectural wall.
    const onFrame=(Math.abs(ay-y0)<edgeTol&&Math.abs(by-y0)<edgeTol)||(Math.abs(ay-y1)<edgeTol&&Math.abs(by-y1)<edgeTol)||(Math.abs(ax-x0)<edgeTol&&Math.abs(bx-x0)<edgeTol)||(Math.abs(ax-x1)<edgeTol&&Math.abs(bx-x1)<edgeTol);
    if(onFrame)continue;
    const c=clipSegment(ax,ay,bx,by,box);
    if(c&&Math.hypot(c[2]-c[0],c[3]-c[1])>edgeTol*.2)items.push({...it,pts:[c[0]-x0,c[1]-y0,c[2]-x0,c[3]-y0]});
   }
   continue;
  }
  const bb=itemBounds(it),cx=(bb[0]+bb[2])/2,cy=(bb[1]+bb[3])/2;
  if(cx<box[0]||cx>box[2]||cy<box[1]||cy>box[3])continue;
  if(it.kind==="fill")items.push({...it,pts:it.pts.map((v,i)=>v-(i%2?y0:x0))});
  else if(it.kind==="arc")items.push({...it,cx:it.cx-x0,cy:it.cy-y0});
  else if(it.kind==="text")items.push({...it,x:it.x-x0,y:it.y-y0});
  else if(it.kind==="image")items.push({...it,x:it.x-x0,y:it.y-y0});
 }
 return {...source,name:"図面枠",size:{w:x1-x0,h:y1-y0},items};
}
function activateFrame(index){
 const raw=state.rawSheet;if(!raw)return;
 state.frameIndex=index;
 state.sheet=index>=0?sliceSheetForFrame(raw,state.frames[index]):raw;
 state.boundaryLayers.clear();state.rooms=[];state.roomGrid=null;
 const counts=new Map();for(const it of state.sheet.items)if(it.layer!=null)counts.set(it.layer,(counts.get(it.layer)||0)+1);
 state.layers=state.layers.map(l=>({...l,actualItems:counts.get(l.name)||0}));
 state.prepared=prepare(state.sheet,state.layers.map(x=>x.name));
 renderLayers();renderBoundaryLayers();renderDrawing();showReport();
 $("coords").textContent=state.sheet.size.w.toLocaleString()+" × "+state.sheet.size.h.toLocaleString()+" mm";
 $("drawingMeta").textContent=(state.drawing.meta.label||state.drawing.meta.format)+" · "+state.sheet.items.length.toLocaleString()+"要素 · "+(index>=0?"図面枠 "+(index+1):"全体");
 detectRooms();
}

function renderLayers(){const host=$("layerList");host.replaceChildren();if(!state.layers.length){host.innerHTML='<div class="empty">レイヤー情報がありません。</div>';return;}state.layers.forEach((layer,index)=>{const row=document.createElement("label");row.className="layer-row";const check=document.createElement("input");check.type="checkbox";check.checked=!state.hidden[index];check.addEventListener("change",()=>{state.hidden[index]=check.checked?0:1;renderDrawing();});const name=document.createElement("span");name.className="layer-name";name.textContent=layer.name;const sub=document.createElement("small");sub.className="layer-sub";sub.textContent=(layer.visible?"読込時：表示":"読込時：非表示")+(layer.scale?" · 縮尺 1:"+layer.scale:"");name.append(sub);const count=document.createElement("span");count.className="layer-count";count.textContent=Number(layer.actualItems??layer.items??0).toLocaleString();row.append(check,name,count);host.append(row);});$("allOn").disabled=false;$("allOff").disabled=false;}
function renderBoundaryLayers(){
 const host=$("boundaryLayerList");if(!host)return;host.replaceChildren();
 const q=($("boundarySearch")?.value||"").trim().toLowerCase();
 const filtered=state.layers.filter(l=>!q||String(l.name).toLowerCase().includes(q));
 if(!filtered.length){host.innerHTML='<div class="empty">該当するレイヤーがありません。</div>';}
 for(const layer of filtered){
  const row=document.createElement("label");row.className="boundary-row";
  const cb=document.createElement("input");cb.type="checkbox";cb.checked=state.boundaryLayers.has(layer.name);
  cb.addEventListener("change",()=>{if(cb.checked)state.boundaryLayers.add(layer.name);else state.boundaryLayers.delete(layer.name);updateBoundarySummary();});
  const name=document.createElement("span");name.textContent=layer.name;
  const count=document.createElement("small");count.textContent=Number(layer.actualItems||0).toLocaleString()+"要素";
  row.append(cb,name,count);host.append(row);
 }
 updateBoundarySummary();
 $("suggestBoundary").disabled=!state.layers.length;$("clearBoundary").disabled=!state.layers.length;$("boundarySearch").disabled=!state.layers.length;
}
function updateBoundarySummary(){
 const n=state.boundaryLayers.size;
 $("boundarySummary").textContent=n+"レイヤー選択中 · "+(n?"このレイヤーの図形だけを区画境界に使用":"未選択：抽出は実行できません");
}
function suggestBoundaryLayers(){
 const re=/(壁|間仕切|躯体|外壁|内壁|壁芯|建築|wall|partition|架台壁)/i;
 state.boundaryLayers=new Set(state.layers.filter(l=>re.test(String(l.name))).map(l=>l.name));
 renderBoundaryLayers();
}
function renderDrawing(){if(!state.prepared)return;$("canvas").innerHTML=toSvg(state.prepared,state.hidden);const node=$("canvas").querySelector("svg");if(node){node.style.width="100%";node.style.height="100%";node.style.minWidth="100%";node.style.minHeight="100%";node.setAttribute("preserveAspectRatio","xMidYMid meet");}if(state.rooms.length)renderRooms();}
function showReport(){const d=state.drawing,s=state.sheet,info=d.meta.info||{};$("entityCount").textContent=Number(info.items??s.items.length).toLocaleString();$("layerCount").textContent=state.layers.length.toLocaleString();$("textCount").textContent=s.items.filter(x=>x.kind==="text").length.toLocaleString();const rows=[["形式",d.meta.label||d.meta.format],["図面枠",state.frames.length?state.frames.length+"件検出（選択中 "+(state.frameIndex+1)+"）":"検出なし"],["バージョン",info.version||"—"],["図面メモ",info.memo||s.name||"—"],["用紙",info.paper||"—"],["縮尺",info.scales||"—"],["シート",d.sheets.length],["解析要素",info.figures??s.items.length],["ブロック定義",info.blocks??"—"],["完全性",s.completeness||"未判定"]];$("meta").innerHTML=rows.map(([k,v])=>"<div><dt>"+esc(k)+"</dt><dd>"+esc(v)+"</dd></div>").join("");const warnings=[...(d.meta.warnings||[]),...(s.warnings||[])];const visible=state.layers.filter(x=>x.visible).length;$("inspection").innerHTML="<strong>読込完了：レイヤー情報を保持</strong><ul><li>レイヤー："+state.layers.length+"件（読込時表示 "+visible+"件）</li><li>図形要素："+s.items.length.toLocaleString()+"件</li><li>座標：mm基準のシート座標</li><li>各要素に元レイヤー名を保持</li></ul>"+(warnings.length?"<strong>警告（"+warnings.length+"件）</strong><ul>"+warnings.slice(0,30).map(w=>"<li>"+esc(w)+"</li>").join("")+"</ul>":"<p>パーサーからの警告はありません。</p>")+"<p class='muted'>※元のJw_cad画面との完全一致は、対象ファイルでの照合が必要です。</p>";}

function detectRooms(){
 if(!state.sheet)return;
 try{
  const result=extractRoomHierarchy({
   items:state.sheet.items,width:state.sheet.size.w,height:state.sheet.size.h,
   layers:state.layers,
   hiddenLayers:state.layers.filter((layer,index)=>state.hidden[index]===1).map(layer=>layer.name)
  });
  state.rooms=result.rooms;
  state.roomGrid=result.grid;
  renderRooms();
  const d=result.diagnostics;
  status("自動区画抽出："+state.rooms.length+"区画");
  if(!state.rooms.length){$("fileHint").textContent="自動判定を実行しましたが、閉じた区画を検出できませんでした。";$("canvas").insertAdjacentHTML("beforeend","<div id=\"roomNotice\" style=\"position:absolute;z-index:5;top:12px;left:12px;right:12px;background:#5b2020;color:white;padding:10px;border-radius:8px\">区画を検出できませんでした。診断情報を確認してください。</div>");}
  const parentText=result.parents.map(p=>p.name+"："+p.children.length+"区画").join(" / ")||"親区画を検出できません";
  const list=state.rooms.map(r=>"<li>"+esc(r.name)+"："+r.drawingAreaCm2.toFixed(1)+" cm²（図面上）</li>").join("");
  $("inspection").insertAdjacentHTML("beforeend","<p><strong>自動区画抽出："+state.rooms.length+"件</strong></p><p>親区画："+esc(parentText)+"</p>"+(list?"<ol>"+list+"</ol>":"")+"<p>自動判定："+esc(d.autoMode)+"／壁候補レイヤー "+d.wallLayerNames.length+"件／親領域 "+d.parentRegions+"件／内部壁込み領域 "+d.childRegions+"件／線分 "+d.usedSegments.toLocaleString()+"本／寸法線候補除外 "+d.skippedDimensionSegments.toLocaleString()+"本／ドア開口補完 "+d.bridgedDoorGaps.toLocaleString()+"箇所／端点 "+d.endpointCount.toLocaleString()+"点／広域再判定 "+(d.fallbackUsed?"実行":"未実行")+"。</p>");
 }catch(error){
  state.rooms=[];state.roomGrid=null;status("区画抽出エラー");
  $("fileHint").textContent="区画抽出エラー："+(error?.message||error);
  $("canvas").insertAdjacentHTML("beforeend","<div style=\"position:absolute;z-index:5;top:12px;left:12px;right:12px;background:#5b2020;color:white;padding:10px;border-radius:8px\">区画抽出エラー："+esc(error?.message||error)+"</div>");
  $("inspection").insertAdjacentHTML("beforeend","<p><strong>区画抽出エラー：</strong>"+esc(error?.stack||error?.message||error)+"</p>");
 }
}
function renderRooms(){
 const svg=$("canvas").querySelector("svg");if(!svg||!state.roomGrid)return;const old=svg.querySelector("#roomOverlay");if(old)old.remove();const oldLabels=svg.querySelector("#roomLabels");if(oldLabels)oldLabels.remove();
 const {ids,nx,ny,cw,ch}=state.roomGrid,H=state.sheet.size.h,g=document.createElementNS("http://www.w3.org/2000/svg","g");g.id="roomOverlay";g.style.pointerEvents="none";g.setAttribute("transform","translate(0 "+H+") scale(1 -1)");
 const colors=["#ff6b6b","#4dabf7","#51cf66","#fcc419","#cc5de8","#20c997","#ff922b","#845ef7"];
 for(let ri=0;ri<state.rooms.length;ri++){const room=state.rooms[ri],col=colors[ri%colors.length];let d="";for(let y=room.miny;y<=room.maxy;y++){let x=room.minx;while(x<=room.maxx){while(x<=room.maxx&&ids[y*nx+x]!==room.id)x++;if(x>room.maxx)break;const a=x;while(x<=room.maxx&&ids[y*nx+x]===room.id)x++;d+="M"+(a*cw)+" "+(y*ch)+"h"+((x-a)*cw)+"v"+ch+"h-"+((x-a)*cw)+"z";}}const p=document.createElementNS("http://www.w3.org/2000/svg","path");p.setAttribute("d",d);p.setAttribute("fill",col);p.setAttribute("fill-opacity",".20");p.setAttribute("stroke",col);p.setAttribute("stroke-width",Math.max(cw,ch)*.04);g.append(p);}
 svg.append(g);
 const labels=document.createElementNS("http://www.w3.org/2000/svg","g");labels.id="roomLabels";for(const room of state.rooms.slice(0,30)){const t=document.createElementNS("http://www.w3.org/2000/svg","text");t.setAttribute("x",(room.labelX??room.cx)*cw);t.setAttribute("y",H-(room.labelY??room.cy)*ch);t.setAttribute("text-anchor","middle");t.setAttribute("font-size",String(Math.max(8,Math.min(14,Math.sqrt(room.area)*.18))));t.setAttribute("font-weight","bold");t.setAttribute("fill","#111");t.setAttribute("stroke","#fff");t.setAttribute("stroke-width","4");t.setAttribute("paint-order","stroke");t.textContent=room.name;labels.append(t);}svg.append(labels);
 $("toggleRooms").disabled=!state.rooms.length;$("toggleRooms").textContent="区画表示中";
}
async function load(file){if(!file||state.busy)return;state.busy=true;state.boundaryLayers.clear();$("drawingName").textContent=file.name;$("drawingMeta").textContent="解析中…";$("fileHint").textContent=(file.size/1024).toFixed(1)+" KB · ブラウザ内解析";$("fit").disabled=true;setProgress(0,"ファイル解析中");try{status("CAD読込ライブラリを準備中");await ensureCadLibrary();const bytes=new Uint8Array(await file.arrayBuffer());const drawing=await openCad(bytes,(stage,ratio)=>setProgress(ratio,stage),{name:file.name});if(drawing.kind!=="2d")throw new Error("このファイルは2D図面として読み込めません。");if(!drawing.sheets?.length)throw new Error("図面シートがありません。");state.drawing=drawing;state.rawSheet=drawing.sheets[0];state.sheet=state.rawSheet;state.frames=typeof findFrames==="function"?findFrames(state.rawSheet):[];state.frameIndex=-1;state.layers=(drawing.layers||[]).map(x=>({...x}));const counts=new Map();for(const item of state.sheet.items){if(item.layer!=null&&item.layer!==""){counts.set(item.layer,(counts.get(item.layer)||0)+1);}}const known=new Set(state.layers.map(x=>x.name));for(const [name,count] of counts){if(!known.has(name)){state.layers.push({name,color:"#000000",visible:true,items:count});known.add(name);}}for(const layer of state.layers){layer.actualItems=counts.get(layer.name)||0;}state.hidden=Uint8Array.from(state.layers.map(x=>x.visible===false?1:0));const frameSelect=$("frameSelect");if(frameSelect){frameSelect.replaceChildren();const all=document.createElement("option");all.value="-1";all.textContent=state.frames.length?"全体表示（"+state.frames.length+"図面枠検出）":"図面枠なし・全体";frameSelect.append(all);state.frames.forEach((f,i)=>{const o=document.createElement("option");o.value=String(i);o.textContent="図面 "+(i+1)+"（"+Math.round(f[2]-f[0])+" × "+Math.round(f[3]-f[1])+"）";frameSelect.append(o);});frameSelect.disabled=!state.frames.length;}state.prepared=prepare(state.sheet,state.layers.map(x=>x.name));renderLayers();renderBoundaryLayers();renderDrawing();showReport();$("drawingMeta").textContent=(drawing.meta.label||drawing.meta.format)+" · "+state.sheet.items.length.toLocaleString()+"要素 · "+state.layers.length+"レイヤー";$("coords").textContent=state.sheet.size.w.toLocaleString()+" × "+state.sheet.size.h.toLocaleString()+" mm";$("fit").disabled=false;$("detectRooms").disabled=false;$("toggleRooms").disabled=true;state.rooms=[];state.roomGrid=null;setProgress(1,"読込完了");$("fileHint").textContent="図面を読み込みました。区画は自動判定します。";detectRooms();if(state.frames.length){activateFrame(0);if(frameSelect)frameSelect.value="0";}else if(frameSelect){frameSelect.value="-1";}}catch(error){state.drawing=null;state.rawSheet=null;state.sheet=null;state.frames=[];state.frameIndex=-1;state.prepared=null;state.layers=[];state.hidden=new Uint8Array(0);$("canvas").innerHTML="<div class='placeholder'><strong>読み込みに失敗しました</strong><p>"+esc(error?.message||error)+"</p></div>";$("drawingMeta").textContent="読込失敗";$("entityCount").textContent="—";$("layerCount").textContent="—";$("textCount").textContent="—";$("layerList").innerHTML='<div class="empty">読込成功後にレイヤー一覧が表示されます。</div>';$("inspection").textContent="読込失敗："+(error?.message||error);$("coords").textContent="座標未取得";status("読込失敗");}finally{state.busy=false;}}
$("detectRooms").addEventListener("click",detectRooms);$("frameSelect")?.addEventListener("change",e=>activateFrame(Number(e.target.value)));
$("suggestBoundary").addEventListener("click",suggestBoundaryLayers);
$("clearBoundary").addEventListener("click",()=>{state.boundaryLayers.clear();renderBoundaryLayers();});
$("boundarySearch").addEventListener("input",renderBoundaryLayers);$("toggleRooms").addEventListener("click",()=>{const g=$("canvas").querySelector("#roomOverlay");if(g){g.remove();$("canvas").querySelector("#roomLabels")?.remove();$("toggleRooms").textContent="区画表示";}else renderRooms();});$("file").addEventListener("change",e=>{const file=e.target.files?.[0];if(!file){status("ファイル未選択");return;}status("選択検知："+file.name);$("fileHint").textContent="選択検知："+file.name+" / "+file.size+" bytes";load(file);});$("allOn").addEventListener("click",()=>{state.hidden.fill(0);renderLayers();renderDrawing();});$("allOff").addEventListener("click",()=>{state.hidden.fill(1);renderLayers();renderDrawing();});$("fit").addEventListener("click",renderDrawing);

window.__kakuReady=true;status("起動完了：ファイル選択待ち");
