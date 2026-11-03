/** Framework-free paper renderer. See README.md for the public API. */
const fontURLs=[['CardCopperplate',new URL('./copperplate.otf',import.meta.url),'600'],['CardBook',new URL('./gothic-book.otf',import.meta.url),'400']];
let fontsReady;
function loadFonts(){return fontsReady??=Promise.all(fontURLs.map(async([name,url,weight])=>{const face=new FontFace(name,`url("${url.href}")`,{weight});await face.load();document.fonts.add(face);})).catch(error=>{fontsReady=undefined;throw error;});}

export async function createMaterialCard(container){
if(!(container instanceof HTMLElement))throw new TypeError('Pass a container element');
await loadFonts();
const host=document.createElement('div');host.style.cssText='width:100%;height:100%;min-height:200px';container.append(host);const shadow=host.attachShadow({mode:'open'});
shadow.innerHTML=`<style>:host{display:block}*{box-sizing:border-box}#stage{position:relative;width:100%;height:100%;min-height:200px;isolation:isolate;touch-action:none;outline:none;cursor:grab}#stage:focus-visible{outline:2px solid var(--card-focus,#65744d);outline-offset:-3px}canvas{display:block;width:100%;height:100%;position:relative;z-index:1}#shadow{position:absolute;left:28%;width:44%;height:7%;top:75%;background:var(--card-shadow,#3d3b29);opacity:.16;filter:blur(27px);border-radius:50%;pointer-events:none}#brushCursor{position:absolute;pointer-events:none;display:none;z-index:3;border:1px solid var(--card-brush,#647c84);border-radius:50%;box-shadow:0 0 0 1px #ffffff70}#stage[data-tool=water],#stage[data-tool=burn],#stage[data-tool=crease]{cursor:crosshair}#fallback{position:absolute;inset:20%;font:16px system-ui;color:var(--card-fallback,#333)}</style><div id="stage" tabindex="0" role="application" aria-label="Interactive paper card. Drag to rotate, scroll to zoom, Shift drag to pan. Arrow keys rotate; plus and minus zoom. Space applies the selected material tool."><div id="shadow"></div><div id="brushCursor"></div><canvas id="view" part="canvas"></canvas><p id="fallback" hidden>3D rendering is unavailable. Please use a browser with WebGL enabled.</p></div>`;
const stage=shadow.querySelector('#stage'),canvas=shadow.querySelector('#view'),fallback=shadow.querySelector('#fallback');
const emit=(name,detail)=>container.dispatchEvent(new CustomEvent(name,{detail}));
const status={set textContent(message){emit('cardstatus',{message});}};
const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
if(!gl){host.remove();throw new Error('WebGL is unavailable in this browser');}
const abort=new AbortController(),textures=[],shaders=[];let destroyed=false;
function listen(target,type,handler,options={}){target.addEventListener(type,handler,{...options,signal:abort.signal});}
try{

await Promise.all([document.fonts.load('600 60px CardCopperplate'),document.fonts.load('400 60px CardBook')]);
const vs=`attribute vec3 p;attribute vec3 n;attribute vec2 uv;attribute float face;uniform mat4 proj;uniform mat4 model;uniform vec2 pan;uniform float distance;varying vec3 wp;varying vec3 normal;varying vec3 tx;varying vec3 ty;varying vec2 vuv;varying float f;void main(){vec4 w=model*vec4(p,1.);wp=w.xyz;normal=mat3(model)*n;tx=mat3(model)*vec3(1.,0.,0.);ty=mat3(model)*vec3(0.,1.,0.);vuv=uv;f=face;vec4 v=w+vec4(pan,-distance,0.);gl_Position=proj*v;}`;
const fs=`precision highp float;
varying vec3 wp;varying vec3 normal;varying vec3 tx;varying vec3 ty;varying vec2 vuv;varying float f;
uniform sampler2D ink;uniform sampler2D paper;uniform sampler2D damage;uniform vec3 light;uniform float raking;uniform float distance;uniform vec2 pan;
float relief(vec2 u){vec4 m=texture2D(ink,u);return -m.g;}
float stock(vec2 u){
vec2 canonical=f>.5&&f<1.5?vec2(1.-u.x,u.y):u;
vec4 state=texture2D(damage,canonical);
float compression=f<.5?texture2D(ink,u).g:0.;
float fiber=texture2D(paper,u*vec2(1.59,1.)).r;
return .5+(fiber-.5)*(1.-compression*.70)*(1.-state.r*.50)*(1.-state.g*.70);
}
void main(){
vec2 materialUV=vec2(wp.x,wp.y); // overwritten with local face coordinates
materialUV=f>.5&&f<1.5?vec2(1.-vuv.x,vuv.y):vuv;
vec4 material=texture2D(damage,materialUV);
float wet=material.r, burned=material.g, heat=material.b, stain=material.a;
float tornThreshold=.88+(texture2D(paper,materialUV*vec2(1.59,1.)).r-.5)*.35+.025*sin(materialUV.x*170.+sin(materialUV.y*90.))*sin(materialUV.y*145.);
if(f<1.5&&burned>tornThreshold)discard;
vec3 N=normalize(normal),T=normalize(tx),B=normalize(ty);if(f>.5&&f<1.5)T=-T;
vec3 L=normalize(light-wp),V=normalize(vec3(-pan,distance)-wp),H=normalize(L+V);
vec2 surfaceUV=vuv;
// Trace the viewing ray into the impression: lettering sits below the stock.
// A shallow cavity changes the apparent position of its floor as the card tilts.
if(f<.5){
vec2 shift=vec2(dot(V,T),dot(V,B))/max(.3,dot(V,normal))*vec2(.0025,.00398);
float depth=0.;vec2 lastUV=vuv;
for(int i=0;i<24;i++){
vec2 q=vuv-shift*depth;
if(depth>=texture2D(ink,q).g)break;
lastUV=q;depth+=1./24.;
}
surfaceUV=mix(lastUV,vuv-shift*depth,.5);
}
float mark=0.,grain=stock(surfaceUV),occlusion=0.,bevel=0.;
if(f<1.5){
vec2 d=vec2(1./1628.,1./1024.);
vec2 grainSlope=vec2(stock(vuv+vec2(d.x,0.))-stock(vuv-vec2(d.x,0.)),stock(vuv+vec2(0.,d.y))-stock(vuv-vec2(0.,d.y)))*1.45;
vec2 letterSlope=vec2(0.);
if(f<.5){
mark=texture2D(ink,surfaceUV).r;
vec2 e=vec2(1./2048.);
letterSlope=vec2(relief(surfaceUV+vec2(e.x,0.))-relief(surfaceUV-vec2(e.x,0.)),relief(surfaceUV+vec2(0.,e.y))-relief(surfaceUV-vec2(0.,e.y)))*4.8;
bevel=length(letterSlope);
vec2 ray=vec2(dot(L,T),dot(L,B))/max(.25,dot(L,N))*vec2(.003,.00477);
float h=relief(surfaceUV);
occlusion=max(0.,relief(surfaceUV+ray)-h)*.68+max(0.,relief(surfaceUV+ray*.5)-h)*.22;
}
N=normalize(N-T*(grainSlope.x*(1.-mark*.84)+letterSlope.x)-B*(grainSlope.y*(1.-mark*.84)+letterSlope.y));
}
float diffuse=max(dot(N,L),0.);
float spec=pow(max(dot(N,H),0.),mix(mix(13.,48.,mark),95.,wet))*mix(mix(.025,.12,mark),.38,wet)*(1.-burned);
vec3 stockColor=vec3(.94,.922,.88)*(.975+grain*.05);
vec3 inkColor=vec3(.067,.056,.064);
stockColor*=1.-wet*.25;
stockColor=mix(stockColor,vec3(.54,.39,.21),stain*.32);
stockColor=mix(stockColor,vec3(.37,.18,.055),smoothstep(.03,.48,burned));
stockColor=mix(stockColor,vec3(.042,.030,.025)*( .72+grain*.5),smoothstep(.35,.85,burned));
vec3 base=mix(stockColor,inkColor,mark*(1.-burned*.7));
if(f>1.5)base*=.83+.022*sin(vuv.y*1100.);
vec3 col=base*(.38+.65*diffuse)*(1.-min(occlusion,.85))+vec3(1.,.96,.9)*spec;
// The thin bevel catches the source even where the ink itself is dark.
col+=vec3(.8,.77,.70)*pow(max(dot(N,H),0.),18.)*min(bevel,1.)*.23;
float ember=smoothstep(.80,.88,burned)*(1.-smoothstep(.88,.97,burned))*smoothstep(.4,.9,heat);
col+=vec3(1.,.18,.012)*ember*.8;
gl_FragColor=vec4(col,1.);
}`;
function shader(type,src){let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));shaders.push(s);return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const verts=[];function quad(a,b,c,d,n,face){let points=[a,b,c,a,c,d],uvs=[[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]];points.forEach((p,i)=>verts.push(...p,...n,...uvs[i],face));}
const x=3.5,y=2.2,z=.012;
const GX=48,GY=30;
for(let j=0;j<GY;j++)for(let i=0;i<GX;i++){
let a=-x+2*x*i/GX,b=-x+2*x*(i+1)/GX,c=-y+2*y*j/GY,d=-y+2*y*(j+1)/GY;
quad([a,c,z],[b,c,z],[b,d,z],[a,d,z],[0,0,1],0);
quad([b,c,-z],[a,c,-z],[a,d,-z],[b,d,-z],[0,0,-1],1);
}
// Face UVs refer to the whole sheet, not to individual grid cells.
for(let i=0;i<verts.length;i+=9){verts[i+6]=verts[i+8]===0?(verts[i]+x)/(2*x):1.-(verts[i]+x)/(2*x);verts[i+7]=(verts[i+1]+y)/(2*y);}
for(let i=0;i<GX;i++){let a=-x+2*x*i/GX,b=-x+2*x*(i+1)/GX;quad([a,-y,-z],[b,-y,-z],[b,-y,z],[a,-y,z],[0,-1,0],2);quad([a,y,z],[b,y,z],[b,y,-z],[a,y,-z],[0,1,0],2);}
for(let j=0;j<GY;j++){let a=-y+2*y*j/GY,b=-y+2*y*(j+1)/GY;quad([x,a,z],[x,a,-z],[x,b,-z],[x,b,z],[1,0,0],2);quad([-x,a,-z],[-x,a,z],[-x,b,z],[-x,b,-z],[-1,0,0],2);}
const restVerts=new Float32Array(verts),liveVerts=new Float32Array(verts);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,liveVerts,gl.DYNAMIC_DRAW);
[['p',3,0],['n',3,3],['uv',2,6],['face',1,8]].forEach(([name,size,offset])=>{let a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,36,offset*4);});
function texture(c,unit,repeat){gl.activeTexture(gl.TEXTURE0+unit);let t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);if(!repeat){gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}}
let print=document.createElement('canvas');print.width=print.height=2048;let ctx=print.getContext('2d');ctx.scale(1,2048/1285);ctx.fillStyle='black';ctx.fillRect(0,0,2048,1285);ctx.fillStyle='white';ctx.textBaseline='alphabetic';
function text(t,x,y,size,align='left',spacing=0,book=false){ctx.font=(book?'400 ':'600 ')+size+'px '+(book?'CardBook':'CardCopperplate');ctx.textAlign=align;if(!spacing){ctx.fillText(t,x,y);return;}let width=ctx.measureText(t).width+spacing*(t.length-1);let pos=align==='center'?x-width/2:align==='right'?x-width:x;ctx.textAlign='left';for(let char of t){ctx.fillText(char,pos,y);pos+=ctx.measureText(char).width+spacing;}}
text('212.555.6342',180,205,64);
text('PIERCE & PIERCE',1865,190,72,'right',.5);text('MERGERS AND ACQUISITIONS',1865,255,36,'right',.1);
text('PAUL ALLEN',1024,610,86,'center',1.5);text('Vice President',1024,704,66,'center',0,true);
text('358 EXCHANGE PLACE NEW YORK N.Y. 10006',1024,1045,48,'center',.25);text('FAX 212.555.6390 TELEX 10 4534',1024,1135,51,'center',.5);
// Independent ink and softened relief masks: R is coverage, G is bevel height.
let reliefCanvas=document.createElement('canvas');reliefCanvas.width=reliefCanvas.height=2048;let rc=reliefCanvas.getContext('2d');rc.filter='blur(2.4px)';rc.drawImage(print,0,0);
let inkPixels=ctx.getImageData(0,0,2048,2048),reliefPixels=rc.getImageData(0,0,2048,2048);
for(let i=0;i<inkPixels.data.length;i+=4)inkPixels.data[i+1]=Math.min(255,reliefPixels.data[i]*1.55);
// putImageData ignores the canvas transform.
ctx.putImageData(inkPixels,0,0);texture(print,0,false);gl.uniform1i(gl.getUniformLocation(program,'ink'),0);
// One fiber network supplies visible height, density, and preferred transport direction.
let paper=document.createElement('canvas');paper.width=paper.height=1024;
let pc=paper.getContext('2d'),seed=42;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;}
pc.fillStyle='#656565';pc.fillRect(0,0,1024,1024);pc.lineCap='round';
for(let i=0;i<78000;i++){
let px=rand()*1024,py=rand()*1024,angle=rand()*Math.PI*2,len=2+rand()*13;
// Layered fibers overlap, leaving pores between the strands.
pc.lineWidth=.45+rand()*1.2;pc.strokeStyle=rand()>.3?'rgba(224,224,224,.12)':'rgba(27,27,27,.18)';
pc.beginPath();pc.moveTo(px,py);pc.quadraticCurveTo(px+Math.cos(angle+.35)*len*.5,py+Math.sin(angle+.35)*len*.5,px+Math.cos(angle)*len,py+Math.sin(angle)*len);pc.stroke();
}
let fiberPixels=pc.getImageData(0,0,1024,1024).data;
texture(paper,1,true);gl.uniform1i(gl.getUniformLocation(program,'paper'),1);
let rx=.10,ry=-.10,rz=-.008,distance=8.5,panX=0,panY=0,raking=false,lightX=-3.5,dirty=true;
const MW=112,MH=72,COUNT=MW*MH;
let water=new Float32Array(COUNT),temperature=new Float32Array(COUNT),charred=new Float32Array(COUNT),tide=new Float32Array(COUNT),fold=new Float32Array(COUNT),memory=new Float32Array(COUNT),warp=new Float32Array(COUNT);
let nextWater=new Float32Array(COUNT),nextHeat=new Float32Array(COUNT),density=new Float32Array(COUNT),direction=new Float32Array(COUNT);
for(let j=0;j<MH;j++)for(let i=0;i<MW;i++){
let k=j*MW+i,fx=Math.floor(((i/(MW-1)*1.59)%1)*1023),fy=Math.floor((1-j/(MH-1))*1023);
let index=(fy*1024+fx)*4;let compressionIndex=(Math.round((1-j/(MH-1))*2047)*2048+Math.round(i/(MW-1)*2047))*4;
density[k]=Math.min(1,fiberPixels[index]/255+inkPixels.data[compressionIndex+1]/255*.2);
let dx=Math.abs(fiberPixels[(fy*1024+Math.min(1023,fx+1))*4]-fiberPixels[(fy*1024+Math.max(0,fx-1))*4]),dy=Math.abs(fiberPixels[(Math.min(1023,fy+1)*1024+fx)*4]-fiberPixels[(Math.max(0,fy-1)*1024+fx)*4]);
direction[k]=.5+.35*(dy-dx)/(1+dx+dy);
}
let damageCanvas=document.createElement('canvas');damageCanvas.width=MW;damageCanvas.height=MH;let dc=damageCanvas.getContext('2d'),damagePixels=dc.createImageData(MW,MH);
gl.activeTexture(gl.TEXTURE2);const damageTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,damageTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,damageCanvas);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,'damage'),2);
let tool='rotate',brushSize=.10,brushPointer=null,drying=false,simActive=false,inView=true,previousTime=0,wetAverage=0,charAverage=0,maxHeat=0,lastReadout=0,materialChanged=true;
function sample(field,u,v){let xx=Math.max(0,Math.min(MW-1.001,u*(MW-1))),yy=Math.max(0,Math.min(MH-1.001,v*(MH-1))),a=Math.floor(xx),b=Math.floor(yy),fx=xx-a,fy=yy-b,k=b*MW+a;return (field[k]*(1-fx)+field[k+1]*fx)*(1-fy)+(field[k+MW]*(1-fx)+field[k+MW+1]*fx)*fy;}
function applyBrush(u,v,amount){
if(tool==='rotate')return;
for(let j=0;j<MH;j++)for(let i=0;i<MW;i++){
let k=j*MW+i,dx=(i/(MW-1)-u)*1.59,dy=j/(MH-1)-v;
let d=Math.hypot(dx,dy),r=brushSize;
if(tool==='crease'){
// A fold extends through the sheet; brush position sets its axis.
let line=(i/(MW-1)-u)*1.59+(j/(MH-1)-v)*.28;
fold[k]=Math.max(fold[k],Math.exp(-Math.abs(line)/.018)*Math.min(.15,amount*.3));
}else if(d<r){let w=Math.pow(1-d/r,1.4)*( .85+density[k]*.3);
if(tool==='water'){water[k]=Math.min(1,water[k]+w*amount*3);temperature[k]=Math.max(0,temperature[k]-w*amount*2);}
if(tool==='burn'){temperature[k]=Math.min(1.4,temperature[k]+w*amount*5);}
}
}
materialChanged=true;simActive=true;
}
// Möller–Trumbore picking against the deformed mesh; damage stays under the pointer
// on either side of the card, rather than being painted in screen coordinates.
function pickCard(clientX,clientY){
let r=stage.getBoundingClientRect(),aspect=r.width/r.height,mobileFit=Math.max(1,1.2/aspect),tan=Math.tan(Math.PI/8),m=rotation();
let origin=[-panX,-panY,distance*mobileFit],dir=[((clientX-r.left)/r.width*2-1)*aspect*tan,(1-(clientY-r.top)/r.height*2)*tan,-1];
function inverse(a){return [m[0]*a[0]+m[1]*a[1]+m[2]*a[2],m[4]*a[0]+m[5]*a[1]+m[6]*a[2],m[8]*a[0]+m[9]*a[1]+m[10]*a[2]];}
origin=inverse(origin);dir=inverse(dir);let best=Infinity,hit=null;
for(let q=0;q<liveVerts.length;q+=27){
if(liveVerts[q+8]>1.5)continue;
let ax=liveVerts[q],ay=liveVerts[q+1],az=liveVerts[q+2],e1x=liveVerts[q+9]-ax,e1y=liveVerts[q+10]-ay,e1z=liveVerts[q+11]-az,e2x=liveVerts[q+18]-ax,e2y=liveVerts[q+19]-ay,e2z=liveVerts[q+20]-az;
let px=dir[1]*e2z-dir[2]*e2y,py=dir[2]*e2x-dir[0]*e2z,pz=dir[0]*e2y-dir[1]*e2x,det=e1x*px+e1y*py+e1z*pz;
if(Math.abs(det)<1e-7)continue;
let inv=1/det,tx=origin[0]-ax,ty=origin[1]-ay,tz=origin[2]-az,u=(tx*px+ty*py+tz*pz)*inv;if(u<0||u>1)continue;
let qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x,v=(dir[0]*qx+dir[1]*qy+dir[2]*qz)*inv;if(v<0||u+v>1)continue;
let t=(e2x*qx+e2y*qy+e2z*qz)*inv;if(t<=0||t>=best)continue;
let localX=origin[0]+dir[0]*t,localY=origin[1]+dir[1]*t,cu=localX/7+.5,cv=localY/4.4+.5;
if(sample(charred,cu,cv)>.92)continue;
best=t;hit=[cu,cv];
}return hit;
}
function applyAtPointer(amount){if(!brushPointer)return;let point=pickCard(brushPointer.x,brushPointer.y);if(point)applyBrush(point[0],point[1],amount);}
function rebuildSheet(){
for(let j=0;j<MH;j++)for(let i=0;i<MW;i++){
let k=j*MW+i,u=i/(MW-1),v=j/(MH-1),edge=Math.pow(Math.abs(u-.5)*2,3)+Math.pow(Math.abs(v-.5)*2,3);
warp[k]=(water[k]*.10+memory[k]*.035)*Math.sin(u*13+v*7)+charred[k]*charred[k]*.17*(.45+edge)+fold[k];
}
for(let k=0;k<liveVerts.length;k+=9){
let u=restVerts[k]/7+.5,v=restVerts[k+1]/4.4+.5,h=sample(warp,u,v),burn=sample(charred,u,v);
liveVerts[k+2]=h+restVerts[k+2]*(1-burn*.6);
if(restVerts[k+8]<1.5){let dx=(sample(warp,u+.004,v)-sample(warp,u-.004,v))/.056,dy=(sample(warp,u,v+.004)-sample(warp,u,v-.004))/.0352,sgn=restVerts[k+5],len=Math.hypot(dx,dy,1);liveVerts[k+3]=-dx*sgn/len;liveVerts[k+4]=-dy*sgn/len;liveVerts[k+5]=sgn/len;}
}
gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,liveVerts);
}
function uploadMaterial(){
for(let j=0;j<MH;j++)for(let i=0;i<MW;i++){let k=j*MW+i,p=(j*MW+i)*4;damagePixels.data[p]=Math.round(water[k]*255);damagePixels.data[p+1]=Math.round(charred[k]*255);damagePixels.data[p+2]=Math.round(Math.min(1,temperature[k])*255);damagePixels.data[p+3]=Math.round(tide[k]*255);}
gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,damageTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,MW,MH,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(damagePixels.data.buffer));gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);rebuildSheet();materialChanged=false;
}
function advanceMaterial(time){
let dt=previousTime?Math.min(.045,(time-previousTime)/1000):.016;previousTime=time;
if(brushPointer)applyAtPointer(dt);
if(!simActive&&!materialChanged)return;
let sumW=0,sumC=0,peakH=0,active=false;
for(let j=0;j<MH;j++)for(let i=0;i<MW;i++){
let k=j*MW+i,l=j*MW+Math.max(0,i-1),r=j*MW+Math.min(MW-1,i+1),b=Math.max(0,j-1)*MW+i,t=Math.min(MH-1,j+1)*MW+i;
let w=water[k],h=temperature[k],c=charred[k],d=density[k],anis=direction[k];
let diffusion=((water[l]+water[r]-2*w)*( .6+anis)+(water[b]+water[t]-2*w)*(1.6-anis))*2.7*(1.3-d*.6)*(1-c);
let evaporation=(drying?.7:.025)+h*.5;
let nw=Math.max(0,Math.min(1,w+diffusion*dt-evaporation*dt*(.3+w*.7)));
// Evaporation deposits a small tide mark at the drying front.
if(w>0.015&&w<.55&&nw<w)tide[k]=Math.min(1,tide[k]+(w-nw)*2.5*(.5+Math.abs(w-water[l])+Math.abs(w-water[t])));
memory[k]=Math.max(memory[k],w);
let nh=Math.max(0,Math.min(1.4,h+((temperature[l]+temperature[r]+temperature[b]+temperature[t]-4*h)*2.2-h*.45-w*1.7)*dt));
let nc=Math.min(1,c+Math.max(0,h-.23)*(.9+d*.8)*(1-w*.94)*dt);
nextWater[k]=nw;nextHeat[k]=nh;charred[k]=nc;
sumW+=nw;sumC+=nc;peakH=Math.max(peakH,nh);if(nw>.002||nh>.005)active=true;
}
[water,nextWater]=[nextWater,water];[temperature,nextHeat]=[nextHeat,temperature];wetAverage=sumW/COUNT;charAverage=sumC/COUNT;maxHeat=peakH;simActive=active||!!brushPointer;
if(!active)drying=false;
uploadMaterial();
if(time-lastReadout>150){emitState();lastReadout=time;}
}
function setTool(name){if(!['rotate','water','burn','crease'].includes(name))throw new RangeError('Unknown card tool: '+name);tool=name;brushPointer=null;pointers.clear();stage.dataset.tool=name;emitState();shadow.querySelector('#brushCursor').style.display='none';status.textContent=name==='rotate'?'Drag to rotate. Scroll to zoom.':name==='water'?'Press or paint on the card to add water. Space wets the center.':name==='burn'?'Press and hold to apply heat. Dry fibers char first; hold longer to burn a hole. Space heats the center.':'Press on the card to make a fold. Space creases the center.';}
function showBrush(e){let cursor=shadow.querySelector('#brushCursor');if(tool==='rotate'){cursor.style.display='none';return;}let r=stage.getBoundingClientRect();cursor.style.display='block';cursor.style.left=(e.clientX-r.left-17)+'px';cursor.style.top=(e.clientY-r.top-17)+'px';cursor.style.width=cursor.style.height='34px';}
listen(stage,'pointerleave',()=>{shadow.querySelector('#brushCursor').style.display='none';});
function dry(){drying=true;simActive=true;status.textContent='Drying the sheet. Tide marks and a slight warp remain.';invalidate();}
function fresh(){water.fill(0);temperature.fill(0);charred.fill(0);tide.fill(0);fold.fill(0);memory.fill(0);warp.fill(0);wetAverage=charAverage=maxHeat=0;brushPointer=null;drying=simActive=false;materialChanged=true;liveVerts.set(restVerts);setTool('rotate');reset();emitState();status.textContent='Fresh card restored.';invalidate();}
const visibilityObserver=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView){previousTime=0;invalidate();}});visibilityObserver.observe(stage);
listen(document,'visibilitychange',()=>{previousTime=0;if(!document.hidden)invalidate();});

const loc=n=>gl.getUniformLocation(program,n);let U={};['proj','model','pan','distance','light','raking'].forEach(k=>U[k]=loc(k));
function multiply(a,b){let out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
function rotation(){let a=Math.cos(rx),b=Math.sin(rx),c=Math.cos(ry),d=Math.sin(ry),e=Math.cos(rz),f=Math.sin(rz);return multiply(new Float32Array([e,f,0,0,-f,e,0,0,0,0,1,0,0,0,0,1]),multiply(new Float32Array([c,0,-d,0,0,1,0,0,d,0,c,0,0,0,0,1]),new Float32Array([1,0,0,0,0,a,b,0,0,-b,a,0,0,0,0,1])));}
let scheduled=false,frameId=0;function invalidate(){if(destroyed)return;dirty=true;if(!scheduled){scheduled=true;frameId=requestAnimationFrame(draw);}}
function draw(time){scheduled=false;if(destroyed)return;if(!dirty)return;dirty=false;if(inView&&!document.hidden)advanceMaterial(time);let rect=stage.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);let w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);if(!w||!h)return;let aspect=w/h,t=1/Math.tan(Math.PI/8),near=.1,far=100;let proj=new Float32Array([t/aspect,0,0,0,0,t,0,0,0,0,-(far+near)/(far-near),-1,0,0,-2*far*near/(far-near),0]);let mobileFit=Math.max(1,1.2/aspect);gl.uniformMatrix4fv(U.proj,false,proj);gl.uniformMatrix4fv(U.model,false,rotation());gl.uniform2f(U.pan,panX,panY);gl.uniform1f(U.distance,distance*mobileFit);gl.uniform3f(U.light,lightX,raking?4:6,raking?1.8:3.5);gl.uniform1f(U.raking,raking?1:0);gl.drawArrays(gl.TRIANGLES,0,liveVerts.length/9);shadow.querySelector('#shadow').style.opacity=String(Math.max(.035,.16*Math.abs(Math.cos(ry)*Math.cos(rx)))*(1-charAverage));if(simActive&&inView&&!document.hidden)invalidate();}
const resizeObserver=new ResizeObserver(invalidate);resizeObserver.observe(stage);
let pointers=new Map(),lastPinch=0;listen(stage,'contextmenu',e=>e.preventDefault());listen(stage,'pointerdown',e=>{stage.focus({preventScroll:true});stage.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(tool!=='rotate'&&!e.shiftKey&&e.button===0){brushPointer={id:e.pointerId,x:e.clientX,y:e.clientY};applyAtPointer(.14);simActive=true;invalidate();return;}if(pointers.size===2){let p=[...pointers.values()];lastPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});
listen(stage,'pointermove',e=>{showBrush(e);if(brushPointer&&brushPointer.id===e.pointerId){brushPointer.x=e.clientX;brushPointer.y=e.clientY;invalidate();return;}let p=pointers.get(e.pointerId);if(!p)return;let dx=e.clientX-p.x,dy=e.clientY-p.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){let a=[...pointers.values()],dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);distance=Math.max(2.8,Math.min(22,distance-(dist-lastPinch)*.025));lastPinch=dist;panX=Math.max(-3,Math.min(3,panX+dx*.005));panY=Math.max(-2,Math.min(2,panY-dy*.005));}else if((e.shiftKey&&tool==='rotate')||e.buttons===2){panX=Math.max(-3,Math.min(3,panX+dx*.012));panY=Math.max(-2,Math.min(2,panY-dy*.012));}else{ry+=dx*.008;rx+=dy*.008;}invalidate();});
function release(e){if(brushPointer&&brushPointer.id===e.pointerId){brushPointer=null;status.textContent=tool==='water'?'Water is spreading through the fibers. Dry paper to reveal its tide marks.':tool==='burn'?'Heat removed. The scorched paper is cooling.':'Crease applied. Switch to Rotate to inspect the fold.';}pointers.delete(e.pointerId);lastPinch=0;}listen(stage,'pointerup',release);listen(stage,'pointercancel',release);listen(stage,'lostpointercapture',release);
listen(stage,'wheel',e=>{e.preventDefault();distance=Math.max(2.8,Math.min(22,distance+e.deltaY*.012));invalidate();},{passive:false});
listen(stage,'keydown',e=>{if(e.code==='Space'&&tool!=='rotate'){e.preventDefault();applyBrush(.5,.5,.4);simActive=true;invalidate();status.textContent='Applied '+tool+' at the center of the card.';return;}let accepted=true;switch(e.key){case 'ArrowLeft':e.shiftKey?panX=Math.max(-3,panX-.15):ry-=.1;break;case 'ArrowRight':e.shiftKey?panX=Math.min(3,panX+.15):ry+=.1;break;case 'ArrowUp':e.shiftKey?panY=Math.min(2,panY+.15):rx-=.1;break;case 'ArrowDown':e.shiftKey?panY=Math.max(-2,panY-.15):rx+=.1;break;case '+':case '=':distance=Math.max(2.8,distance-.5);break;case '-':distance=Math.min(22,distance+.5);break;case '0':reset();break;default:accepted=false;}if(accepted){e.preventDefault();invalidate();}});
let inspecting=false;
function reset(){inspecting=false;rx=.10;ry=-.10;rz=-.008;distance=8.5;panX=panY=0;raking=false;lightX=-3.5;status.textContent='Original view restored.';emitState();invalidate();}
function inspect(enabled=true){if(!enabled){reset();return;}inspecting=true;rx=.20;ry=-.18;rz=0;distance=3.5;panX=panY=0;raking=true;lightX=-6;status.textContent='Close-up: recessed ink floor, sloping paper rim, and interior shadows.';emitState();invalidate();}
function flip(){ry+=Math.PI;status.textContent='Card turned over.';invalidate();}
function setRakingLight(value){raking=Boolean(value);emitState();invalidate();}
function setLight(value){if(!Number.isFinite(value))throw new TypeError('Light must be a number');lightX=Math.max(-10,Math.min(10,value));emitState();invalidate();}
function setBrushSize(value){if(!Number.isFinite(value))throw new TypeError('Brush size must be a number');brushSize=Math.max(.04,Math.min(.20,value));}
function apply(toolName,u=.5,v=.5,amount=.4){if(![u,v,amount].every(Number.isFinite)||u<0||u>1||v<0||v>1||amount<=0||amount>1)throw new RangeError('Use UV coordinates 0–1 and an amount greater than 0 and at most 1');setTool(toolName);applyBrush(u,v,amount);invalidate();}
function getState(){return {tool,wet:wetAverage,char:charAverage,heat:maxHeat,simulating:simActive,raking,inspecting,light:lightX,rotation:{x:rx,y:ry},distance};}
function emitState(){emit('cardstatechange',getState());}
listen(canvas,'webglcontextlost',e=>{e.preventDefault();fallback.hidden=false;status.textContent='3D context lost. Reload to restore the viewer.';});
invalidate();
return {
 canvas,element:host,setTool,setBrushSize,setLight,setRakingLight,inspect,flip,dry,fresh,resetView:reset,apply,getState,
 destroy(){if(destroyed)return;destroyed=true;abort.abort();cancelAnimationFrame(frameId);resizeObserver.disconnect();visibilityObserver.disconnect();for(const texture of textures)gl.deleteTexture(texture);gl.deleteTexture(damageTexture);gl.deleteBuffer(buffer);for(const shader of shaders)gl.deleteShader(shader);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();host.remove();}
};

}catch(error){abort.abort();host.remove();gl.getExtension('WEBGL_lose_context')?.loseContext();throw error;}
}
