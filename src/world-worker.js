import { World } from './world.js';

let world;
self.onmessage = ({data}) => {
  if (data.type === 'init') { world = new World(data.seed, data.edits); return; }
  if (!world) return;
  if (data.type === 'edit') { world.set(...data.block); return; }
  if (data.type === 'trim') { world.trim?.(...data.region); return; }
  if (data.type === 'mesh') {
    const { cx, cz, ticket } = data;
    const mesh = world.chunk(cx, cz);
    const transfer = [...new Set(Object.values(mesh).filter(Boolean).flatMap(part =>
      Object.values(part).filter(ArrayBuffer.isView).map(a => a.buffer)))];
    self.postMessage({ cx, cz, ticket, mesh }, transfer);
  }
};
