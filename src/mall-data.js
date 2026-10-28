/* Vacancy mall data. Shared by the renderer (mall-view.js), camera.js and people.js.
   Plain script: it fills window.Vacancy.mall and window.Vacancy.nav, so it also inlines into a single file.

   Units: METERS. Origin (0,0) is near the middle of the mall. +x is east (right on the map), +z is SOUTH (down on the map),
   so "north" is -z. Three.js y is UP. The map is oriented like Nathan's directory map and satellite screenshots
   (Target top-left, Nordstrom top-right). Positions come from the directory map in pixels, converted by toWorld().
   GUESSES (flagged, not measured): 1 map px = 0.457 m (1.5 ft), all level 2 and level 3 layouts, court names,
   corridor lines, entrance spots, escalator spots, the food court spot, the AMC block over the east wing, road names. */
(function(){
"use strict";
var V=window.Vacancy=window.Vacancy||{};
var lastPx=null,M_PER_PX=0.457,OX=660,OY=400;
function wx(ix){return Math.round((ix-OX)*M_PER_PX*10)/10}
function wz(iy){return Math.round((iy-OY)*M_PER_PX*10)/10}
function toWorld(ix,iy){return {x:wx(ix),z:wz(iy)}}
function rect(ix,iy,w,h){lastPx=[ix,iy,w,h];return {x:wx(ix),z:wz(iy),w:Math.round(w*M_PER_PX*10)/10,d:Math.round(h*M_PER_PX*10)/10}}

/* Floors. y is the floor surface height in meters, h is floor-to-floor. */
var FLOOR_H=7;
var LEVELS={L1:{id:"L1",name:"Level 1",y:0,h:FLOOR_H},L2:{id:"L2",name:"Level 2",y:FLOOR_H,h:FLOOR_H},L3:{id:"L3",name:"Level 3",y:2*FLOOR_H,h:FLOOR_H}};

/* Store rows: [name, ix, iy, w, h, type, tenant] in directory-map px. type: M inline shop, V large format, R restaurant,
   F food stall, S kiosk. */
var RAW=[["Zara",775,320,105,115,"V"],["H&M",502,445,55,115,"V"],["Abercrombie & Fitch",652,445,42,119,"V"],["Aritzia",740,445,45,115,"V"],["Uniqlo",612,445,36,119,"V"],["Cheesecake Factory",900,470,45,95,"R"],["Apple",625,277,60,65,"M"],["STK Steakhouse",1070,322,50,75,"R"],["Boarders",448,510,50,60,"M"],["Alo",833,445,45,65,"M"],["My Lil Town",400,268,80,34,"M"],["Aldo",778,130,30,85,"M"],["Cotton On",572,445,35,70,"M"],["American Eagle",834,222,34,70,"M"],["Arhaus",962,530,42,55,"V"],["PacSun",583,322,25,90,"M"],["Visions Studio",548,135,22,100,"M"],["Hermès",1005,520,55,40,"M"],["Shoe Palace",510,170,35,60,"M"],["Tilly's",528,322,28,75,"M"],["Saint Laurent",905,315,35,60,"M"],["Prada",945,450,42,50,"M"],["North Italia",833,515,40,45,"R"],["Celine",990,455,36,50,"M"],["Journeys",400,305,80,22,"M"],["Pro Image Sports",868,130,28,60,"M"],["Sephora",638,345,42,40,"M"],["Foot Locker",596,262,28,60,"M"],["Bottega Veneta",905,380,62,26,"M"],["Christian Dior",1030,478,40,40,"M"],["M. Sky",806,225,26,60,"M"],["Zumiez",573,155,28,55,"M"],["YoungLA",603,170,28,55,"M"],["Garage",610,348,24,64,"M"],["Aerie",870,262,38,40,"M"],["Adidas",840,130,25,60,"M"],["Hollister",558,355,24,60,"M"],["Hot Topic",530,270,35,40,"M"],["Lucky Brand",812,135,25,55,"M"],["Studs",720,475,19,55,"M"],["Charleys",636,133,24,50,"F"],["Villa Fresh Italian Kitchen",662,133,24,50,"F"],["Gengis Khan BBQ Grill",735,130,40,30,"F"],["Valentino",975,375,40,30,"M"],["maje",718,352,52,22,"M"],["5.11",908,130,38,28,"M"],["Corner unit",940,165,27,35,"M"],["Chipotle",735,162,40,26,"F"],["Bvlgari",1017,375,33,30,"M"],["Levi's",733,296,60,16,"M"],["M.A.C. Cosmetics",733,248,38,24,"M"],["Champs Sports",418,333,48,18,"M"],["BoxLunch",780,225,24,35,"M"],["Lululemon",752,274,34,20,"M"],["Lids",600,128,25,25,"S"],["Tesla",1085,462,25,25,"M"],["Panda Express",636,186,24,24,"F"],["Stone Oven",662,186,24,24,"F"],["Rothy's",740,332,30,15,"M"],["T-Mobile",468,470,22,15,"M"]];
var FOOD_COURT={"Charleys":"L2-F1","Villa Fresh Italian Kitchen":"L2-F2","Panda Express":"L2-F3","Stone Oven":"L2-F4","Gengis Khan BBQ Grill":"L2-F5","Chipotle":"L2-F6"};
/* Level 2 shops sit above Level 1 footprints. Tenants come from Nathan's Level 2 map, assigned by zone (colour blocks on the map);
   which exact unit holds which tenant is a guess. */
var L2ZONES=[
  {id:"nw",test:function(x,y){return y<236&&x<720},names:["It's Boba Time","Gap","Gap Kids","Cotton On Kids","abercrombie kids","Vans","Jane and Jack","Chubby Cafe"],by:"x"},
  {id:"ne",test:function(x,y){return y<300&&x>=720||x>=900&&y<300},names:["Coach","Warby Parker","TUMI","Anthropologie","Capital One Cafe","gorjana","Sunsations","HealthZen Wellness Center"],by:"x"},
  {id:"cw",test:function(x,y){return x<700&&y>=236&&y<440},names:["COS","Louis Vuitton","Cartier","Rolex","Versace","Jimmy Choo","Philipp Plein","Panerai","Sandro","7th Avenue","Victoria's Secret","LEGO","Crocs","JD Sports","Windsor","Sunglass Hut","Bath & Body Works","LensCrafters"],by:"x"},
  {id:"ce",test:function(x,y){return x>=700&&x<900&&y>=236&&y<440},names:["Zara","Gucci","Burberry","TAG Heuer","Ferragamo","BOSS","FP Movement","Madewell","Suitsupply","Kendra Scott","Great Big Game Show"],by:"y"},
  {id:"s",test:function(x,y){return y>=440&&x<900},names:["Balenciaga","Urban Outfitters","Dolce & Gabbana","St. John","Tiffany & Co.","Dr. Martens"],by:"x"},
  {id:"e",test:function(x,y){return x>=900},names:["Din Tai Fung","Kabob Social","Ozzy's Apizza","Mini Kabob","JINYA Ramen Bar","Chubby Cove","Kura Revolving Sushi Bar","Chain","The Loop"],by:"y",social:true}
];
var SOCIAL_IDS=["L1-F1","L1-F2","L1-F3","L1-F4","L1-F5","L1-F6"];
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function areaOf(ix,iy){return ix>=900&&iy>=300&&iy<=600?"East luxury wing":ix<490&&iy>=250&&iy<=420?"West wing":iy<250?"North strip":iy<320?"North concourse":iy<440?"Center blocks":"South row"}

/* stores[]: every leasable lot. id is the SAME id the saved games use (localStorage topanga-tycoon-v1), never rename.
   x,z = north-west corner, w = size along x, d = size along z. level = floor the shop opens on. floors = how many floors it rises.
   tenant = real-world tenant (plain text) or null. door = {x,z} where its entrance meets a corridor (filled in below). */
var stores=[],areaN={},twin=0;
function add(o){o.px=o.px||lastPx;o.sq=o.sq||Math.round(o.w*o.d/0.0929/100)*100;stores.push(o)}
var l1rows=[];
RAW.forEach(function(r){
  var name=r[0],ix=r[1],iy=r[2],w=r[3],h=r[4],t=r[5],fc=FOOD_COURT[name],area=areaOf(ix,iy),b=rect(ix,iy,w,h);
  if(fc){add({id:fc,level:"L1",type:"F",x:b.x,z:b.z,w:b.w,d:b.d,floors:1,name:"Food stall "+fc.slice(4),tenant:name,area:"North food stalls"});return}
  areaN[area]=(areaN[area]||0)+1;
  add({id:"L1-"+slug(name),level:"L1",type:t,x:b.x,z:b.z,w:b.w,d:b.d,floors:1,name:area+" "+areaN[area],tenant:name==="Corner unit"?null:name,area:area});
  if(t!=="S"&&t!=="F")l1rows.push({ix:ix,iy:iy,w:w,h:h,t:t,cx:ix+w/2,cy:iy+h/2})});
// Level 2: a twin of every Level 1 inline shop, filled with the Level 2 tenants of its zone
L2ZONES.forEach(function(z){
  var list=l1rows.filter(function(r){return z.test(r.cx,r.cy)&&!r.used});list.forEach(function(r){r.used=1});
  list.sort(function(a,b){return z.by==="x"?a.cx-b.cx:a.cy-b.cy});
  list.forEach(function(r,i){var b=rect(r.ix,r.iy,r.w,r.h),nm=z.names[i]||null,social=z.social&&i>=1&&i<=6,id=social?SOCIAL_IDS[i-1]:"L2-T"+(++twin);
    add({id:id,level:"L2",type:social?"F":(r.t==="V"||r.t==="R")&&!nm?"V":r.t==="R"?"M":r.t,x:b.x,z:b.z,w:b.w,d:b.d,floors:1,name:social?"Topanga Social stall "+i:"Upper concourse "+twin,tenant:nm,area:social?"Topanga Social":"Level 2"})})});
function anchor(id,ix,iy,w,h,name,tenant,extra){var b=rect(ix,iy,w,h),o={id:id,level:"L1",type:"A",x:b.x,z:b.z,w:b.w,d:b.d,name:name,tenant:tenant};for(var k in extra)o[k]=extra[k];add(o)}
anchor("L2-AW",208,112,255,140,"North anchor, west","Target",{floors:2,sq:160000});
anchor("L1-AW",242,357,225,150,"West anchor","Macy's",{floors:3,sq:233000});
anchor("L1-AE",968,110,157,185,"North anchor, east","Nordstrom",{floors:3,sq:204000});
// The first Nordstrom (1984) on the south side became Neiman Marcus in 2008. Neiman Marcus closed it in May 2026.
anchor("L2-AE",622,565,155,165,"Former Neiman Marcus",null,{floors:2,sq:118000,dark:"FORMER NEIMAN MARCUS",note:"Neiman Marcus closed this store in May 2026. The anchor is empty, ready to re-lease."});
// AMC Dine-In sits on Level 3 above the east luxury wing (a guess from the satellite view).
(function(){var b=rect(960,330,165,190);add({id:"L2-E1",level:"L3",type:"E",x:b.x,z:b.z,w:b.w,d:b.d,floors:1,name:"Level 3 cinema",tenant:"AMC Dine-In Topanga 12",area:"Level 3"})})();

/* Building masses. Each has a footprint and a number of floors. */
var buildings=[
  {id:"shell",name:"Main mall",floors:2,rect:rect(400,110,725,490)},
  {id:"amc",name:"AMC Dine-In block",floors:1,startLevel:"L3",rect:rect(930,330,195,190)}
];

/* Courts: the six open centers circled in red on the directory map. Open to every floor they touch (double height). */
function court(id,name,ix,iy,rxp,rzp,shape,extra){var c=toWorld(ix,iy),o={id:id,name:name,x:c.x,z:c.z,rx:Math.round(rxp*M_PER_PX*10)/10,rz:Math.round(rzp*M_PER_PX*10)/10,shape:shape||"oval",levels:["L1","L2"]};for(var k in extra)o[k]=extra[k];return o}
var courts=[
  court("court-nw","Target Court",486,250,52,55),
  court("court-n","Center Court",706,270,45,100,"barrel",{skylight:true}),
  court("court-ne","Nordstrom Court",916,203,48,46),
  court("court-w","Macy's Court",483,425,50,58),
  court("court-s","The Luxury Collection",706,430,62,50),
  court("court-e","Social Court",895,430,62,66,"oval",{levels:["L1","L2","L3"]})
];
/* Barrel-vault skylight over the North Court: the striped glass roof seen in the satellite view. */
var skylight=(function(){var a=toWorld(679,164),b=toWorld(744,357);return {x:a.x,z:a.z,w:Math.round((b.x-a.x)*10)/10,d:Math.round((b.z-a.z)*10)/10,axis:"z",rise:6}})();

/* Corridors: centerlines in map px per level, straightened from the directory map. Vertices that touch share coordinates. */
var CORR_PX={
  L1:[ // the main loop
    [[486,250],[560,240],[640,236],[706,232],[800,212],[900,205],[916,203]],          // north concourse
    [[486,250],[486,338],[483,425]],                                                  // west spine
    [[483,425],[565,430],[706,430],[800,430],[895,430],[1085,433]],                   // south spine out to the east door
    [[706,112],[706,232],[706,270],[706,430],[706,565]],                              // central walkway, north door to the south anchor
    [[916,203],[895,250],[895,430]],                                                  // east spine
    [[1085,433],[1085,571],[1098,571]]                                                // spur to the Grand Entrance
  ],
  L3:[[[935,430],[955,430]]]
};
CORR_PX.L2=CORR_PX.L1.slice(0,6);
var corridors={};
Object.keys(CORR_PX).forEach(function(l){corridors[l]=CORR_PX[l].map(function(poly){return poly.map(function(p){var w=toWorld(p[0],p[1]);return [w.x,w.z]})})});

/* Escalators between levels. Each sits on a corridor; ix,iy in map px. */
var escalators=[
  {id:"esc-n",ix:706,iy:320,from:"L1",to:"L2"},{id:"esc-s",ix:745,iy:430,from:"L1",to:"L2"},{id:"esc-e",ix:855,iy:430,from:"L1",to:"L2"},
  {id:"esc-e3",ix:935,iy:430,from:"L2",to:"L3"}
].map(function(e){var w=toWorld(e.ix,e.iy);e.x=w.x;e.z=w.z;delete e.ix;delete e.iy;return e});

/* Entrances from the parking, at corridor ends. */
var entrances=[
  {id:"door-nw",name:"Northwest entrance",ix:440,iy:250},{id:"door-n",name:"North entrance",ix:706,iy:112},
  {id:"door-ne",name:"Northeast entrance",ix:955,iy:203},{id:"door-e",name:"East entrance",ix:1085,iy:433},
  {id:"door-grand",name:"Grand Entrance",ix:1098,iy:571},{id:"door-s",name:"South anchor entrance",ix:706,iy:565}
].map(function(e){var w=toWorld(e.ix,e.iy);return {id:e.id,name:e.name,x:w.x,z:w.z,level:"L1"}});

/* Food court seating on Level 2 (stalls are L2-F1..F6, north strip). */
var seating=[{id:"fc-seating",level:"L1",rect:rect(630,225,110,6)}];

/* Outside the building. All rectangles in meters. */
var roads=[
  {id:"owensmouth",name:"Owensmouth Ave",axis:"x",rect:rect(-120,-28,1700,46),lanes:4},
  {id:"topanga-canyon",name:"Topanga Canyon Blvd",axis:"x",rect:rect(-120,771,1700,46),lanes:4},
  {id:"victory",name:"Victory Blvd",axis:"z",rect:rect(1355,-28,46,845),lanes:4},
  {id:"west-road",name:null,axis:"z",rect:rect(-116,-28,46,845),lanes:2}
];
var parking=[
  {id:"p-north",name:"North garage",kind:"garage",floors:2,solar:true,rect:rect(465,18,635,92)},
  {id:"p-west",name:"West garage",kind:"garage",floors:2,solar:true,rect:rect(110,152,98,150)},
  {id:"p-sw",name:"Southwest lot",kind:"surface",rect:rect(70,320,172,330)},
  {id:"p-sw2",name:"South of Macy's",kind:"surface",rect:rect(250,520,330,200)},
  {id:"p-s1",name:"South lot",kind:"surface",rect:rect(790,575,170,200)},
  {id:"p-s2",name:"Southeast lot",kind:"surface",rect:rect(970,575,380,200)},
  {id:"p-e",name:"East lot",kind:"surface",rect:rect(1130,40,220,530)},
  {id:"p-w2",name:"Macy's lot",kind:"surface",rect:rect(36,330,120,150)}
];
var plaza={id:"amc-plaza",name:"Grand Entrance plaza",rect:rect(1000,590,140,120)};
var curbside={id:"curbside",name:"Curbside Pickup",rect:rect(740,34,76,70)};

/* ---- Navigation graph. Nodes at corridor vertices and shop doors; edges along corridors, escalators between levels. ---- */
var nodes=[],edges=[],byId={};
function nid(level,x,z){return level+":"+x.toFixed(1)+","+z.toFixed(1)}
function node(level,x,z,kind,extra){var id=nid(level,x,z);if(byId[id])return byId[id];var n={id:id,level:level,x:x,z:z,kind:kind||"path"};if(extra)for(var k in extra)n[k]=extra[k];byId[id]=n;nodes.push(n);return n}
function link(a,b,kind){if(a===b)return;edges.push({a:a.id,b:b.id,len:Math.hypot(a.x-b.x,a.z-b.z),kind:kind||"walk"})}
var segs=[];
Object.keys(corridors).forEach(function(l){corridors[l].forEach(function(poly){for(var i=1;i<poly.length;i++)segs.push({level:l,a:poly[i-1],b:poly[i]})})});
// split corridor segments at every shared vertex, shop door foot and entrance foot
function foot(s,p){var dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],L=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((p.x-s.a[0])*dx+(p.z-s.a[1])*dz)/L));return {x:s.a[0]+t*dx,z:s.a[1]+t*dz,t:t}}
function nearestSeg(level,p){var best=null;segs.forEach(function(s){if(s.level!==level)return;var f=foot(s,p),d=Math.hypot(f.x-p.x,f.z-p.z);if(!best||d<best.d)best={d:d,x:f.x,z:f.z,s:s}});return best}
var splits=[];
stores.forEach(function(s){
  var cx=s.x+s.w/2,cz=s.z+s.d/2,n=nearestSeg(s.level,{x:cx,z:cz});if(!n)return;
  var dx=n.x-cx,dz=n.z-cz,ax=Math.abs(dx)/s.w,az=Math.abs(dz)/s.d,door;
  if(ax>az)door={x:dx>0?s.x+s.w:s.x,z:Math.max(s.z+1,Math.min(s.z+s.d-1,n.z))};
  else door={x:Math.max(s.x+1,Math.min(s.x+s.w-1,n.x)),z:dz>0?s.z+s.d:s.z};
  s.door={x:Math.round(door.x*10)/10,z:Math.round(door.z*10)/10};
  var f=nearestSeg(s.level,s.door);splits.push({level:s.level,seg:f.s,x:f.x,z:f.z,store:s,door:s.door})});
entrances.forEach(function(e){var f=nearestSeg(e.level,e);splits.push({level:e.level,seg:f.s,x:f.x,z:f.z,entrance:e})});
courts.forEach(function(c){c.levels.forEach(function(l){var f=nearestSeg(l,c);if(f)splits.push({level:l,seg:f.s,x:f.x,z:f.z,court:c})})});
escalators.forEach(function(e){[e.from,e.to].forEach(function(l){var f=nearestSeg(l,e);splits.push({level:l,seg:f.s,x:f.x,z:f.z,escal:e,ex:e.x,ez:e.z})})});
// build per segment ordered node lists
segs.forEach(function(s){s.pts=[{x:s.a[0],z:s.a[1],t:0,kind:"path"},{x:s.b[0],z:s.b[1],t:1,kind:"path"}]});
splits.forEach(function(sp){var s=sp.seg,dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],L=dx*dx+dz*dz||1,t=((sp.x-s.a[0])*dx+(sp.z-s.a[1])*dz)/L;s.pts.push({x:sp.x,z:sp.z,t:t,kind:sp.store?"door":sp.entrance?"entrance":sp.escal?"path":"court",sp:sp})});
segs.forEach(function(s){
  s.pts.sort(function(p,q){return p.t-q.t});
  var prev=null;
  s.pts.forEach(function(p){
    var n=node(s.level,p.x,p.z,p.kind==="path"?"path":p.kind==="door"?"path":p.kind,p.sp&&p.sp.court?{court:p.sp.court.id}:p.sp&&p.sp.entrance?{entrance:p.sp.entrance.id}:null);
    if(p.sp&&p.sp.court)n.court=p.sp.court.id;if(p.sp&&p.sp.entrance){n.kind="entrance";n.entrance=p.sp.entrance.id}
    if(p.sp&&p.sp.store){var d=node(s.level,p.sp.door.x,p.sp.door.z,"door",{store:p.sp.store.id});p.sp.store.node=d.id;link(n,d,"door")}
    if(p.sp&&p.sp.escal){var e=p.sp.escal,en=node(s.level,e.x,e.z,"escalator",{escalator:e.id});link(n,en,"door");if(s.level===e.from)e.nodeA=en.id;if(s.level===e.to)e.nodeB=en.id}
    if(prev)link(prev,n);prev=n})});
escalators.forEach(function(e){var a=byId[e.nodeA],b=byId[e.nodeB];if(a&&b)link(a,b,"escalator")});
var adj={};edges.forEach(function(e){(adj[e.a]=adj[e.a]||[]).push({to:e.b,len:e.len,kind:e.kind});(adj[e.b]=adj[e.b]||[]).push({to:e.a,len:e.len,kind:e.kind})});
/* path(fromId,toId) -> array of nodes (Dijkstra). Ids are node ids, store ids (their door node) or entrance ids. */
function resolve(id){if(byId[id])return byId[id];for(var i=0;i<stores.length;i++)if(stores[i].id===id)return byId[stores[i].node];for(i=0;i<nodes.length;i++)if(nodes[i].entrance===id)return nodes[i];return null}
function path(from,to){var a=resolve(from),b=resolve(to);if(!a||!b)return null;
  var dist={},prev={},done={},open=[a.id];dist[a.id]=0;
  while(open.length){open.sort(function(p,q){return dist[p]-dist[q]});var u=open.shift();if(done[u])continue;done[u]=1;if(u===b.id)break;
    (adj[u]||[]).forEach(function(e){var d=dist[u]+e.len;if(dist[e.to]===undefined||d<dist[e.to]){dist[e.to]=d;prev[e.to]=u;open.push(e.to)}})}
  if(dist[b.id]===undefined)return null;var out=[],c=b.id;while(c){out.unshift(byId[c]);c=prev[c]}return out}
/* nearest node on a level to a point */
function nearest(level,x,z){var best=null;nodes.forEach(function(n){if(n.level!==level)return;var d=Math.hypot(n.x-x,n.z-z);if(!best||d<best.d)best={d:d,n:n}});return best&&best.n}

V.mall={
  version:1,units:"meters",mPerPx:M_PER_PX,floorHeight:FLOOR_H,levels:LEVELS,
  bounds:{minX:wx(-120),maxX:wx(1400),minZ:wz(-28),maxZ:wz(817)},
  stores:stores,storeById:function(id){for(var i=0;i<stores.length;i++)if(stores[i].id===id)return stores[i]},
  buildings:buildings,courts:courts,skylight:skylight,corridors:corridors,escalators:escalators,entrances:entrances,seating:seating,
  roads:roads,parking:parking,plaza:plaza,curbside:curbside,toWorld:toWorld,
  guesses:["1 map px = 0.457 m","Level 2 and 3 layouts","court names and the sixth court","corridor lines","entrance and escalator spots","AMC block above the east wing","Topanga Social is the flat building south of Macy's","west road name"]
};

/* Adapter for people.js: the shape its simulation wants. Plan x = world x, plan y = world z (south), level 0..2, elevation = y. */
V.peopleNav=function(){
  var li={L1:0,L2:1,L3:2},H=FLOOR_H,out={levels:[{id:0,z:0},{id:1,z:H},{id:2,z:2*H}],corridors:[],courts:[],stores:[],escalators:[],entrances:[]};
  Object.keys(corridors).forEach(function(l){corridors[l].forEach(function(poly){out.corridors.push({level:li[l],pts:poly.map(function(p){return [p[0],p[1]]}),halfWidth:4})})});
  courts.forEach(function(c){c.levels.forEach(function(l){out.courts.push({level:li[l],x:c.x,y:c.z,r:(c.rx+c.rz)/2,kind:"court"})})});
  seating.forEach(function(s){out.courts.push({level:li[s.level],x:s.rect.x+s.rect.w/2,y:s.rect.z+s.rect.d/2,r:8,kind:"food"})});
  stores.forEach(function(s){var cx=s.x+s.w/2,cz=s.z+s.d/2,dx=cx-s.door.x,dz=cz-s.door.z,L=Math.hypot(dx,dz)||1;
    out.stores.push({id:s.id,level:li[s.level],door:[s.door.x,s.door.z],inside:[s.door.x+dx/L*1.5,s.door.z+dz/L*1.5],kind:s.type==="F"?"food":s.type==="A"?"anchor":"shop",appeal:.5,open:true})});
  escalators.forEach(function(e){out.escalators.push({a:{level:li[e.from],x:e.x,y:e.z},b:{level:li[e.to],x:e.x,y:e.z}})});
  entrances.forEach(function(e){out.entrances.push({level:0,x:e.x,y:e.z,kind:"parking"})});
  return out};
V.nav={nodes:nodes,edges:edges,adj:adj,byId:byId,path:path,resolve:resolve,nearest:nearest};
})();
