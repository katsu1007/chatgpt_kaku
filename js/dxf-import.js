/* DXF ASCII reader: closed rectangular LWPOLYLINEs only; inferred geometry remains a candidate. */
export function parseDxfRooms(source){
 const lines=String(source).replace(/^\\uFEFF/,'').split(/\\r?\\n/), pairs=[];
 for(let i=0;i+1<lines.length;i+=2){const code=lines[i].trim();if(/^\\d+$/.test(code))pairs.push([Number(code),lines[i+1].trim()]);}
 let units=0;for(let i=0;i<pairs.length-1;i++){if(pairs[i][0]===9&&pairs[i][1]==='$INSUNITS'&&pairs[i+1][0]===70){units=Number(pairs[i+1][1]);break}}
 const scales={1:.0254,2:.3048,4:.001,5:.01,6:1,8:.001};const scale=scales[units]||.001;
 let inEntities=false,entity=null,raw=[];
 const flush=()=>{if(!entity)return;if(entity.type==='LWPOLYLINE'&&(entity.flags&1)&&entity.pts.length>=4){const pts=entity.pts,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),w=maxX-minX,h=maxY-minY;const corners=new Set(pts.map(p=>Math.round(p[0]*1e5)+','+Math.round(p[1]*1e5)));const orth=pts.every((p,i)=>{const n=pts[(i+1)%pts.length];return Math.abs(p[0]-n[0])<1e-5||Math.abs(p[1]-n[1])<1e-5});if(corners.size===4&&orth&&w>0&&h>0)raw.push({w:w*scale,d:h*scale,x:minX*scale,y:minY*scale})}entity=null};
 for(const [c,v] of pairs){if(c===0&&v==='SECTION'){flush();inEntities=false;continue}if(c===2&&v==='ENTITIES'){inEntities=true;continue}if(c===0&&v==='ENDSEC'){flush();inEntities=false;continue}if(!inEntities)continue;if(c===0){flush();if(v==='LWPOLYLINE')entity={type:v,flags:0,pts:[]};continue}if(!entity)continue;if(c===70)entity.flags=Number(v);if(c===10)entity.pts.push([Number(v),0]);if(c===20&&entity.pts.length)entity.pts[entity.pts.length-1][1]=Number(v)}
 flush();
 const unique=[];for(const r of raw){if(!unique.some(x=>Math.abs(x.w-r.w)<.001&&Math.abs(x.d-r.d)<.001&&Math.abs(x.x-r.x)<.001&&Math.abs(x.y-r.y)<.001))unique.push(r)}
 return {rooms:unique,units,scale,assumed:!scales[units]};
}
