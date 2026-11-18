/* 新しい図面読み取り（reader2）の回帰テスト。
 * 認識結果の「印・提案」を検証し、既存の積算数量には触れない。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBands, shapeMarks } from '../js/reader2/index.js';
import { score } from '../js/reader2/score.js';
import { groupStats, roleOf, groupRoles } from '../js/reader2/lines.js';

const rect = (i, x0, y0, x1, y1) => ({
  i, area: (x1 - x0) * (y1 - y0),
  poly: [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]
});

test('図枠内の「現況図」「計画図」を段ごとに分割する', () => {
  const bands = splitBands(
    [0,0,20,10],
    [{ t:'現況図', x:1, y:8 }, { t:'計画図', x:1, y:2 }],
    [[0,5,15,5]],
    []
  );
  assert.equal(bands.length, 2);
  assert.deepEqual(bands.map(x => x.title), ['現況図','計画図']);
  assert.deepEqual(bands.map(x => x.kind), ['now','plan']);
  assert.deepEqual(bands[0].box, [0,5,20,10]);
  assert.deepEqual(bands[1].box, [0,0,20,5]);
});

test('段分割は見出しが1つだけなら実行しない', () => {
  assert.equal(splitBands([0,0,20,10], [{t:'現況図',x:1,y:8}], [], []), null);
});

test('細長い区画は部屋と断定せず保留にする', () => {
  const marks = shapeMarks([rect(1,0,0,0.2,2)]);
  assert.equal(marks[1].s, 'hold');
  assert.equal(marks[1].type, 'strip');
});

test('外周の輪が複数区画を囲む時は保留にする', () => {
  const faces = [
    rect(1,0,0,10,10),
    rect(2,1,1,4,4),
    rect(3,6,6,9,9)
  ];
  const marks = shapeMarks(faces);
  assert.equal(marks[1].s, 'hold');
  assert.equal(marks[1].type, 'ring');
});

test('既に付いている除外・保留マークは上書きしない', () => {
  const marks = shapeMarks([rect(1,0,0,0.2,2)], {1:{s:'out',type:'manual'}});
  assert.equal(marks[1], undefined);
});

test('正解部屋が区画に入り、誤った余分区画を数える', () => {
  const faces = [rect(1,0,0,4,3), rect(2,5,0,6,1)];
  const result = score(faces, {}, {
    rooms:[{name:'事務室',pt:[2,1],area:12}],
    notRooms:[{pt:[5.5,0.5],type:'什器'}]
  });
  assert.equal(result.rooms, 1);
  assert.equal(result.ok, 1);
  assert.equal(result.missed, 0);
  assert.equal(result.spurious, 1);
  assert.equal(result.spuriousKinds['什器'], 1);
});

test('正解部屋を除外した場合は重大な roomOut として数える', () => {
  const result = score([rect(1,0,0,4,3)], {1:{s:'out'}}, {
    rooms:[{name:'事務室',pt:[2,1]}]
  });
  assert.equal(result.roomOut, 1);
  assert.equal(result.ok, 0);
});

test('寸法線・図枠線・細線のまとまりを役割候補として分類する', () => {
  const input = {
    groups:[{on:true},{on:true},{on:true},{on:true}],
    segs:[
      ...Array.from({length:220},(_,i)=>[i*0.01,0,i*0.01+0.01,0,0]),
      ...Array.from({length:12},(_,i)=>[0,0,10,0,1]),
      ...Array.from({length:12},(_,i)=>[0,i,10,i,2]),
      ...Array.from({length:12},(_,i)=>[0,i,10,i,3])
    ],
    texts:[{t:'1200',x:5,y:0}]
  };
  const stats = groupStats(input);
  assert.equal(stats.length,4);
  assert.equal(roleOf(stats.find(x=>x.gi===0)), 'tiny');
  assert.equal(roleOf(stats.find(x=>x.gi===1)), 'dim');
  const result = groupRoles(input);
  assert.ok(Object.keys(result.off).includes('0'));
  assert.ok(Object.keys(result.off).includes('1'));
});
