import { extractRoomHierarchy } from "./room-engine.js?v=20261124-parentarea2";
import { makeDrawingChoices, sliceSheetForFrame } from "./drawing-split.js?v=20261124-split2";
let openCad,prepare,toSvg,findFrames;
let cadImportPromise;
async function ensureCadLibrary(){if(openCad&&prepare&&toSvg)return;if(!cadImportPromise)cadImportPromise=import("https://cdn.jsdelivr.net/npm/ezpzfile-cad@0.1.0/dist/index.js").then(m=>{openCad=m.openCad;prepare=m.prepare;toSvg=m.toSvg;findFrames=m.findFrames;}).catch(e=>{cadImportPromise=null;throw new Error("CAD読込ライブラリを取得できません。通信状態を確認して再読み込みしてください。詳細: "+(e?.message||e));});await cadImportPromise;}
const $=id=>document.getElementById(id);
const state={drawing:null,rawSheet:null,sheet:null,prepared:null,layers:[],hidden:new Uint8Array(0),boundaryLayers:new Set(),busy:false,rooms:[],roomGrid:null,frames:[],frameIndex:-1,choices:[],choiceIndex:-1,sheetIndex:0};
function status(s){$("status").textContent=s;}
function setProgress(ratio,message){$("progress").hidden=false;$("progressBar").style.width=Math.max(0,Math.min(100,ratio*100))+"%";if(message)status(message);}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function activateChoice(index){
 const choice=state.choices[index];if(!choice||!state.drawing)return;
 state.choiceIndex=index;state.sheetIndex=choice.sheetIndex;
 state.rawSheet=state.drawing.sheets[choice.sheetIndex];
 state.frames=typeof findFrames==="function"?findFrames(state.rawSheet)||[]:[];
 state.frameIndex=choice.frameIndex;
 state.sheet=choice.frame? sliceSheetForFrame(state.rawSheet,choice.frame):state.rawSheet;
 state.boundaryLayers.clear();state.rooms=[];state.roomGrid=null;
 const counts=new Map();for(const it of state.sheet.items)if(it.layer!=null)counts.set(it.layer,(counts.get(it.layer)||0)+1);
 state.layers=state.layers.map(l=>({...l,actualItems:counts.get(l.name)||0}));
 state.prepared=prepare(state.sheet,state.layers.map(x=>x.name));
 const select=$("frameSelect");if(select)select.value=String(index);
 renderLayers();renderBoundaryLayers();renderDrawing();showReport();
 $("coords").textContent=state.sheet.size.w.toLocaleString()+" × "+state.sheet.size.h.toLocaleString()+" mm";
 $("drawingMeta").textContent=(state.drawing.meta.label||state.drawing.meta.format)+" · "+state.sheet.items.length.toLocaleString()+"要素 · "+choice.label;
 detectRooms();
}


function renderLayers(){const host=$("layerList");host.replaceChildren();if(!state.layers.length){host.innerHTML='<div class="empty">レイヤー情報がありません。</div>';return;}state.layers.forEach((layer,index)=>{const row=document.createElement("label");row.className="layer-row";const check=document.createElement("input");check.type="checkbox";check.checked=!state.hidden[index];check.addEventListener("change",()=>{state.hidden[index]=check.checked?0:1;renderDrawing();detectRooms();});const name=document.createElement("span");name.className="layer-name";name.textContent=layer.name;const sub=document.createElement("small");sub.className="layer-sub";sub.textContent=(layer.visible?"読込時：表示":"読込時：非表示")+(layer.scale?" · 縮尺 1:"+layer.scale:"");name.append(sub);const count=document.createElement("span");count.className="layer-count";count.textContent=Number(layer.actualItems??layer.items??0).toLocaleString();row.append(check,name,count);host.append(row);});$("allOn").disabled=false;$("allOff").disabled=false;}
function renderBoundaryLayers(){
 const host=$("boundaryLayerList");if(!host)return;host.replaceChildren();
 const q=($("boundarySearch")?.value||"").trim().toLowerCase();
 const filtered=state.layers.filter(l=>!q||String(l.name).toLowerCase().includes(q));
 if(!filtered.length){host.innerHTML='<div class="empty">該当するレイヤーがありません。</div>';}
 for(const layer of filtered){
  const row=document.createElement("label");row.className="boundary-row";
  const cb=document.createElement("input");cb.type="checkbox";cb.checked=state.boundaryLayers.has(layer.name);
  cb.addEventListener("change",()=>{if(cb.checked)state.boundaryLayers.add(layer.name);else state.boundaryLayers.delete(layer.name);updateBoundarySummary();detectRooms();});
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
function showReport(){const d=state.drawing,s=state.sheet,info=d.meta.info||{};$("entityCount").textContent=Number(info.items??s.items.length).toLocaleString();$("layerCount").textContent=state.layers.length.toLocaleString();$("textCount").textContent=s.items.filter(x=>x.kind==="text").length.toLocaleString();const rows=[["形式",d.meta.label||d.meta.format],["図面枠",state.frames.length?state.frames.length+"件検出（選択中 "+(state.frameIndex+1)+"）":"検出なし"],["バージョン",info.version||"—"],["図面メモ",info.memo||s.name||"—"],["用紙",info.paper||"—"],["縮尺",info.scales||"—"],["シート",d.sheets.length],["解析対象",state.choices[state.choiceIndex]?.label||"未選択"],["解析要素",info.figures??s.items.length],["ブロック定義",info.blocks??"—"],["完全性",s.completeness||"未判定"]];$("meta").innerHTML=rows.map(([k,v])=>"<div><dt>"+esc(k)+"</dt><dd>"+esc(v)+"</dd></div>").join("");const warnings=[...(d.meta.warnings||[]),...(s.warnings||[])];const visible=state.layers.filter(x=>x.visible).length;$("inspection").innerHTML="<strong>読込完了：レイヤー情報を保持</strong><ul><li>レイヤー："+state.layers.length+"件（読込時表示 "+visible+"件）</li><li>図形要素："+s.items.length.toLocaleString()+"件</li><li>座標：mm基準のシート座標</li><li>各要素に元レイヤー名を保持</li></ul>"+(warnings.length?"<strong>警告（"+warnings.length+"件）</strong><ul>"+warnings.slice(0,30).map(w=>"<li>"+esc(w)+"</li>").join("")+"</ul>":"<p>パーサーからの警告はありません。</p>")+"<p class='muted'>※元のJw_cad画面との完全一致は、対象ファイルでの照合が必要です。</p>";}

function detectRooms(){
 if(!state.sheet)return;
 try{
  const result=extractRoomHierarchy({
   items:state.sheet.items,width:state.sheet.size.w,height:state.sheet.size.h,
   layers:state.layers,
   selectedLayers:state.boundaryLayers.size?[...state.boundaryLayers]:undefined,
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
  $("inspection").insertAdjacentHTML("beforeend","<p><strong>自動区画抽出："+state.rooms.length+"件</strong></p><p>親区画："+esc(parentText)+"</p>"+(list?"<ol>"+list+"</ol>":"")+"<p>自動判定："+esc(d.autoMode)+"／壁候補レイヤー "+d.wallLayerNames.length+"件／親領域 "+d.parentRegions+"件／内部壁込み領域 "+d.childRegions+"件／線分 "+d.usedSegments.toLocaleString()+"本／寸法線候補除外 "+d.skippedDimensionSegments.toLocaleString()+"本／ドア開口補完 "+d.bridgedDoorGaps.toLocaleString()+"箇所／トイレブース前面補完 "+d.virtualBoothClosures.toLocaleString()+"箇所／端点 "+d.endpointCount.toLocaleString()+"点／広域再判定 "+(d.fallbackUsed?"実行":"未実行")+"。</p>");
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
async function load(file){if(!file||state.busy)return;state.busy=true;state.boundaryLayers.clear();$("drawingName").textContent=file.name;$("drawingMeta").textContent="解析中…";$("fileHint").textContent=(file.size/1024).toFixed(1)+" KB · ブラウザ内解析";$("fit").disabled=true;setProgress(0,"ファイル解析中");try{status("CAD読込ライブラリを準備中");await ensureCadLibrary();const bytes=new Uint8Array(await file.arrayBuffer());const drawing=await openCad(bytes,(stage,ratio)=>setProgress(ratio,stage),{name:file.name});if(drawing.kind!=="2d")throw new Error("このファイルは2D図面として読み込めません。");if(!drawing.sheets?.length)throw new Error("図面シートがありません。");state.drawing=drawing;state.rawSheet=drawing.sheets[0];state.sheet=state.rawSheet;state.frames=[];state.frameIndex=-1;state.choices=makeDrawingChoices(drawing);state.choiceIndex=-1;state.sheetIndex=0;state.layers=(drawing.layers||[]).map(x=>({...x}));const counts=new Map();for(const item of state.sheet.items){if(item.layer!=null&&item.layer!==""){counts.set(item.layer,(counts.get(item.layer)||0)+1);}}const known=new Set(state.layers.map(x=>x.name));for(const [name,count] of counts){if(!known.has(name)){state.layers.push({name,color:"#000000",visible:true,items:count});known.add(name);}}for(const layer of state.layers){layer.actualItems=counts.get(layer.name)||0;}state.hidden=Uint8Array.from(state.layers.map(x=>x.visible===false?1:0));const frameSelect=$("frameSelect");if(frameSelect){frameSelect.replaceChildren();state.choices.forEach((choice,i)=>{const o=document.createElement("option");o.value=String(i);o.textContent=choice.label;frameSelect.append(o);});frameSelect.disabled=state.choices.length<2;}state.prepared=prepare(state.sheet,state.layers.map(x=>x.name));renderLayers();renderBoundaryLayers();renderDrawing();showReport();$("drawingMeta").textContent=(drawing.meta.label||drawing.meta.format)+" · "+state.sheet.items.length.toLocaleString()+"要素 · "+state.layers.length+"レイヤー";$("coords").textContent=state.sheet.size.w.toLocaleString()+" × "+state.sheet.size.h.toLocaleString()+" mm";$("fit").disabled=false;$("detectRooms").disabled=false;$("toggleRooms").disabled=true;state.rooms=[];state.roomGrid=null;setProgress(1,"読込完了");$("fileHint").textContent="図面を読み込みました。区画は自動判定します。";if(state.choices.length){activateChoice(0);}else{detectRooms();}}catch(error){state.drawing=null;state.rawSheet=null;state.sheet=null;state.frames=[];state.frameIndex=-1;state.choices=[];state.choiceIndex=-1;state.prepared=null;state.layers=[];state.hidden=new Uint8Array(0);$("canvas").innerHTML="<div class='placeholder'><strong>読み込みに失敗しました</strong><p>"+esc(error?.message||error)+"</p></div>";$("drawingMeta").textContent="読込失敗";$("entityCount").textContent="—";$("layerCount").textContent="—";$("textCount").textContent="—";$("layerList").innerHTML='<div class="empty">読込成功後にレイヤー一覧が表示されます。</div>';$("inspection").textContent="読込失敗："+(error?.message||error);$("coords").textContent="座標未取得";status("読込失敗");}finally{state.busy=false;}}
$("detectRooms").addEventListener("click",detectRooms);$("frameSelect")?.addEventListener("change",e=>activateChoice(Number(e.target.value)));
$("suggestBoundary").addEventListener("click",suggestBoundaryLayers);
$("clearBoundary").addEventListener("click",()=>{state.boundaryLayers.clear();renderBoundaryLayers();});
$("boundarySearch").addEventListener("input",renderBoundaryLayers);$("toggleRooms").addEventListener("click",()=>{const g=$("canvas").querySelector("#roomOverlay");if(g){g.remove();$("canvas").querySelector("#roomLabels")?.remove();$("toggleRooms").textContent="区画表示";}else renderRooms();});$("file").addEventListener("change",e=>{const file=e.target.files?.[0];if(!file){status("ファイル未選択");return;}status("選択検知："+file.name);$("fileHint").textContent="選択検知："+file.name+" / "+file.size+" bytes";load(file);});$("allOn").addEventListener("click",()=>{state.hidden.fill(0);renderLayers();renderDrawing();detectRooms();});$("allOff").addEventListener("click",()=>{state.hidden.fill(1);renderLayers();renderDrawing();detectRooms();});$("fit").addEventListener("click",renderDrawing);

window.__kakuReady=true;status("起動完了：ファイル選択待ち");
