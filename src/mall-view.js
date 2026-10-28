/* Vacancy 3D mall view (Three.js, global THREE, r128). Builds the whole mall from Vacancy.mall (meters, +x east, +z south, y up).
   The game talks to it through the object createMallView() returns: setStores, setCut, select, hover callbacks, labels.
   Everything is drawn into one canvas, so there is no selectable text. */
(function(){
"use strict";
var V=window.Vacancy=window.Vacancy||{};

function rng(seed){var a=seed>>>0;return function(){a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

V.createMallView=function(opts){
  var THREE=window.THREE,M=V.mall,FH=M.floorHeight,container=opts.container;
  var R=rng(7);
  var renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(42,1,1,2200);

  /* ---------- themes ---------- */
  var THEMES={
    day:{sky:0xcfe2ec,fog:0xdbe7ea,sun:0xfff1d6,sunI:.5,hemiS:0xf4f7ff,hemiG:0xc9bda2,hemiI:.62,ground:0xcfc7b2,asphalt:0x62666b,wall:0xf6f3ec,roof:0xe7e4dc,glass:0x6fa6b5,glow:0},
    dusk:{sky:0x3a3b5c,fog:0x4a4663,sun:0xff9a5a,sunI:.7,hemiS:0x8d86b8,hemiG:0x4b3f3a,hemiI:.5,ground:0x8b8372,asphalt:0x3c3f45,wall:0xe8dfd2,roof:0xc9c3ba,glass:0xf1c46a,glow:1}
  };
  var T=THEMES.day,themeName="day";
  scene.background=new THREE.Color(T.sky);scene.fog=new THREE.Fog(T.fog,700,1900);
  var hemi=new THREE.HemisphereLight(T.hemiS,T.hemiG,T.hemiI);scene.add(hemi);
  var sun=new THREE.DirectionalLight(T.sun,T.sunI);sun.position.set(-160,260,120);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);var sc=sun.shadow.camera;sc.left=-340;sc.right=340;sc.top=340;sc.bottom=-340;sc.near=10;sc.far=900;sun.shadow.bias=-.0006;
  scene.add(sun);scene.add(sun.target);

  /* ---------- helpers ---------- */
  var mats={};
  function mat(c,o){var key=c+JSON.stringify(o||{});if(mats[key])return mats[key];var m=new THREE.MeshLambertMaterial(Object.assign({color:c},o||{}));mats[key]=m;return m}
  var themed=[]; // materials re-tinted when the theme changes
  function tm(kind,extra){var m=new THREE.MeshLambertMaterial(Object.assign({color:T[kind]},extra||{}));themed.push({m:m,kind:kind});return m}
  function box(x0,z0,w,d,y0,h,m,parent,shadow){var g=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);g.position.set(x0+w/2,y0+h/2,z0+d/2);if(shadow!==false){g.castShadow=true;g.receiveShadow=true}(parent||scene).add(g);return g}
  function plane(x0,z0,w,d,y,m,parent){var g=new THREE.Mesh(new THREE.PlaneGeometry(w,d),m);g.rotation.x=-Math.PI/2;g.position.set(x0+w/2,y,z0+d/2);g.receiveShadow=true;(parent||scene).add(g);return g}
  function canvasTex(w,h,draw,rep){var c=document.createElement("canvas");c.width=w;c.height=h;draw(c.getContext("2d"),w,h);var t=new THREE.CanvasTexture(c);t.anisotropy=4;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping}return t}
  var FONT="'Noto Sans','Segoe UI',system-ui,sans-serif";
  function textTex(txt,o){o=o||{};var fs=o.size||34,w=o.w||512,h=o.h||96;
    return canvasTex(w,h,function(g){g.clearRect(0,0,w,h);
      if(o.bg){g.fillStyle=o.bg;var r=h/2;g.beginPath();g.moveTo(r,2);g.lineTo(w-r,2);g.arc(w-r,h/2,r-2,-Math.PI/2,Math.PI/2);g.lineTo(r,h-2);g.arc(r,h/2,r-2,Math.PI/2,Math.PI*1.5);g.fill();if(o.border){g.strokeStyle=o.border;g.lineWidth=3;g.stroke()}}
      g.fillStyle=o.fg||"#1f1b16";g.font="700 "+fs+"px "+FONT;g.textAlign="center";g.textBaseline="middle";
      var t=txt;while(g.measureText(t).width>w-40&&t.length>3){fs-=2;g.font="700 "+fs+"px "+FONT}g.fillText(t,w/2,h/2+2)})}
  function sprite(txt,o){var t=textTex(txt,o),s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false,depthWrite:false}));s.renderOrder=20;var h=o.worldH||5;s.scale.set(h*(o.w||512)/(o.h||96),h,1);return s}

  var glassTiles=[],outsideEnt=[];
  var root=new THREE.Group();scene.add(root);
  var levelGroups=[null,new THREE.Group(),new THREE.Group(),new THREE.Group()];
  levelGroups.forEach(function(g,i){if(g)root.add(g)});
  var roofGroup=new THREE.Group();root.add(roofGroup);
  var outside=new THREE.Group();root.add(outside);
  var LI={L1:1,L2:2,L3:3};

  /* ---------- ground, roads, plazas ---------- */
  var B=M.bounds,gw=B.maxX-B.minX+1200,gd=B.maxZ-B.minZ+1200;
  var groundM=tm("ground");
  (function(){var g=new THREE.Mesh(new THREE.PlaneGeometry(gw,gd),groundM);g.rotation.x=-Math.PI/2;g.position.set((B.minX+B.maxX)/2,-.3,(B.minZ+B.maxZ)/2);g.receiveShadow=true;outside.add(g)})();
  var asphalt=tm("asphalt"),stallTex=canvasTex(64,64,function(g,w,h){g.fillStyle="#fff";g.globalAlpha=.0;g.fillRect(0,0,w,h);g.globalAlpha=.8;g.fillStyle="#e8e4d8";g.fillRect(0,0,3,h)},true);
  M.roads.forEach(function(r){var rc=r.rect;box(rc.x,rc.z,rc.w,rc.d,-.2,.2,asphalt,outside,false);
    var along=r.axis==="x";var n=Math.floor((along?rc.w:rc.d)/16);
    for(var i=0;i<n;i++){var p=i*16+4;if(along)box(rc.x+p,rc.z+rc.d/2-.3,8,.6,0,.05,mat(0xe9c24f),outside,false);else box(rc.x+rc.w/2-.3,rc.z+p,.6,8,0,.05,mat(0xe9c24f),outside,false)}
    box(rc.x,rc.z-1.6,along?rc.w:1.6,along?1.6:rc.d,0,.3,mat(0xb9b2a0),outside,false); // curb
    if(r.name){var s=textTex(r.name.toUpperCase(),{size:44,w:1024,h:96,fg:"rgba(255,255,255,.85)"});var m=new THREE.Mesh(new THREE.PlaneGeometry(90,8.4),new THREE.MeshBasicMaterial({map:s,transparent:true}));m.rotation.x=-Math.PI/2;m.rotation.z=along?0:Math.PI/2;m.position.set(rc.x+rc.w/2+(along?-140:0),.12,rc.z+rc.d/2+(along?0:-120));outside.add(m)}});
  // plazas and sidewalks around the building
  var sh=M.buildings[0].rect;box(sh.x-10,sh.z-10,sh.w+20,sh.d+20,-.1,.1,mat(0xe4ddcb),outside,false);
  var pl=M.plaza.rect;box(pl.x,pl.z,pl.w,pl.d,-.08,.1,mat(0xd9c49a),outside,false);

  /* parking lots with stalls, cars and trees */
  var carMesh,carCab,carsN=0,carData=[],treeData=[];
  (function(){
    var bodyColors=[0xc8312b,0x3c6fb0,0xe9e6df,0x2f8a4c,0xd9a520,0x2b2e35,0x8c8f96,0x6d4a8a,0xe9e6df,0x9aa0a8];
    M.parking.forEach(function(p){var rc=p.rect;
      if(p.kind==="garage"){var fl=p.floors,gm=mat(0xcfcabd);
        for(var f=0;f<=fl;f++)box(rc.x,rc.z,rc.w,rc.d,f*4.2,.7,gm,outside);
        for(var px=0;px<=rc.w;px+=rc.w/Math.max(4,Math.round(rc.w/18)))box(rc.x+px-.4,rc.z,.8,rc.d,0,fl*4.2,mat(0xbfb9aa),outside);
        box(rc.x,rc.z,rc.w,.5,0,fl*4.2+.8,mat(0xb3ad9f),outside);box(rc.x,rc.z+rc.d-.5,rc.w,.5,0,fl*4.2+.8,mat(0xb3ad9f),outside);
        // solar canopy on top
        var top=fl*4.2+5.2;for(var sx=0;sx<rc.w-1;sx+=11){var pn=box(rc.x+sx+.4,rc.z+3,10.2,rc.d-6,top,.3,mat(0x1f2a44),outside);pn.rotation.z=.06}
        for(var cx=0;cx<rc.w;cx+=rc.w/6)box(rc.x+cx,rc.z+2,.5,.5,fl*4.2+.7,4.5,mat(0x9a9588),outside);
        var carY=fl*4.2+.7;for(var cx2=3;cx2<rc.w-4;cx2+=3.2){if(R()<.6)carData.push([rc.x+cx2,carY,rc.z+rc.d*.3,0]);if(R()<.6)carData.push([rc.x+cx2,carY,rc.z+rc.d*.7,0])}
      }else{
        box(rc.x,rc.z,rc.w,rc.d,-.2,.12,mat(0x585c61),outside,false);
        for(var rz=8;rz<rc.d-6;rz+=19){ // double row of stalls with an aisle
          for(var sx2=2;sx2<rc.w-2;sx2+=2.9){box(rc.x+sx2,rc.z+rz,.12,5.4,0,.03,mat(0xe8e4d8),outside,false);box(rc.x+sx2,rc.z+rz+7.8,.12,5.4,0,.03,mat(0xe8e4d8),outside,false);
            if(R()<.62)carData.push([rc.x+sx2+1.4,0,rc.z+rz+2.7,Math.PI/2]);if(R()<.62)carData.push([rc.x+sx2+1.4,0,rc.z+rz+10.5,Math.PI/2])}
          if(rz+19<rc.d-6)for(var tx=4;tx<rc.w-4;tx+=22)treeData.push([rc.x+tx+R()*4,rc.z+rz+16,2.6+R()*1.6])}
        // palms and trees along the edges
        for(var ex=6;ex<rc.w;ex+=14)treeData.push([rc.x+ex,rc.z+1.5,3+R()*1.4]);
      }});
    // trees around the buildings
    for(var tx2=sh.x-6;tx2<sh.x+sh.w+6;tx2+=22){treeData.push([tx2,sh.z-6,3.2+R()]);treeData.push([tx2,sh.z+sh.d+6,3.2+R()])}
    var cgeo=new THREE.BoxGeometry(4.4,1.15,2.1),cabGeo=new THREE.BoxGeometry(2.3,.8,1.85);
    carMesh=new THREE.InstancedMesh(cgeo,new THREE.MeshLambertMaterial({color:0xffffff}),carData.length);carCab=new THREE.InstancedMesh(cabGeo,new THREE.MeshLambertMaterial({color:0x25303a}),carData.length);
    var m4=new THREE.Matrix4(),q=new THREE.Quaternion(),c=new THREE.Color();
    carData.forEach(function(d,i){q.setFromEuler(new THREE.Euler(0,d[3],0));m4.compose(new THREE.Vector3(d[0],d[1]+.75,d[2]),q,new THREE.Vector3(1,1,1));carMesh.setMatrixAt(i,m4);c.setHex(bodyColors[(R()*bodyColors.length)|0]);carMesh.setColorAt(i,c);
      var off=new THREE.Vector3(-.2,.95,0).applyQuaternion(q);m4.compose(new THREE.Vector3(d[0]+off.x,d[1]+.75+off.y,d[2]+off.z),q,new THREE.Vector3(1,1,1));carCab.setMatrixAt(i,m4)});
    carMesh.castShadow=true;outside.add(carMesh);outside.add(carCab);
    var tt=new THREE.InstancedMesh(new THREE.CylinderGeometry(.25,.35,3.2,6),mat(0x6b5436),treeData.length),tl=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshLambertMaterial({color:0xffffff}),treeData.length);
    var greens=[0x6f8f4a,0x5f8244,0x84a257,0x4f7a49];
    treeData.forEach(function(d,i){m4.compose(new THREE.Vector3(d[0],1.6,d[1]),new THREE.Quaternion(),new THREE.Vector3(1,1,1));tt.setMatrixAt(i,m4);
      m4.compose(new THREE.Vector3(d[0],3.2+d[2]*.7,d[1]),new THREE.Quaternion(),new THREE.Vector3(d[2],d[2]*.9,d[2]));tl.setMatrixAt(i,m4);c.setHex(greens[i%4]);tl.setColorAt(i,c)});
    tl.castShadow=true;outside.add(tt);outside.add(tl);
  })();

  // moving cars on the two main roads
  var movers=[];
  (function(){var geo=new THREE.BoxGeometry(4.4,1.4,2.1),im=new THREE.InstancedMesh(geo,new THREE.MeshLambertMaterial({color:0xffffff}),44),c=new THREE.Color(),cols=[0xc8312b,0x3c6fb0,0xe9e6df,0xd9a520,0x2b2e35,0x2f8a4c];
    for(var i=0;i<44;i++){var r=M.roads[i%3===2?2:i%2===0?0:1],rc=r.rect,al=r.axis==="x",lane=(i%4<2?.25:.75);
      movers.push({al:al,rc:rc,t:R(),sp:(8+R()*6)*(lane<.5?1:-1),off:(al?rc.d:rc.w)*lane});c.setHex(cols[i%6]);im.setColorAt(i,c)}
    im.castShadow=false;outside.add(im);movers.mesh=im})();
  var m4t=new THREE.Matrix4(),q4=new THREE.Quaternion(),v3=new THREE.Vector3(),one=new THREE.Vector3(1,1,1);
  function moveCars(dt){movers.forEach(function(m,i){var L=m.al?m.rc.w:m.rc.d;m.t=(m.t+m.sp*dt/L+1)%1;var p=m.t*L;
    var x=m.al?m.rc.x+p:m.rc.x+m.off,z=m.al?m.rc.z+m.off:m.rc.z+p;q4.setFromEuler(new THREE.Euler(0,m.al?(m.sp<0?Math.PI:0):(m.sp<0?-Math.PI/2:Math.PI/2),0));
    m4t.compose(v3.set(x,.95,z),q4,one);movers.mesh.setMatrixAt(i,m4t)});movers.mesh.instanceMatrix.needsUpdate=true}

  /* ---------- the building ---------- */
  var wallM=tm("wall"),roofM=tm("roof");
  var glassTex=canvasTex(64,128,function(g,w,h){g.fillStyle="#5f95a6";g.fillRect(0,0,w,h);g.fillStyle="rgba(255,255,255,.55)";g.fillRect(0,0,3,h);g.fillStyle="rgba(255,255,255,.18)";g.fillRect(0,0,w,14)},true);
  var glassM=new THREE.MeshLambertMaterial({map:glassTex,color:0xffffff,emissive:0x000000});
  var wallPieces=[]; // {mesh, bld, side, level}
  var bld={};
  M.buildings.forEach(function(b){
    var rc=b.rect,y0=(b.startLevel?LI[b.startLevel]-1:0)*FH,lv0=b.startLevel?LI[b.startLevel]:1;bld[b.id]={b:b,y0:y0,lv0:lv0};
    for(var f=0;f<b.floors;f++){var lvl=lv0+f,g=levelGroups[lvl];
      // floor slab
      var slab=box(rc.x,rc.z,rc.w,rc.d,y0+f*FH-.8,.8,mat(f===0&&lvl===1?0xd7cdb8:0xd0c6b1),g);slab.userData.floor=true;
      // exterior walls of this floor: a white band with a glass strip
      [["n",rc.x,rc.z,rc.w,.7],["s",rc.x,rc.z+rc.d-.7,rc.w,.7],["w",rc.x,rc.z,.7,rc.d],["e",rc.x+rc.w-.7,rc.z,.7,rc.d]].forEach(function(s){
        var w=box(s[1],s[2],s[3],s[4],y0+f*FH,FH,wallM,g);
        var long=s[3]>s[4],len=long?s[3]:s[4];
        var gl=new THREE.Mesh(new THREE.BoxGeometry(long?len-4:.5,3.4,long?.5:len-4),glassM.clone());gl.material.map=glassTex.clone();gl.material.map.needsUpdate=true;gl.material.map.repeat.set(len/8,1);
        gl.position.set(s[1]+s[3]/2+(s[0]==="e"?.3:s[0]==="w"?-.3:0),y0+f*FH+3.6,s[2]+s[4]/2+(s[0]==="s"?.3:s[0]==="n"?-.3:0));g.add(gl);glassTiles.push(gl)})}
    // roof slab + parapet + rooftop gear
    var top=y0+b.floors*FH,rf=box(rc.x-.3,rc.z-.3,rc.w+.6,rc.d+.6,top,.8,roofM,roofGroup);rf.userData.roof=bld[b.id];
    box(rc.x-.4,rc.z-.4,rc.w+.8,.9,top+.8,1.1,wallM,roofGroup);box(rc.x-.4,rc.z+rc.d-.5,rc.w+.8,.9,top+.8,1.1,wallM,roofGroup);box(rc.x-.4,rc.z,.9,rc.d,top+.8,1.1,wallM,roofGroup);box(rc.x+rc.w-.5,rc.z,.9,rc.d,top+.8,1.1,wallM,roofGroup);
    var rr=rng(b.id.length*31);for(var i=0;i<Math.round(rc.w*rc.d/900);i++){var bw=3+rr()*6,bd=3+rr()*5;box(rc.x+4+rr()*(rc.w-bw-8),rc.z+4+rr()*(rc.d-bd-8),bw,bd,top+.8,1.4+rr()*1.8,mat(0xc7c3ba),roofGroup)}
    if(b.id==="shell"){for(var px=0;px<rc.w-20;px+=15)for(var pz=0;pz<rc.d*.3;pz+=8){if(rr()<.6)box(rc.x+10+px,rc.z+5+pz,12,6,top+.9,.4,mat(0x24304d),roofGroup)}}
  });
  function wallHeights(cut){/* handled by visibility */}

  /* ---------- floor surfaces: corridors, courts, escalators ---------- */
  var corrM=mat(0xf6ecd6),corrEdge=mat(0xc9916a),courtM=mat(0xf3e3c3),ringM=mat(0xc66a45),ringM2=mat(0xe7cfa4);
  var tileTex=canvasTex(128,128,function(g,w,h){g.fillStyle="#f6ecd6";g.fillRect(0,0,w,h);g.strokeStyle="rgba(180,150,110,.35)";g.lineWidth=2;g.strokeRect(0,0,w,h)},true);
  Object.keys(M.corridors).forEach(function(l){var g=levelGroups[LI[l]],y=(LI[l]-1)*FH+.04,HW=4;
    M.corridors[l].forEach(function(poly){for(var i=1;i<poly.length;i++){var a=poly[i-1],b=poly[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),ang=Math.atan2(dz,dx);
      var tx=tileTex.clone();tx.needsUpdate=true;tx.repeat.set(len/6,HW*2/6);
      var m=new THREE.Mesh(new THREE.BoxGeometry(len+HW*.0,.06,HW*2),new THREE.MeshLambertMaterial({map:tx}));m.position.set((a[0]+b[0])/2,y,(a[1]+b[1])/2);m.rotation.y=-ang;m.receiveShadow=true;g.add(m);
      var e1=new THREE.Mesh(new THREE.BoxGeometry(len,.07,.35),corrEdge),e2=e1.clone();[e1,e2].forEach(function(e,k){e.position.set((a[0]+b[0])/2-Math.sin(-ang)*(k?-1:1)*(HW-.2)*-1,y+.02,(a[1]+b[1])/2+Math.cos(-ang)*(k?-1:1)*(HW-.2)*-1);e.rotation.y=-ang;g.add(e)})}
      poly.forEach(function(p){var d=new THREE.Mesh(new THREE.CylinderGeometry(HW,HW,.06,20),new THREE.MeshLambertMaterial({color:0xf6ecd6}));d.position.set(p[0],y,p[1]);g.add(d)})})});
  // courts: big inlaid ovals, a fountain or planter in the middle, benches
  var courtParts={};
  M.courts.forEach(function(c){c.levels.forEach(function(l){var g=levelGroups[LI[l]],y=(LI[l]-1)*FH+.05;
    var o=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.08,36),courtM);o.scale.set(c.rx,1,c.rz);o.position.set(c.x,y,c.z);o.receiveShadow=true;g.add(o);
    [.86,.7].forEach(function(k,i){var r=new THREE.Mesh(new THREE.TorusGeometry(1,.012,6,48),i?ringM2:ringM);r.rotation.x=Math.PI/2;r.scale.set(c.rx*k,c.rz*k,1);r.position.set(c.x,y+.07,c.z);g.add(r)});
    if(l==="L1"){
      var water=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.7,24),mat(0xd6c9ae));water.scale.set(Math.min(c.rx,c.rz)*.28,1,Math.min(c.rx,c.rz)*.28);water.position.set(c.x,y+.35,c.z);g.add(water);
      var wt=new THREE.Mesh(new THREE.CylinderGeometry(.92,.92,.1,24),mat(0x74b8c8,{emissive:0x0e2a33}));wt.scale.copy(water.scale);wt.position.set(c.x,y+.72,c.z);g.add(wt);
      for(var k=0;k<6;k++){var a=k/6*Math.PI*2+.4,bx=c.x+Math.cos(a)*c.rx*.58,bz=c.z+Math.sin(a)*c.rz*.58;box(bx-1.4,bz-.4,2.8,.8,y,.6,mat(0x9a6a42),g);
        if(k%2===0){var tr=new THREE.Mesh(new THREE.CylinderGeometry(.2,.3,2.6,6),mat(0x6b5436));tr.position.set(bx,y+1.3,bz+2.2);g.add(tr);var lf=new THREE.Mesh(new THREE.IcosahedronGeometry(1.7,0),mat(0x6f8f4a));lf.position.set(bx,y+3.6,bz+2.2);lf.castShadow=true;g.add(lf)}}}
    else{ // upper floor: a glass balustrade ring around the open middle
      var ring=new THREE.Mesh(new THREE.TorusGeometry(1,.05,6,48),mat(0xb7d4dc,{transparent:true,opacity:.75}));ring.rotation.x=Math.PI/2;ring.scale.set(c.rx*.42,c.rz*.42,1);ring.position.set(c.x,y+1.1,c.z);g.add(ring)}
  })});
  // barrel-vault skylight over the north court
  var vault=new THREE.Group();root.add(vault);
  (function(){var s=M.skylight,top=2*FH,rise=s.rise+2,ribM=mat(0xf4f1ea),rr=s.w/2;
    // semicircular profile along x, extruded along z
    var ex=new THREE.Mesh(new THREE.CylinderGeometry(rr,rr,s.d,28,1,true,Math.PI/2*0,Math.PI),new THREE.MeshLambertMaterial({color:0x9ed6e2,transparent:true,opacity:.42,side:THREE.DoubleSide,emissive:0x1c3b44}));
    ex.rotation.x=Math.PI/2;ex.rotation.y=0;ex.scale.set(1,1,rise/rr);
    // cylinder axis y -> rotate so the axis is along z; half circle opening upward
    ex.position.set(s.x+s.w/2,top+.8,s.z+s.d/2);ex.rotation.set(Math.PI/2,0,Math.PI);ex.scale.set(1,1,rise/rr);vault.add(ex);
    for(var z=0;z<=s.d;z+=s.d/14){var rib=new THREE.Mesh(new THREE.TorusGeometry(rr,.28,6,24,Math.PI),ribM);rib.scale.set(1,rise/rr,1);rib.position.set(s.x+s.w/2,top+.8,s.z+z);vault.add(rib)}
    // teal stripes the real roof has
    for(var z2=s.d/28;z2<s.d;z2+=s.d/7){var st=new THREE.Mesh(new THREE.CylinderGeometry(rr+.05,rr+.05,s.d/14,28,1,true,0,Math.PI),new THREE.MeshLambertMaterial({color:0x2c8f93,transparent:true,opacity:.8,side:THREE.DoubleSide}));st.rotation.set(Math.PI/2,0,Math.PI);st.scale.set(1,1,rise/rr);st.position.set(s.x+s.w/2,top+.85,s.z+z2+s.d/28);vault.add(st)}
  })();
  // escalators
  var escGroups=[];
  M.escalators.forEach(function(e){var g=new THREE.Group(),y0=(LI[e.from]-1)*FH,len=15,ang=Math.atan2(FH,len*.9);
    var run=Math.hypot(len*.9,FH),st=new THREE.Mesh(new THREE.BoxGeometry(2.4,.5,run),mat(0x8d8f95));st.position.set(e.x,y0+FH/2,e.z);st.rotation.x=ang;st.castShadow=true;g.add(st);
    for(var k=-1;k<=1;k+=2){var h=new THREE.Mesh(new THREE.BoxGeometry(.2,1.1,run),mat(0xb7d4dc,{transparent:true,opacity:.7}));h.position.set(e.x+k*1.3,y0+FH/2+.7,e.z);h.rotation.x=ang;g.add(h)}
    g.userData={lvl:LI[e.to]};root.add(g);escGroups.push(g)});
  // entrances
  M.entrances.forEach(function(e){var g=new THREE.Group();box(e.x-3,e.z-3,6,6,0,.3,mat(0xd9c49a),g);box(e.x-3.5,e.z-3.5,.5,.5,0,4.6,mat(0xf6f3ec),g);box(e.x+3,e.z-3.5,.5,.5,0,4.6,mat(0xf6f3ec),g);box(e.x-4,e.z-4,8,.8,4.6,.5,mat(0xc66a45),g);
    var s=sprite(e.name,{size:34,bg:"rgba(246,243,236,.95)",border:"#c66a45",worldH:3.4,w:512,h:96});s.position.set(e.x,7.6,e.z);g.add(s);g.userData.lvl=1;root.add(g);outsideEnt.push(g)});

  /* ---------- stores ---------- */
  var stores={},pickList=[],labelSprites=[];
  var hatchTex=canvasTex(64,64,function(g,w,h){g.fillStyle="#e9d9c4";g.fillRect(0,0,w,h);g.strokeStyle="rgba(176,120,92,.55)";g.lineWidth=5;g.beginPath();g.moveTo(-8,h+8);g.lineTo(w+8,-8);g.moveTo(-8,h/2+8);g.lineTo(w/2+8,-8);g.moveTo(w/2-8,h+8);g.lineTo(w+8,h/2-8);g.stroke()},true);
  var shelfCols=[0xb9885a,0x8a6a4a,0xd6c3a0,0xc9d3c0];
  M.stores.forEach(function(s){
    var lvl=LI[s.level],g=new THREE.Group(),y0=(lvl-1)*FH+.05,anchorStore=s.type==="A",fl=s.floors||1;
    var o={s:s,g:g,lvl:lvl,y0:y0,anchor:anchorStore,state:null,height:anchorStore?fl*FH:3.8};
    levelGroups[lvl].add(g);
    var cx=s.x+s.w/2,cz=s.z+s.d/2;
    // floor + boundary strip
    o.floorMat=new THREE.MeshLambertMaterial({map:hatchTex.clone()});o.floorMat.map.needsUpdate=true;o.floorMat.map.repeat.set(Math.max(1,s.w/8),Math.max(1,s.d/8));
    var fp=plane(s.x,s.z,s.w,s.d,y0+.03,o.floorMat,g);fp.castShadow=false;o.floor=fp;
    o.borderMat=new THREE.MeshLambertMaterial({color:0xb97a5e});
    var bt=.55;[[s.x,s.z,s.w,bt],[s.x,s.z+s.d-bt,s.w,bt],[s.x,s.z,bt,s.d],[s.x+s.w-bt,s.z,bt,s.d]].forEach(function(r){box(r[0],r[1],r[2],r[3],y0,.4,o.borderMat,g,false)});
    // walls
    o.wallMat=new THREE.MeshLambertMaterial({color:0xefe6d6});
    var wh=anchorStore?o.height:3.6;
    if(anchorStore){var body=box(s.x+.4,s.z+.4,s.w-.8,s.d-.8,y0,wh,o.wallMat,g);o.body=body;
      var roofCap=box(s.x,s.z,s.w,s.d,y0+wh,.8,mat(0xcfcac0),g);o.roofCap=roofCap}
    else{var wt=.35;[[s.x,s.z,s.w,wt],[s.x,s.z+s.d-wt,s.w,wt],[s.x,s.z,wt,s.d],[s.x+s.w-wt,s.z,wt,s.d]].forEach(function(r){var w=box(r[0],r[1],r[2],r[3],y0,wh,o.wallMat,g);o.walls=o.walls||[];o.walls.push(w)})}
    // sign band on the door side
    var dx=s.door.x-cx,dz=s.door.z-cz,side=Math.abs(dx)/s.w>Math.abs(dz)/s.d?(dx>0?"e":"w"):(dz>0?"s":"n");o.side=side;
    o.signMat=new THREE.MeshLambertMaterial({color:0xb97a5e});
    var sw=side==="n"||side==="s",sl=sw?s.w:s.d,hh=anchorStore?2.6:1.5,yb=y0+(anchorStore?Math.min(wh-3.2,5.5):wh-.1);
    var sg=new THREE.Mesh(new THREE.BoxGeometry(sw?sl-1:.8,hh,sw?.8:sl-1),o.signMat);
    sg.position.set(side==="e"?s.x+s.w+.4:side==="w"?s.x-.4:cx,yb+hh/2,side==="s"?s.z+s.d+.4:side==="n"?s.z-.4:cz);sg.castShadow=true;g.add(sg);o.sign=sg;
    // glass front (non-anchors)
    if(!anchorStore){var gl=new THREE.Mesh(new THREE.BoxGeometry(sw?sl-2:.15,wh-.6,sw?.15:sl-2),new THREE.MeshLambertMaterial({color:0xbfe4ee,transparent:true,opacity:.25}));
      gl.position.set(side==="e"?s.x+s.w:side==="w"?s.x:cx,y0+(wh-.6)/2,side==="s"?s.z+s.d:side==="n"?s.z:cz);g.add(gl)}
    // props live here
    o.props=new THREE.Group();g.add(o.props);
    // label
    o.label=null;
    // pick volume
    var pk=new THREE.Mesh(new THREE.BoxGeometry(s.w,o.height+1,s.d),new THREE.MeshBasicMaterial({visible:false}));pk.position.set(cx,y0+(o.height+1)/2,cz);pk.userData.store=s.id;g.add(pk);o.pick=pk;
    stores[s.id]=o;
  });
  var TIERNAMES={};

  /* ---------- state from the game ---------- */
  var colorTmp=new THREE.Color();
  function tint(hex,k,base){colorTmp.set(hex);var b=new THREE.Color(base||0xf6f1e6);return b.lerp(colorTmp,k)}
  function setStore(id,st){
    var o=stores[id];if(!o)return;o.state=st;var s=o.s;
    // props
    while(o.props.children.length)o.props.remove(o.props.children[0]);
    if(o.label){o.label.parent&&o.label.parent.remove(o.label);o.label.material.map.dispose();o.label=null}
    var name=st?st.name:(s.type==="A"?(s.tenant?"For lease · "+s.tenant:"Empty anchor"):s.tenant?"For lease":"For lease");
    if(st){
      o.floorMat.map=null;o.floorMat.color.copy(tint(st.color,.28,0xf4ecde));o.floorMat.needsUpdate=true;
      o.signMat.color.set(st.color);o.signMat.emissive&&o.signMat.emissive.set(0x000000);
      o.wallMat.color.copy(tint(st.color,.12,0xf6f1e6));o.borderMat.color.set(st.color).multiplyScalar(.8);
      if(!o.anchor){var n=Math.min(8,2+(st.lvl|0)*1.2|0),r=rng(id.length*97+n);
        for(var i=0;i<n;i++){var w=1.2+r()*Math.min(5,s.w*.25),d=.8+r()*Math.min(2.2,s.d*.15),px=s.x+1.5+r()*(s.w-w-3),pz=s.z+1.5+r()*(s.d-d-3);
          var h=.9+r()*1.3;var m=box(px,pz,w,d,o.y0,h,mat(shelfCols[i%4]),o.props);m.castShadow=true}
        if(s.type==="V"||s.type==="R")for(var k=0;k<3;k++){var t=box(s.x+3+k*(s.w-6)/3,s.z+s.d*.55,1.6,1.6,o.y0,.9,mat(0xe7ddc6),o.props)}}
      else{ // anchor interior is hidden under its roof; add a rooftop sign
      }
    }else{
      o.floorMat.map=hatchTex.clone();o.floorMat.map.needsUpdate=true;o.floorMat.map.repeat.set(Math.max(1,s.w/8),Math.max(1,s.d/8));o.floorMat.color.set(0xffffff);o.floorMat.needsUpdate=true;
      o.signMat.color.set(o.s.dark?0x2f2f33:0xc89b86);o.wallMat.color.set(o.s.dark?0x3a3a3e:0xe6d8c6);o.borderMat.color.set(o.s.dark?0x555560:0xb97a5e);
    }
    if(o.s.dark&&!st){o.wallMat.color.set(0x3a3a3e)}
    // label sprite (readable from far, and always on top)
    var big=o.anchor,txt=st?st.name:(o.s.dark?"Former Neiman Marcus":o.s.type==="A"?"Anchor for lease":"For lease");
    var sp=sprite(txt,{size:big?40:32,w:512,h:96,bg:st?"rgba(255,250,240,.94)":"rgba(240,226,212,.88)",border:st?st.color:"#b97a5e",worldH:big?8:4.6});
    sp.position.set(s.x+s.w/2,o.y0+(o.anchor?o.height:o.height)+3,s.z+s.d/2);o.g.add(sp);o.label=sp;sp.userData.minDist=0;sp.userData.big=big;
  }
  var sel=null,hov=null;
  function paint(id,on,color){var o=stores[id];if(!o)return;o.borderMat.emissive=o.borderMat.emissive||new THREE.Color();
    if(on){o.borderMat.color.set(color);o.borderMat.emissive.set(color).multiplyScalar(.55)}else{o.borderMat.emissive.set(0x000000);var st=o.state;o.borderMat.color.set(st?st.color:(o.s.dark?0x555560:0xb97a5e));if(st)o.borderMat.color.multiplyScalar(.8)}}
  function refreshMarks(){Object.keys(stores).forEach(function(id){paint(id,false)});if(hov&&hov!==sel)paint(hov,true,0xe8a23c);if(sel)paint(sel,true,0xd8481f)}

  /* ---------- cut: which levels and roofs show ---------- */
  var cut=1;
  function setCut(c){cut=c;
    for(var l=1;l<=3;l++)levelGroups[l].visible=(c===0)||l<=c;
    roofGroup.children.forEach(function(r){r.visible=(c===0)});
    vault.visible=true;vault.children.forEach(function(v){});
    Object.keys(stores).forEach(function(id){var o=stores[id];
      if(o.anchor){var h=Math.min(o.s.floors,c===0?o.s.floors:Math.max(c,1))*FH;if(h!==o.height){o.height=h;o.body.scale.y=h/(o.s.floors*FH);o.body.position.y=o.y0+h/2;o.roofCap.position.y=o.y0+h+.4;o.sign.position.y=o.y0+Math.min(h-3.2,5.5)+1.3;o.pick.scale.y=(h+1)/(o.s.floors*FH+1);o.pick.position.y=o.y0+(h+1)/2*(1)}}
      if(o.label){o.label.visible=c!==0;o.label.position.y=o.y0+(o.anchor?o.height+3:5.8)}
      o.visibleNow=c!==0&&(o.lvl===c||(o.anchor&&o.lvl<=c))});
    escGroups.forEach(function(g){g.visible=c!==0&&g.userData.lvl<=c});
    outsideEnt.forEach(function(g){g.visible=true});
    updatePickList();
  }
  function updatePickList(){pickList=[];Object.keys(stores).forEach(function(id){var o=stores[id];if(o.visibleNow&&levelGroups[o.lvl].visible)pickList.push(o.pick)})}

  /* ---------- camera + input ---------- */
  var cam=null,ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
  function pickAt(cx,cy){var r=renderer.domElement.getBoundingClientRect();mouse.set((cx-r.left)/r.width*2-1,-((cy-r.top)/r.height*2-1));ray.setFromCamera(mouse,camera);
    var hits=ray.intersectObjects(pickList,false);return hits.length?hits[0].object.userData.store:null}
  function size(){var w=container.clientWidth||800,h=container.clientHeight||600;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
  new (window.ResizeObserver||function(){this.observe=function(){}})(size).observe(container);window.addEventListener("resize",size);
  var down=null;
  renderer.domElement.addEventListener("pointerdown",function(e){down={x:e.clientX,y:e.clientY}});
  renderer.domElement.addEventListener("pointerup",function(e){if(!down||e.button!==0)return;var moved=Math.hypot(e.clientX-down.x,e.clientY-down.y)>5;down=null;
    if(moved||(cam&&(cam.dragged||cam.mode==="freefly")))return;var id=pickAt(e.clientX,e.clientY);opts.onPick&&opts.onPick(id,e)});
  var lastMove=0;
  renderer.domElement.addEventListener("pointermove",function(e){var n=performance.now();if(n-lastMove<50||(cam&&cam.mode==="freefly"))return;lastMove=n;var id=pickAt(e.clientX,e.clientY);
    if(id!==hov){hov=id;refreshMarks();renderer.domElement.style.cursor=id?"pointer":"";}opts.onHover&&opts.onHover(id,e)});
  renderer.domElement.addEventListener("pointerleave",function(){if(hov){hov=null;refreshMarks()}opts.onHover&&opts.onHover(null)});
  size();

  function floorAt(x,z,y){ // which floor the walker stands on: the level group visible and a slab under (x,z)
    var best=0;M.buildings.forEach(function(b){var r=b.rect;if(x>=r.x&&x<=r.x+r.w&&z>=r.z&&z<=r.z+r.d){var lv0=b.startLevel?LI[b.startLevel]:1;for(var f=0;f<b.floors;f++){var fy=(lv0+f-1)*FH;if(y>=fy-1.5||f===0&&lv0===1)best=Math.max(best,fy)}}});
    // escalator ramps ease between floors
    return best}
  function collide(fx,fz,tx,tz,y){ // keep the walker off shop interiors above their level, allow corridors and shop doors
    var lvl=Math.round(y/FH)+1,nx=tx,nz=tz;
    function inside(x,z){for(var id in stores){var o=stores[id],s=o.s;if(o.lvl!==lvl&&!(o.anchor&&lvl<=s.floors))continue;
      if(x>s.x+.6&&x<s.x+s.w-.6&&z>s.z+.6&&z<s.z+s.d-.6)return s}return null}
    if(inside(nx,nz)){if(!inside(tx,fz))nz=fz;else if(!inside(fx,tz))nx=fx;else{nx=fx;nz=fz}}
    // stay inside the building shell on the same level
    return [nx,nz]}

  var api={
    renderer:renderer,scene:scene,camera:camera,THREE:THREE,root:root,stores:stores,levelGroups:levelGroups,mall:M,
    setStore:setStore,setCut:setCut,get cut(){return cut},
    setSelected:function(id){sel=id;refreshMarks()},
    setTheme:function(name){themeName=name;T=THEMES[name]||THEMES.day;scene.background.setHex(T.sky);scene.fog.color.setHex(T.fog);hemi.color.setHex(T.hemiS);hemi.groundColor.setHex(T.hemiG);hemi.intensity=T.hemiI;sun.color.setHex(T.sun);sun.intensity=T.sunI;
      themed.forEach(function(t){t.m.color.setHex(T[t.kind])});glassTiles.forEach(function(g){g.material.emissive.setHex(T.glow?0x6a4e12:0)});
      sun.position.set(name==="dusk"?260:-160,name==="dusk"?110:260,name==="dusk"?-60:120)},
    attachCamera:function(lib,extra){cam=lib.createCameraController(Object.assign({camera:camera,domElement:renderer.domElement,bounds:{minX:B.minX,maxX:B.maxX,minZ:B.minZ,maxZ:B.maxZ},
      start:{x:40,z:-10,yaw:.18,pitch:.95,dist:520},minDist:25,maxDist:700,maxFlyHeight:200,getFloorY:floorAt,collide:collide},extra||{}));api.cam=cam;return cam},
    project:function(x,y,z){var v=new THREE.Vector3(x,y,z).project(camera),r=renderer.domElement.getBoundingClientRect();return {x:(v.x*.5+.5)*r.width+r.left,y:(-v.y*.5+.5)*r.height+r.top,behind:v.z>1}},
    focusStore:function(id){var o=stores[id];if(!o||!cam)return;cam.focusOn(o.s.x+o.s.w/2,o.s.z+o.s.d/2,Math.max(70,Math.min(cam.distance||150,150)))},
    update:function(dt){if(cam)cam.update(dt);moveCars(dt);
      // labels: anchors and tenants always, empty shops only when you are near; sized to stay readable
      var cp=camera.position;Object.keys(stores).forEach(function(id){var o=stores[id];if(!o.label)return;
        if(cut===0){o.label.visible=false;return}
        var d=Math.hypot(cp.x-(o.s.x+o.s.w/2),cp.y-o.y0,cp.z-(o.s.z+o.s.d/2));
        var fly=cam&&cam.mode==="freefly";o.label.visible=o.visibleNow&&(fly?d<70&&(!!o.state||d<30):(o.anchor||(o.state?d<420:d<130)));
        var h=Math.max(o.anchor?5:1.8,Math.min(o.anchor?16:8,d*(o.anchor?.034:.014)));o.label.scale.set(h*512/96,h,1)});
      renderer.render(scene,camera)}
  };
  setCut(1);api.setTheme("day");
  return api;
};
})();
