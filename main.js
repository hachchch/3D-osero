const computerTaisen=true;
const grid=new vector(4,4,4);//8はおもすぎる
var turn=0;
var obj=[];
function generateVertex(obj){
    const res=[];
    for(const o of obj){
        for(let k=0; k<o.vertex.length; ++k){
            if((o.vertex[k][3]==0 && o.rad==Math.PI) || (o.vertex[k][3]!=0 && o.rad==0) || (o.rad>0 && o.rad<Math.PI) || (o.rad<2*Math.PI && o.rad>Math.PI)){
          const v=vec3.sum(mat.perspective(mat.rotate(vec.dec(o.vertex[k],o.center),[2,3],o.rad),10),new vector(o.center[0],o.center[1],o.center[2]));
            const c=o.color[k];
            res.push(v.x);
            res.push(v.y);
            res.push(v.z);
            res.push(1);
            if(o.select){
            res.push(0);
            res.push(1);
            res.push(1);
            res.push(1);
            }else{
            res.push(c[0]);
            res.push(c[1]);
            res.push(c[2]);
            res.push(c[3]);
            }
                }
        }
    }
    return res;
}
function generateIndex(obj){
    const res=[];
    var n=0;
    for(const o of obj){
        for(const i of o.index){
            res.push(i+n);
        }
        n+=o.vertex.length;
    }
    return res;
}
const camera={
    position:new vector(0,0,20),
    velocity:40
}
const angle={
    xy:0,
    xz:0,
    yz:0
}
const vertWGSL=`
struct Uniforms {
  projectionMatrix : mat4x4<f32>,
  rotationMatrix:mat4x4<f32>,
  translateMatrix:mat4x4<f32>
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  //フラグメントでのもの
  @location(0) fragColor : vec4<f32>,
}
@vertex
fn main(@location(0) position: vec4<f32>,@location(1) color: vec4<f32>) -> VertexOutput {
  var output : VertexOutput;
  output.Position = uniforms.projectionMatrix*uniforms.translateMatrix*uniforms.rotationMatrix*position;
  output.fragColor = color;  
  return output;
}
`;
const fragWGSL=`
@fragment
fn main(@location(0) fragColor: vec4<f32>) -> @location(0) vec4<f32> {
  return fragColor;
}
`;
function createBuffer(M){
  var m=[];
for(let i=0; i<M.length; ++i){
  for(let j=0; j<M[i].length; ++j){
    m.push(M[j][i]);
  }
}
return new Float32Array(m);
}
const canvas=document.querySelector(".canvas");
async function main(){
// webgpuコンテキストの取得
const context = canvas.getContext('webgpu');

// deviceの取得
const g_adapter = await navigator.gpu.requestAdapter();
const g_device = await g_adapter.requestDevice();

//デバイスを割り当て
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: g_device,
  format: presentationFormat,
  alphaMode: 'opaque'
});

//深度テクスチャ
var depthTexture;
if (!depthTexture ||
        depthTexture.width !== canvas.width ||
        depthTexture.height !== canvas.height){
      if (depthTexture) {
        depthTexture.destroy();
      }
      depthTexture =g_device.createTexture({
    size: [canvas.width,canvas.width],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
}

const quadVertexSize = 4*8; // Byte size of a vertex.
const quadPositionOffset = 0;  // Byte offset of quad vertex position attribute.
const quadColorOffset = 4*4; // Byte offset of quad vertex color attribute.

function render(){
//頂点配列
const quadVertexArray = new Float32Array(generateVertex(obj));
// 頂点データを作成.
const verticesBuffer = g_device.createBuffer({
  size: quadVertexArray.byteLength,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
new Float32Array(verticesBuffer.getMappedRange()).set(quadVertexArray);
verticesBuffer.unmap();

//インデックス配列
const quadIndexArray = new Uint16Array(generateIndex(obj));
const indicesBuffer = g_device.createBuffer({
  size: quadIndexArray.byteLength,
  usage: GPUBufferUsage.INDEX,
  mappedAtCreation: true,
});
//マップしたバッファデータをセッ
new Uint16Array(indicesBuffer.getMappedRange()).set(quadIndexArray);
indicesBuffer.unmap();

//Uniformバッファ
const uniformBufferSize = 4*16*3;
  const uniformBuffer = g_device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
var bufferPosition=0;
//透視投影変換行列を与える。
const p=createBuffer(mat4.perspectiveMatrix(4*Math.PI/5,1,100,1));
g_device.queue.writeBuffer(
  uniformBuffer,
  //バッファのバイト位置
  bufferPosition,
  //データ
  p.buffer,
  //データの位置
  p.byteOffset,
  //大きさ
  p.byteLength
);
bufferPosition+=p.byteLength;

//回転行列を与える。
const R=createBuffer(mat.prod(mat.rotationMatrix(4,[3,4],angle.xy),mat.prod(mat.rotationMatrix(4,[2,4],angle.xz),mat.rotationMatrix(4,[1,4],angle.yz))));
g_device.queue.writeBuffer(
  uniformBuffer,
  //バッファのバイト位置
  bufferPosition,
  //データ
  R.buffer,
  //データの位置
  R.byteOffset,
  //大きさ
  R.byteLength
);
bufferPosition+=R.byteLength;

//回転行列を与える。
const ct=createBuffer(mat4.translate(camera.position));
g_device.queue.writeBuffer(
  uniformBuffer,
  //バッファのバイト位置
  bufferPosition,
  //データ
  ct.buffer,
  //データの位置
  ct.byteOffset,
  //大きさ
  ct.byteLength
);
bufferPosition+=ct.byteLength;

//レンダーパイプラインの設定
const pipeline = g_device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    //頂点シェーダーのWGSLをここに。
    module: g_device.createShaderModule({
      code: vertWGSL,
    }),
    //エントリーポイントとなる関数を指定
    entryPoint: 'main',
    //バッファデータの設定
    buffers: [
      {
        // 配列の要素間の距離をバイト単位で指定します。
        arrayStride: quadVertexSize,

        // 頂点バッファの属性を指定します。
        attributes: [
          {
            // position
            shaderLocation: 0, // @location(0) in vertex shader
            offset: quadPositionOffset,
            format: 'float32x4',
          },
          {
            // color
            shaderLocation: 1, // @location(1) in vertex shader
            offset: quadColorOffset,
            format: 'float32x4',
          },
        ],
      },
    ],
  },
  fragment: {
    //フラグメントシェーダーのWGSLをここに。
    module: g_device.createShaderModule({
      code: fragWGSL,
    }),
    entryPoint: 'main',
    //レンダー先(canvas)のフォーマットを指定
    targets: [
      { // @location(0) in fragment shader
        format: presentationFormat,
          //アルファブレンディング
          /*
        blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'zero',
              dstFactor: 'one',
              operation: 'add',
            },
          },*/
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
});
    
//バインドグループを作成
const bindGroup = g_device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0, // @binding(0) in shader
      resource: {
        buffer: uniformBuffer,
      },
    },
  ],
});
//コマンドバッファの作成
const commandEncoder = g_device.createCommandEncoder();
//レンダーパスの設定
const textureView = context.getCurrentTexture().createView();
  const renderPassDescriptor/*: GPURenderPassDescriptor */= {
    colorAttachments: [
      {
        view: textureView,
        //画面clearの色
        clearValue: { r: 0.1, g: 0.6, b: 0.2, a: 1.0 },
        //まずclearする。
        loadOp: 'clear',
        //命令が終われば、状態を保持
        storeOp: 'store',
      },
    ],
      //深度テスター
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  //GPUに命令を設定

  //レンダーパイプラインを与える
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.setVertexBuffer(0, verticesBuffer);
  passEncoder.setIndexBuffer(indicesBuffer, 'uint16');
  passEncoder.drawIndexed(quadIndexArray.length);
  // レンダーパスコマンドシーケンスの記録を完了する。
  passEncoder.end();
  //命令を発行
  g_device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(render);
    translate();
}
    render();
}
//簡単...?
main();
var key="";
window.addEventListener("keydown",e=>{
    key=e.code;
});
window.addEventListener("keyup",e=>{
    key="";
});
const size=6;
function ball(x,y,z,w,c,off){
  r=size*0.4;
    if(off){
        r=size*0.1;
    }
  const o={
    center:[x,y,z,w],
    vertex:[],
    index:[],
    color:[],
    rad:0
  };
  function triangle(v1,v2,v3){
    let n=o.vertex.length;
    o.vertex.push([v1.x,v1.y,v1.z,w]);
    o.vertex.push([v2.x,v2.y,v2.z,w]);
    o.vertex.push([v3.x,v3.y,v3.z,w]);
    o.index.push(n);
    o.index.push(n+1);
    o.index.push(n+2);
    if(c){
      //表面
    o.color.push([1,1,1,1]);
    o.color.push([1,1,1,1]);
    o.color.push([1,1,1,1]);
    }else{
      //裏面
    o.color.push([0,0,0,1]);
    o.color.push([0.1,0.1,0.1,1]);
    o.color.push([0,0,0,1]);
    }
  }
  function p(a,b){
    return new vector(x+r*Math.cos(a)*Math.sin(b),y+r*Math.sin(a)*Math.sin(b),z+r*Math.cos(b));
  }
  const p1=4;
  const p2=4;
  const pi2=Math.PI;
  const pi=Math.PI;
  for(let i=0; i<=p1; ++i){
    for(let j=0; j<p2*2; ++j){
      triangle(p(pi2*j/p2,pi*(i+1)/p1),p(pi2*(j+1)/p2,pi*(i+1)/p1),p(pi*j/p2,pi2*i/p1));
      triangle(p(pi2*(j+1)/p2,pi*i/p1),p(pi2*j/p2,pi*i/p1),p(pi*(j+1)/p2,pi2*(i+1)/p1));
    }
  }
  return o;
}
function disk(position,black,off,line){
  const w=size*0.8/5;
  obj.push(marge(ball(position.x,position.y,position.z,0,false,off),
  ball(position.x,position.y,position.z,w,true,off),black,off,line));
}
function marge(o1,o2,black,off,line){
  var rad=0;
  if(black){
    rad=Math.PI;
  }
  let res={
    center:vec.prod(vec.sum(o1.center,o2.center),0.5),
    vertex:o1.vertex,
    index:o1.index,
    color:o1.color,
    rotating:[0,10],
    black:black,
    rad:rad,
    on:!off,
    line:line,
    seed:Math.random(),
      select:false
  };
  for(let k=0; k<o2.index.length; ++k){
    res.index.push(o2.index[k]+o1.vertex.length);
  }
  for(const v of o2.vertex){
    res.vertex.push(v);
  }
  for(const c of o2.color){
    res.color.push(c);
  }
  return res;
}
function put(x,y,z,t,off,lines){
  x=size*(x-0.5-grid.x/2);
  y=size*(y-0.5-grid.y/2);
  z=size*(z-0.5-grid.z/2);
  disk(new vector(x,y,z),t,off,lines);
}
function putPosition(v,t,off,lines){
    disk(new vector(v[0],v[1],v[2]),t,off,lines);
}
put(grid.x/2,grid.y/2,grid.z/2,true);
put(grid.x/2+1,grid.y/2,grid.z/2,false);
put(grid.x/2,grid.y/2+1,grid.z/2,false);
put(grid.x/2+1,grid.y/2+1,grid.z/2,true);
put(grid.x/2,grid.y/2,grid.z/2+1,false);
put(grid.x/2+1,grid.y/2,grid.z/2+1,true);
put(grid.x/2,grid.y/2+1,grid.z/2+1,true);
put(grid.x/2+1,grid.y/2+1,grid.z/2+1,false);
const m={
  x:null,
  y:null
}
canvas.addEventListener("mousemove",e=>{
m.x=e.offsetX;
m.y=e.offsetY;
});
canvas.addEventListener("click",e=>{
  const r=size*0.4;
  const centers=[];
  for(let k=0; k<obj.length; ++k){
    const o=obj[k];
    var v=new vector(o.center[0],o.center[1],o.center[2]);
    const R=mat.prod(mat.rotationMatrix(4,[3,4],angle.xy),mat.prod(mat.rotationMatrix(4,[2,4],angle.xz),mat.rotationMatrix(4,[1,4],angle.yz)));
    const T=mat4.translate(camera.position);
    v=[v.x,v.y,v.z,1];
    const m=mat4.perspectiveMatrix(4*Math.PI/5,1,100,1);
      const p=mat.vector(v);
    v=vec.matrix(
        mat.prod(mat.prod(
        mat.prod(m,T),R),p)
    );
    //正規化viewport変換
      v=vec.prod(v,1/v[3]);
      v=vec.matrix(mat.prod(mat4.viewport(canvas.width,canvas.height,10,1),mat.vector(v)));
    centers.push(
      {position:new vector(v[0],v[1]),
        index:k,
       on:obj[k].on,
        rotating:obj[k].rotating[0]>0
      });
  }
  let dist=10000000;
  let id=-1;
  for(const c of centers){
    if(!c.on){
    let d=Math.hypot(c.position.x-m.x,c.position.y-m.y)
    if(d<dist){
      dist=d;
      id=c.index;
    }
  }
  }
  if(id!=-1){
      if(obj[id].select){
    pop(obj[id]);
          obj[id].select=false;
      }else{
          for(const o of obj){
              o.select=false;
            }
          obj[id].select=true;
    }
  }
});
function test(x,y,z){
    const m=mat4.perspectiveMatrix2(4*Math.PI/5,canvas.width,canvas.height,100,1);
    const v=[
        [x,0,0,0],
        [0,y,0,0],
        [0,0,z,0],
        [0,0,0,1]
    ]
    const res=mat.prod(v,m);
    console.log(vec.matrix(res))
}
//描画毎に行う処理
function translate(){
    const cv=camera.velocity/60;
    if(key=="KeyW"){
        camera.position.z-=cv;
    }
    if(key=="KeyA"){
        camera.position.x-=cv;
    }
    if(key=="KeyS"){
        camera.position.z+=cv;
    }
    if(key=="KeyD"){
        camera.position.x+=cv;
    }
    if(key=="KeyE" || key=="Space"){
        camera.position.y+=cv;
    }
    if(key=="KeyQ" || key=="ShiftLeft"){
        camera.position.y-=cv;
    }
    const av=3/60;
    if(key=="KeyI"){
        angle.xy+=av;
    }
    if(key=="KeyO"){
        angle.xz+=av;
    }
    if(key=="KeyP"){
        angle.yz+=av;
    }
    if(key=="KeyJ"){
      angle.xy-=av;
  }
  if(key=="KeyK"){
      angle.xz-=av;
  }
  if(key=="KeyL"){
      angle.yz-=av;
  }
  for(const o of obj){
    if(o.rotating[0]>0){
      o.rotating[0]--;
      o.rad+=Math.PI/o.rotating[1];
      if(o.rotating[0]<=0){
        if(o.black){
            o.rad=Math.PI;
        }else{
            o.rad=0;
        }
      }
    }
  }
}
function nextTurn(){
    turn=turn^1;
    for(const o of obj){
        if(!o.on){
            clear(o.seed);
        }
    }
    const points=[];
    for(const o of obj){
        if(o.on && o.black==(turn==1)){
            var v;
            var dist=0;
            var lines=[];
            function check(f){
                //fをベクトルとして解釈
            v=o.center.slice();
            dist=0;
            lines=[];
            const a=1;
                while((v[0]>=-size*(grid.x-a)/2 && v[0]<=size*(grid.x-a)/2) && (v[1]>=-size*(grid.y-a)/2 && v[1]<=size*(grid.y-a)/2) && (v[2]>=-size*(grid.z-a)/2 && v[2]<=size*(grid.z-a)/2)){
                v[0]+=size*f.x;
                v[1]+=size*f.y;
                v[2]+=size*f.z;
                dist++;
                //停止条件
                //同色にぶつかる
                if(obj.findIndex(e=>e.center.join()==v.join() && e.black==o.black && e.on==true)!=-1){
                    break;
                }
                //空白にぶつかる
                if(obj.findIndex(e=>e.center.join()==v.join() && e.on==true)==-1){
                    if(dist>1){
                      if((v[0]>=-size*(grid.x-a)/2 && v[0]<=size*(grid.x-a)/2) && (v[1]>=-size*(grid.y-a)/2 && v[1]<=size*(grid.y-a)/2) && (v[2]>=-size*(grid.z-a)/2 && v[2]<=size*(grid.z-a)/2)){
                        let pd=points.findIndex(e=>e.position.join()==v.join() && e.black==o.black);
                        if(pd==-1){
                            points.push({
                            position:v,
                            black:o.black,
                            line:lines
                        });
                        }else{
                            for(const l of lines){
                            points[pd].line.push(l);
                            }
                        }
                      }
                    }
                    break;
                }
                lines.push(v.slice());
            }
                }
            for(let x=-1; x<=1; ++x){
                for(let y=-1; y<=1; ++y){
                    for(let z=-1; z<=1; ++z){
                        if(!(x==0 && y==0 && z==0)){
                        check(new vector(x,y,z));
                        }
                    }
                }
            }
        }
    }
    //追加
    if(points.length==0){
      for(let x=-grid.x/2; x<grid.x/2; ++x){
        for(let y=-grid.y/2; y<grid.y/2; ++y){
          for(let z=-grid.z/2; z<grid.z/2; ++z){
            var p=[(x+0.5)*size,(y+0.5)*size,(z+0.5)*size,0];
            let id=obj.findIndex(e=>p.slice(0,3).join()==e.center.slice(0,3).join());
            if(id==-1){
            points.push({
              position:p,
              black:turn==1,
              line:[]});
            }
          }
        }
      }
    }
    if(points.length==0){
      end();
    }
          for(const p of points){
              putPosition(p.position,p.black,true,p.line);
          }
      
    if(computerTaisen && turn==0){
        let seed=Math.round(Math.random()*(points.length-1));
        var id=-1;
          id=obj.findIndex(e=>e.center.join()==points[seed].position.join());
        pop(obj[id]);
    }
}
function clear(seed){
    const id=obj.findIndex(e=>e.seed==seed);
    const res=obj.slice(0,id);
    const A=obj.slice(id+1,obj.length);
    for(const a of A){
        res.push(a);
    }
    obj=res;
}
nextTurn();
function pop(o){
    const V=o.line.slice();
    for(const v of V){
        const O=obj[obj.findIndex(e=>e.center.join()==v.join() && e.on==true)];
        O.rotating[0]=O.rotating[1];
        O.black=!O.black;
    }
    putPosition(o.center,o.black);
    clear(o.seed);
    nextTurn();
}
function end(){
  var am=[0,0];
    for(const o of obj){
      if(o.on){
        if(o.black){
          am[0]++
        }else{
            am[1]++
        }
      }
    }
    const stats=document.getElementById("stats");
  stats.innerHTML=`白:${am[1]}、黒:${am[0]}`;
}