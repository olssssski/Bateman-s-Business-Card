export const vertexShader = `
attribute vec3 p;
attribute vec3 n;
attribute vec2 uv;
attribute float face;
uniform mat4 proj;
uniform mat4 model;
uniform vec2 pan;
uniform float distance;
varying vec3 wp;
varying vec3 normal;
varying vec3 tx;
varying vec3 ty;
varying vec2 vuv;
varying float f;
void main() {
  vec4 world = model * vec4(p, 1.);
  wp = world.xyz;
  normal = mat3(model) * n;
  tx = mat3(model) * vec3(1., 0., 0.);
  ty = mat3(model) * vec3(0., 1., 0.);
  vuv = uv;
  f = face;
  vec4 view = world + vec4(pan, -distance, 0.);
  gl_Position = proj * view;
}
`;
export const fragmentShader = `precision highp float;
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
