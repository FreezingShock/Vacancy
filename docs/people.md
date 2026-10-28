# People (src/people.js)

Shoppers with an agenda. A plain script that exposes `window.VacancyPeople` (and `require()`s in Node).

## Use

```js
const nav = Vacancy.peopleNav();                         // from src/mall-data.js, meters
const crowd = VacancyPeople.create(nav, { units: 1 });   // units = plan units per metre
const people = VacancyPeople.createRenderer(THREE, crowd, { scene, camera });
crowd.setFootfall({ target: 250, mood: 0.6 });          // concurrent shoppers, mood 0..1
crowd.setStores([{ id, open: true, appeal: 0.7 }]);      // call when leases change
crowd.onVisit = e => { /* e.store.id: a shopper went inside */ };
// each frame
crowd.update(dtSeconds); people.update();
```

`update` accepts game-speed dt (it substeps). Pass the camera so far-away shoppers skip leg animation.

## What a shopper does
Enters at a parking entrance, then walks to a few stores. Choice is weighted by appeal and by how close the next store is to the last one. Mood sets how many stops. About half eat (a food stall, then a seat in a food court), some rest in a court. Groups of two to four share an agenda and travel together. Shoppers use escalators (queueing at the foot), step in and out of store doors, and leave by an entrance.

## Nav data shape
`levels [{id,z}]`, `corridors [{level,pts,halfWidth}]`, `courts [{level,x,y,r,kind:'court'|'food'}]`, `stores [{id,level,door,inside,kind:'shop'|'food'|'anchor',appeal,open}]`, `escalators [{a:{level,x,y},b:{...}}]`, `entrances [{level,x,y}]`. Crossing and touching corridors become junctions; doors, courts and entrances snap to the nearest corridor.

## Read-back
`crowd.n` active shoppers, `crowd.hi` highest used slot, typed arrays `pos` (x, y, elevation), `heading`, `pose` (0 walk, 1 idle, 2 sit, 3 hidden inside a store, 4 escalator), plus `crowd.stats` (visits per store id, escalator rides).

## Demo and tests
`npm start`, then open `/demo/people.html` (add `?mall` for the real nav). `npm run test:people` runs the headless test.
