import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {Recipe} from '@/lib/recipe';
import {leafPoint,LEAF_WIDTH} from './book-geometry';

// Dimensions in scene units. The book is constructed around the sewn fold,
// rather than rotating a rigid page about the centre of a rectangular block.
const W=2.42, D=3.22, SPINE=-W/2+.065, LEAF=LEAF_WIDTH;
export function createBookScene(root:HTMLDivElement, recipes:()=>Recipe[], onPage:(n:number)=>void,onBusy:(busy:boolean)=>void){
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'default'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 root.appendChild(renderer.domElement);
 const scene=new T.Scene(), camera=new T.OrthographicCamera(-3,3,2,-2,.1,40);
 camera.position.set(.5,7.6,6.2);camera.lookAt(0,.12,0);
 const pmrem=new T.PMREMGenerator(renderer), room=new RoomEnvironment();
 const env=pmrem.fromScene(room,.06);scene.environment=env.texture;scene.environmentIntensity=.35;
 room.dispose();pmrem.dispose();
 scene.add(new T.HemisphereLight(0xfff7e8,0x594d40,1.15));
 const key=new T.DirectionalLight(0xfff2dc,3.2);key.position.set(-3,6,-1.5);key.castShadow=true;
 key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-5;key.shadow.camera.right=5;
 key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.normalBias=.012;key.shadow.bias=-.00015;
 key.shadow.radius=3;scene.add(key);
 const fill=new T.DirectionalLight(0xe8efff,.75);fill.position.set(4,3,5);scene.add(fill);
 const ground=new T.Mesh(new T.PlaneGeometry(22,22),new T.ShadowMaterial({opacity:.24}));
 ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.012;scene.add(ground);
 const book=new T.Group();book.rotation.y=-.17;scene.add(book);
 const textures=new Set<T.Texture>(), geometries=new Set<T.BufferGeometry>(), materials=new Set<T.Material>();
 function canvas(w:number,h:number){const c=document.createElement('canvas');c.width=w;c.height=h;return {c,ctx:c.getContext('2d')!}}
 function texture(c:HTMLCanvasElement,color=true){const t=new T.CanvasTexture(c);if(color)t.colorSpace=T.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(t);return t}
 let seed=77;function random(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646}
 // Microscopic interlaced warp/weft. Repeated in world scale, independent of lettering.
 const linen=canvas(512,512);linen.ctx.fillStyle='#c7c1b0';linen.ctx.fillRect(0,0,512,512);
 for(let y=0;y<512;y+=4)for(let x=0;x<512;x+=4){const v=168+Math.floor(random()*45);linen.ctx.fillStyle=`rgb(${v},${v},${v})`;linen.ctx.fillRect(x,y,3,3);linen.ctx.fillStyle=(x/4+y/4)%2?'#e0daca':'#a8a18f';linen.ctx.fillRect(x+1,y,1,4)}
 const weave=texture(linen.c,false);weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.repeat.set(3,4);
 const cloth=new T.MeshPhysicalMaterial({color:'#e8e0cd',roughness:.94,bumpMap:weave,bumpScale:.007,sheen:.22,sheenColor:new T.Color('#f8f1df'),sheenRoughness:.9});
 const paper=new T.MeshStandardMaterial({color:'#f5eddc',roughness:1});
 const endpaper=new T.MeshStandardMaterial({color:'#e7ddc7',roughness:1,bumpMap:weave,bumpScale:.002});
 const dark=new T.MeshStandardMaterial({color:'#655d4d',roughness:1});
 const ink='#080909';
 // Tangent-space normals capture the woven threads on the printed face too.
 const normal=canvas(512,512),src=linen.ctx.getImageData(0,0,512,512),out=normal.ctx.createImageData(512,512);
 const heightAt=(x:number,y:number)=>src.data[(((y+512)%512)*512+(x+512)%512)*4]/255;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4;out.data[i]=128+(heightAt(x-1,y)-heightAt(x+1,y))*110;out.data[i+1]=128+(heightAt(x,y-1)-heightAt(x,y+1))*110;out.data[i+2]=255;out.data[i+3]=255}
 normal.ctx.putImageData(out,0,0);const normalMap=texture(normal.c,false);normalMap.wrapS=normalMap.wrapT=T.RepeatWrapping;normalMap.repeat.set(3,4);
 function mesh(geo:T.BufferGeometry,mat:T.Material|T.Material[],parent:T.Object3D=book){geometries.add(geo);(Array.isArray(mat)?mat:[mat]).forEach(m=>materials.add(m));const m=new T.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 function board(parent:T.Object3D,y:number){const b=mesh(new RoundedBoxGeometry(W,.072,D,5,.026),cloth,parent);b.position.set(W/2-.04,y,0);return b}
 function flatShape(width:number,depth:number,radius:number){const s=new T.Shape(),x=-width/2,z=-depth/2;
 s.moveTo(x+radius,z);s.lineTo(x+width-radius,z);s.quadraticCurveTo(x+width,z,x+width,z+radius);s.lineTo(x+width,z+depth-radius);s.quadraticCurveTo(x+width,z+depth,x+width-radius,z+depth);s.lineTo(x+radius,z+depth);s.quadraticCurveTo(x,z+depth,x,z+depth-radius);s.lineTo(x,z+radius);s.quadraticCurveTo(x,z,x+radius,z);
 const g=new T.ShapeGeometry(s,12),p=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+width/2)/width,(p.getY(i)+depth/2)/depth);
 g.rotateX(-Math.PI/2);return g}
 function facing(parent:T.Object3D,mat:T.Material,y:number,width=W-.035,depth=D-.035){const m=mesh(flatShape(width,depth,.035),mat,parent);m.position.set(W/2-.04,y,0);return m}
 const bottom=new T.Group();bottom.position.x=SPINE;book.add(bottom);board(bottom,.035);facing(bottom,endpaper,.073,W-.12,D-.11);
 const hinge=new T.Group();hinge.position.set(SPINE,.51,0);book.add(hinge);board(hinge,0);
 // Printed/debossed cover, in black, with its own relief map. All face lettering
 // uses a single unmirrored UV projection; the fabric remains continuous below it.
 const cover=canvas(1536,2048),bump=canvas(1536,2048);cover.ctx.fillStyle='#e8e0cd';cover.ctx.fillRect(0,0,1536,2048);
 bump.ctx.fillStyle='#bcbcbc';bump.ctx.fillRect(0,0,1536,2048);
 function artwork(ctx:CanvasRenderingContext2D,relief=false){ctx.strokeStyle=relief?'#656565':ink;ctx.fillStyle=relief?'#656565':ink;ctx.textAlign='center';
 ctx.lineWidth=2.5;ctx.strokeRect(110,100,1316,1848);ctx.font='45px Georgia';ctx.fillText('L’ATELIER DES RECETTES',768,340);
 ctx.font='248px Georgia';ctx.fillText('NACRE',768,790);ctx.font='italic 75px Georgia';ctx.fillText('Le goût du partage',768,910);
 ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(644,1565);ctx.bezierCurveTo(730,1400,815,1310,862,1120);ctx.stroke();
 for(let i=0;i<9;i++){const yy=1190+i*36,xx=832-i*18,side=i%2?1:-1;ctx.save();ctx.translate(xx,yy);ctx.rotate(side*.65);ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(side*90,-65,side*105,-25,0,0);ctx.fill();ctx.restore()}
 ctx.font='35px Georgia';ctx.fillText('IMAGINER · CUISINER · TRANSMETTRE',768,1770)}
 artwork(cover.ctx);artwork(bump.ctx,true);
 // The ink is deliberately matte and almost black, not metallic foil.
 const coverMat=new T.MeshPhysicalMaterial({map:texture(cover.c),bumpMap:texture(bump.c,false),bumpScale:.005,normalMap,normalScale:new T.Vector2(.45,.45),roughness:.96,sheen:.12,sheenRoughness:1});
 facing(hinge,coverMat,.0375);
 const inside=facing(hinge,endpaper,-.0375,W-.12,D-.11);inside.rotation.z=Math.PI;
 // A hollow arched spine with shoulders, instead of a cylinder intersecting pages.
 const spineShape=new T.Shape();spineShape.moveTo(SPINE+.035,.08);spineShape.bezierCurveTo(SPINE-.19,.08,SPINE-.19,.44,SPINE+.035,.47);spineShape.lineTo(SPINE+.035,.435);spineShape.bezierCurveTo(SPINE-.14,.42,SPINE-.14,.12,SPINE+.035,.115);spineShape.closePath();
 const spineGeo=new T.ExtrudeGeometry(spineShape,{depth:D-.02,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.008,bevelThickness:.008});spineGeo.translate(0,0,-D/2+.01);const outerSpine=mesh(spineGeo,cloth);
 // Folded signatures and individual paper edges share a shallow concave fore-edge.
 const edges=canvas(1024,512);edges.ctx.fillStyle='#eee5d2';edges.ctx.fillRect(0,0,1024,512);
 for(let y=0;y<512;y+=3){const a=.08+random()*.14;edges.ctx.fillStyle=`rgba(89,74,47,${a})`;edges.ctx.fillRect(0,y,1024,.65+random()*.6);if(y%36===0){edges.ctx.fillStyle='#bcb19c';edges.ctx.fillRect(0,y,1024,1)}}
 for(let i=0;i<14000;i++){edges.ctx.fillStyle=`rgba(116,97,66,${random()*.09})`;edges.ctx.fillRect(random()*1024,random()*512,2,1)}
 const edgeMat=new T.MeshStandardMaterial({map:texture(edges.c),bumpMap:texture(edges.c,false),bumpScale:.003,roughness:1});
 function block(left=false){const g=new T.Group();book.add(g);const width=LEAF,depth=D-.15,height=left?.075:.347,base=.085;
 // Subdivided vertical boundary avoids the perfectly planar edge of a box.
 for(let side=0;side<3;side++){const positions:number[]=[],uvs:number[]=[],indices:number[]=[];const nx=40,ny=12;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny;let x=side===0?width:u*width;let z=side===0?(u-.5)*depth:(side===1?-1:1)*depth/2;
 x-=Math.sin(v*Math.PI)*.014+(side===0?Math.sin(u*Math.PI)*.007:0);z+=side===0?0:Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*.007*(side===1?1:-1);
 positions.push(SPINE+(left?-x:x),base+v*height,z);uvs.push(u,v)}
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;indices.push(a,a+1,a+nx+1,a+1,a+nx+2,a+nx+1)}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();const material=edgeMat.clone();material.side=T.DoubleSide;mesh(geo,material,g)}
 // Fold marks at the head and foot create visible sewn gatherings.
 for(let j=0;j<(left?4:13);j++){const yy=base+j*(height/(left?4:13))+.012;for(const z of [-depth/2-.001,depth/2+.001]){const curve=new T.CatmullRomCurve3([new T.Vector3(SPINE+.035,yy,z),new T.Vector3(SPINE-.035,yy+.009,z),new T.Vector3(SPINE+.035,yy+.02,z)]);mesh(new T.TubeGeometry(curve,8,.0025,3,false),endpaper,g)}}
 return g}
 block();const leftBlock=block(true);leftBlock.visible=false;
 // Woven head/tail bands at the ends of the binding, each thread has real volume.
 for(const z of [-D/2+.095,D/2-.095])for(let i=0;i<24;i++){const a=i/23*Math.PI;const thread=new T.MeshStandardMaterial({color:i%3===0?'#444a3d':'#dad0b6',roughness:.95});const bead=mesh(new T.CapsuleGeometry(.006,.038,2,5),thread);bead.position.set(SPINE-.03-Math.sin(a)*.058,.26+Math.cos(a)*.17,z);bead.rotation.z=-a}
 // Satin ribbon follows the page, then bends over the edge and rests on the counter.
 const ribbonPath=new T.CatmullRomCurve3([new T.Vector3(.57,.438,-.5),new T.Vector3(.59,.438,1.45),new T.Vector3(.61,.35,1.59),new T.Vector3(.65,.025,1.78),new T.Vector3(.69,.008,1.99)]);
 const ribbonGeo=new T.BufferGeometry(),rp:number[]=[],ru:number[]=[],ri:number[]=[];
 for(let i=0;i<=50;i++){const p=ribbonPath.getPoint(i/50);for(const s of [-1,1]){rp.push(p.x+s*.038,p.y+Math.sin(i*.16)*.001,p.z);ru.push((s+1)/2,i/50)}if(i<50){const a=i*2;ri.push(a,a+1,a+2,a+1,a+3,a+2)}}
 ribbonGeo.setAttribute('position',new T.Float32BufferAttribute(rp,3));ribbonGeo.setAttribute('uv',new T.Float32BufferAttribute(ru,2));ribbonGeo.setIndex(ri);ribbonGeo.computeVertexNormals();mesh(ribbonGeo,new T.MeshPhysicalMaterial({color:'#56604b',roughness:.7,sheen:.65,sheenColor:new T.Color('#a8ac87'),side:T.DoubleSide}));
 function pageTexture(index:number,verso=false){const {c,ctx}=canvas(1024,1366);ctx.scale(2/3,2/3);ctx.fillStyle='#f7f0df';ctx.fillRect(0,0,1536,2048);
 for(let i=0;i<18000;i++){ctx.fillStyle=`rgba(106,88,61,${random()*.045})`;ctx.fillRect(random()*1536,random()*2048,1.4,1.4)}
 const gradient=ctx.createLinearGradient(0,0,1536,0);gradient.addColorStop(0,verso?'#59432c00':'#59432c24');gradient.addColorStop(.10,'#59432c00');gradient.addColorStop(.90,'#59432c00');gradient.addColorStop(1,verso?'#59432c24':'#59432c00');ctx.fillStyle=gradient;ctx.fillRect(0,0,1536,2048);
 const all=recipes(),r=all[index%Math.max(1,all.length)];ctx.fillStyle=ink;ctx.textAlign='left';ctx.font='32px Georgia';ctx.fillText('N A C R E   /   LE GRAND LIVRE',135,155);
 function wrap(text:string,x:number,y:number,width:number,line:number,max=99){let row='',cy=y,lines=0;if(cy>1710)return cy;max=Math.min(max,Math.max(1,Math.floor((1740-y)/line)));for(const word of text.split(' ')){if(ctx.measureText(row+word).width>width&&row){ctx.fillText(row.trim(),x,cy);cy+=line;row='';if(++lines>=max)return cy}row+=word+' '}ctx.fillText(row.trim(),x,cy);return cy+line}
 ctx.font='84px Georgia';let y=wrap(r?.title||'Le goût du partage',135,335,1266,98,3);ctx.font='34px Georgia';ctx.fillText(`${(r?.prep||0)+(r?.cook||0)} MIN   ·   ${r?.servings||2} PERSONNES`,135,y+25);ctx.fillRect(135,y+70,1266,1);y+=168;
 ctx.font='52px Georgia';ctx.fillText(verso?'En cuisine':'Les ingrédients',135,y);y+=85;
 if(verso){for(const [i,step] of (r?.steps||[]).slice(0,3).entries()){ctx.font='bold 39px Georgia';y=wrap(`${i+1}. ${step.title}`,135,y,1266,52,2);ctx.font='37px Georgia';y=wrap(step.text,135,y+10,1266,52,5)+48;if(y>1720)break}}
 else {ctx.font='42px Georgia';for(const ingredient of (r?.ingredients||[]).slice(0,10)){y=wrap(`${ingredient.quantity||''} ${ingredient.unit}  ${ingredient.name}`,135,y,1266,59,2)+16;if(y>1730)break}}
 ctx.font='italic 33px Georgia';ctx.fillText(r?.author||'L’atelier Nacre',135,1905);ctx.font='32px Georgia';ctx.textAlign='right';ctx.fillText(String(index+1).padStart(2,'0'),1400,1905);return texture(c)}
 // Curved sheets with a raised gutter, relaxed outer edges and flexible turning.
 function sheet(mat:T.Material){const geo=new T.PlaneGeometry(LEAF,D-.16,56,24);geo.rotateX(-Math.PI/2);geo.translate(LEAF/2,0,0);const original=Float32Array.from(geo.attributes.position.array);const m=mesh(geo,mat);m.position.x=SPINE;return {m,geo,original}}
 const pageMat=(map:T.Texture)=>new T.MeshStandardMaterial({map,roughness:1,side:T.FrontSide});
 const nextMat=pageMat(pageTexture(1)),leftMat=pageMat(pageTexture(0,true)),frontMat=pageMat(pageTexture(0)),backMat=pageMat(pageTexture(0,true));
 const right=sheet(nextMat),left=sheet(leftMat),turn=sheet(frontMat),back=sheet(backMat);backMat.side=T.BackSide;leftMat.side=T.BackSide;
 for(const sheet of [back,left]){const uv=sheet.geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));uv.needsUpdate=true}
 function deform(s:ReturnType<typeof sheet>,theta:number,backside=false){const pos=s.geo.attributes.position;
 for(let i=0;i<pos.count;i++){const [x,y,z]=leafPoint(s.original[i*3]/LEAF,s.original[i*3+2],theta,backside);pos.setXYZ(i,x,y,z)}
 pos.needsUpdate=true;s.geo.computeVertexNormals()}
 deform(right,0);deform(left,Math.PI);deform(turn,0);deform(back,0,true);left.m.visible=false;left.m.position.y=-.005;right.m.position.y=-.006;right.m.visible=false;
 let current=0,opening=0,openTarget=0,turnTime=-1,frame=0,visible=true,disposed=false,pointer=0,last=performance.now(),zoom=1,zoomTarget=1,renderDirty=true,wasBusy=false;
 const busy=(value:boolean)=>{if(value!==wasBusy){wasBusy=value;onBusy(value)}};
 // This albedo is a flat photograph-like linen surface, never a baked view of
 // a book; lighting, thickness, curvature and shadows remain actual geometry.
 new T.TextureLoader().load('./book-cover-albedo.webp',albedo=>{
  if(disposed){albedo.dispose();return}
  albedo.colorSpace=T.SRGBColorSpace;albedo.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(albedo);
  for(const old of [coverMat.map,coverMat.bumpMap]){if(old){textures.delete(old);old.dispose()}}
  coverMat.map=albedo;coverMat.bumpMap=albedo;coverMat.bumpScale=.003;coverMat.needsUpdate=true;renderDirty=true;
 },undefined,()=>{/* The locally drawn cover remains available if the asset fails. */});
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function replace(mat:T.MeshStandardMaterial,index:number,verso=false){const old=mat.map;if(old){textures.delete(old);old.dispose()}mat.map=pageTexture(index,verso);mat.needsUpdate=true}
 function completeTurn(){current=(current+1)%Math.max(recipes().length,1);replace(frontMat,current);replace(backMat,current,true);replace(nextMat,current+1);replace(leftMat,current,true);turnTime=-1;back.m.visible=false;right.m.visible=false;onPage(current)}
 const resize=()=>{renderDirty=true;const r=root.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height));};
 const ro=new ResizeObserver(resize);ro.observe(root);resize();const io=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting});io.observe(root);
 const move=(e:PointerEvent)=>{if(e.pointerType==='mouse'&&!reduced){const r=root.getBoundingClientRect();pointer=(e.clientX-r.left)/r.width-.5}};
 const leave=()=>{pointer=0};root.addEventListener('pointermove',move);root.addEventListener('pointerleave',leave);
 function draw(now:number){if(disposed)return;frame=requestAnimationFrame(draw);const dt=Math.min((now-last)/1000,.04);last=now;if(!visible)return;
 const moving=Math.abs(openTarget-opening)>.0001||Math.abs(zoomTarget-zoom)>.0001||turnTime>=0||Math.abs(book.position.x-opening*LEAF/2)>.0001||Math.abs(book.rotation.y-(-.17*(1-opening)+pointer*.045))>.0001;
 busy(Math.abs(openTarget-opening)>.003||turnTime>=0);if(!moving&&!renderDirty)return;
 const ease=1-Math.exp(-dt*5);opening+=(openTarget-opening)*(reduced?1:ease);zoom+=(zoomTarget-zoom)*(reduced?1:ease);
 const angle=opening*Math.PI;hinge.rotation.z=angle;hinge.position.y=.51-opening*.475;outerSpine.scale.y=1-opening*.78;outerSpine.position.y=opening*.015;
 left.m.visible=leftBlock.visible=opening>.92;back.m.visible=turnTime>=0;right.m.visible=turnTime>=0;
 book.position.x+=(opening*LEAF/2-book.position.x)*(reduced?1:ease);book.rotation.y+=(-.17*(1-opening)+pointer*.045-book.rotation.y)*(reduced?1:ease);
 if(turnTime>=0){turnTime+=dt/1.35;const t=reduced?1:Math.min(turnTime,1),a=Math.PI*(t*t*(3-2*t));deform(turn,a);deform(back,a,true);if(t>=1){completeTurn();deform(turn,0);deform(back,0,true)}}
 const aspect=root.clientWidth/Math.max(1,root.clientHeight),width=3.2+opening*2.2;
 const height=Math.max(3.68,width/aspect)/zoom;camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
 renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);renderDirty=false}frame=requestAnimationFrame(draw);
 const lost=(e:Event)=>{e.preventDefault()};renderer.domElement.addEventListener('webglcontextlost',lost);
 return {flip(){if(openTarget===0){openTarget=1;busy(true);return}if(opening>.98&&turnTime<0){turnTime=0;busy(true)}},close(){openTarget=0;busy(true);if(turnTime>=0){completeTurn();deform(turn,0);deform(back,0,true)}},zoom(value:boolean){zoomTarget=value?1.23:1},dispose(){disposed=true;cancelAnimationFrame(frame);ro.disconnect();io.disconnect();root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',leave);renderer.domElement.removeEventListener('webglcontextlost',lost);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());ground.geometry.dispose();(ground.material as T.Material).dispose();env.dispose();renderer.dispose();renderer.domElement.remove()}};
}
