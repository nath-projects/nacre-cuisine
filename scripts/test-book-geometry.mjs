import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const compiled=ts.transpileModule(fs.readFileSync('components/book-geometry.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {leafPoint,LEAF_WIDTH}=await import('data:text/javascript,'+encodeURIComponent(compiled));
let minY=Infinity,maxLengthError=0;
for(let a=0;a<=100;a++){
 const angle=Math.PI*a/100;
 for(const z of [-1.53,0,1.53]){
  let length=0,previous=leafPoint(0,z,angle);
  for(let i=1;i<=200;i++){
   const point=leafPoint(i/200,z,angle);
   assert.ok(point.every(Number.isFinite),'page positions must remain finite');
   minY=Math.min(minY,point[1]);
   length+=Math.hypot(...point.map((n,j)=>n-previous[j]));previous=point;
  }
  maxLengthError=Math.max(maxLengthError,Math.abs(length/LEAF_WIDTH-1));
 }
}
assert.ok(minY>.16,'turning page must never pass through the covers');
assert.ok(maxLengthError<.01,'page length must stay within physical tolerance, including gutter');
assert.ok(Math.abs(leafPoint(1,0,0)[0]-LEAF_WIDTH)<.01,'closed page ends at fore-edge');
assert.ok(leafPoint(1,0,Math.PI)[0]<-2.18,'open page lies on left');
assert.ok(leafPoint(0,0,Math.PI)[1]>.43,'gutter remains raised over binding');
assert.ok(leafPoint(1,0,Math.PI)[1]<.18,'outer page settles on left stack');
for(const a of [0,Math.PI])assert.ok(Math.abs(leafPoint(0,0,a)[1]-leafPoint(0,0,a+1e-6)[1])<1e-5,'animation endpoints must be continuous');
console.log(`PASS book geometry: 303 curves, finite vertices, raised gutter, cover clearance, continuous endpoints; max arc-length difference ${(maxLengthError*100).toFixed(2)}%.`);
