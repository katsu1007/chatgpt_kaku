import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDxfRooms } from '../js/next-app.js';

const dxf=(units)=>`0
SECTION
2
HEADER
9
$INSUNITS
70
${units}
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
ROOMS
90
4
70
1
10
0
20
0
10
4000
20
0
10
4000
20
3000
10
0
20
3000
0
ENDSEC
0
EOF
`;

test('DXFの閉じた矩形LWPOLYLINEをmmから部屋候補に変換する',()=>{
 const r=parseDxfRooms(dxf(4));
 assert.equal(r.rooms.length,1);
 assert.equal(r.rooms[0].w,4);
 assert.equal(r.rooms[0].d,3);
 assert.equal(r.assumed,false);
});
test('単位未指定のDXFはmm仮定として警告可能な情報を返す',()=>{
 const r=parseDxfRooms(dxf(0));
 assert.equal(r.rooms.length,1);
 assert.equal(r.assumed,true);
});
test('閉じていないポリラインは部屋候補にしない',()=>{
 const s=dxf(4).replace('70\n1','70\n0');
 assert.equal(parseDxfRooms(s).rooms.length,0);
});
