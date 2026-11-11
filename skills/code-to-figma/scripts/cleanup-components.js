// Removes unused main components from the Components section (use_figma). After screens are rebuilt, old main components and variants stay on the shelf and take up memory.
// Unused: no instances, or all instances are inside other unused main components. The latter only free up after the former are deleted; this lists them all at once so the user confirms only once.
// Usage: replace COMP_SECTION_ID with the node id of "<section name> · Components", run once with APPROVED_IDS empty, and show the returned list to the user;
// after the user agrees and a version has been saved, paste the ids returned with the list into APPROVED_IDS and run again. Only components on the list are deleted; components that became unused in between are listed, not deleted.
// Deleting counts as a write, so follow SKILL.md "Hard rules for writing to Figma".
const COMP_SECTION_ID = 'REPLACE_ME';
const APPROVED_IDS = [];
const section = await figma.getNodeByIdAsync(COMP_SECTION_ID);
if (!section || section.type !== 'SECTION') throw new Error('not a section: ' + COMP_SECTION_ID);
let page = section; while (page.type !== 'PAGE') page = page.parent;
await figma.setCurrentPageAsync(page);
const regNode = section.children.find(n => n.type === 'TEXT' && n.name === '_registry');
const reg = regNode ? JSON.parse(regNode.characters || '{}') : {};

const comps = section.findAllWithCriteria({ types: ['COMPONENT'] });
const insts = new Map();
for (const c of comps) insts.set(c.id, await c.getInstancesAsync());
const hostOf = n => { for (let p = n.parent; p; p = p.parent) if (p.type === 'COMPONENT') return p.id; return null; };
// Work inward one round at a time. The list order is the deletion order: outer components are deleted first, their inner instances disappear with them, and by the time an inner component's turn comes it has no instances
const unused = [], dead = new Set();
for (let grew = true; grew;) {
  grew = false;
  for (const c of comps) {
    if (dead.has(c.id) || !insts.get(c.id).every(i => dead.has(hostOf(i)))) continue;
    const owner = c.parent.type === 'COMPONENT_SET' ? c.parent : null;
    unused.push({ id: c.id, name: owner ? `${owner.name} / ${c.name}` : c.name, setId: owner ? owner.id : null, nested: insts.get(c.id).length > 0 });
    dead.add(c.id); grew = true;
  }
}
if (!APPROVED_IDS.length) return { unused: unused.length, nestedOnly: unused.filter(u => u.nested).length, list: unused.map(u => u.name + (u.nested ? ' (used only by other old components)' : '')), ids: unused.map(u => u.id), note: 'After the user agrees and a version has been saved, paste ids into APPROVED_IDS and run again' };

const approved = new Set(APPROVED_IDS), gone = new Set();
// Within one run, instances inside deleted outer components are still returned by getInstancesAsync and their removed is still false, so only the parent chain can tell.
// Judge by the set actually deleted: when an outer component is skipped, inner components used only by it must stay too, or its instances would lose their main component
const live = i => { try { return !i.removed && !gone.has(hostOf(i)); } catch (e) { return false; } };
const removed = [], skipped = [], notApproved = [];
for (const u of unused) {
  if (!approved.has(u.id)) { notApproved.push(u.name); continue; }
  const c = await figma.getNodeByIdAsync(u.id);
  if (!c) continue;
  if ((await c.getInstancesAsync()).some(live)) { skipped.push(u.name); continue; }
  const set = u.setId ? await figma.getNodeByIdAsync(u.setId) : null;
  c.remove(); removed.push(u.id); gone.add(u.id);
  // Also delete a component set whose variants have all been deleted
  if (set && !set.removed && set.type === 'COMPONENT_SET' && !set.children.length) set.remove();
}
// Components that came into use after the user approved are not on this run's list and are not deleted
const nowUsed = APPROVED_IDS.filter(id => !dead.has(id));
// Remove registry keys that point to deleted components, so the next screen build creates clean main components
let regKeys = 0;
for (const [k, v] of Object.entries(reg)) if (typeof v === 'string' && gone.has(v)) { delete reg[k]; regKeys++; }
// Changing text without loading its font first throws, and use_figma rolls back the whole batch, so the deletions above would not count either
if (regNode) { await figma.loadFontAsync(regNode.fontName); regNode.characters = JSON.stringify(reg); }
return { removed: removed.length, skipped, notApproved, nowUsed, registryKeysRemoved: regKeys, mutatedNodeIds: removed };
