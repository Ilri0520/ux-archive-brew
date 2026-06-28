const UA = { 'User-Agent': 'ux-archive-brew/1.0 (local curation)' };

const queries = [
  'Monet', 'Matisse', 'Picasso', 'Mondrian', 'Seurat', 'Degas', 'Gauguin',
  "O'Keeffe", 'Klimt', 'Schiele', 'Modigliani', 'Klee', 'Kandinsky', 'Chagall',
  'Renoir', 'Cézanne', 'Toulouse-Lautrec', 'Munch', 'Demuth', 'Hopper',
  'Steichen', 'Stieglitz', 'Evans', 'Frank', 'Cunningham', 'Man Ray',
  'van Gogh', 'Manet', 'Hokusai', 'Memling', 'Ingres', 'Watkins', 'Homer',
];

async function search(q) {
  const url =
    'https://collectionapi.metmuseum.org/public/collection/v1/search?' +
    'hasImages=true&isPublicDomain=true&q=' + encodeURIComponent(q);
  const r = await fetch(url, { headers: UA });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.objectIDs || []).slice(0, 6);
}

async function detail(id) {
  const r = await fetch(
    'https://collectionapi.metmuseum.org/public/collection/v1/objects/' + id,
    { headers: UA }
  );
  if (!r.ok) return null;
  const o = await r.json();
  if (!o.isPublicDomain || !o.primaryImageSmall) return null;
  const img = o.primaryImage || o.primaryImageSmall;
  if (!img.includes('metmuseum.org')) return null;
  const yr = Number(o.objectBeginDate) || parseInt(String(o.objectDate || '').match(/\d{4}/)?.[0] || '0', 10);
  const dept = (o.department || '').toLowerCase();
  const cls = ((o.classification || '') + ' ' + (o.objectName || '')).toLowerCase();
  let k = '회화';
  if (dept.includes('photograph') || cls.includes('photograph')) k = '사진';
  else if (dept.includes('drawings') && (cls.includes('print') || cls.includes('woodcut') || cls.includes('etching'))) k = '판화';
  else if (dept.includes('drawings') || cls.includes('illustration')) k = '일러스트';
  else if (cls.includes('print') || dept.includes('print')) k = '판화';
  const era = yr >= 1850 ? 'modern' : yr >= 1700 ? 'early' : 'classic';
  return {
    a: (o.artistDisplayName || 'Unknown').replace(/\n.*/, ''),
    t: (o.title || '').replace(/\s+/g, ' ').slice(0, 70),
    y: o.objectDate || String(yr),
    yr,
    k,
    era,
    img,
  };
}

const seen = new Set();
const all = [];

for (const q of queries) {
  const ids = await search(q);
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const d = await detail(id);
      if (d && d.yr >= 1460) all.push(d);
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 120));
}

all.sort((a, b) => a.yr - b.yr);
const stats = {
  total: all.length,
  classic: all.filter((x) => x.era === 'classic').length,
  early: all.filter((x) => x.era === 'early').length,
  modern: all.filter((x) => x.era === 'modern').length,
  photo: all.filter((x) => x.k === '사진').length,
  illo: all.filter((x) => x.k === '일러스트').length,
};
console.error(JSON.stringify(stats));

// Dedupe by image URL
const uniq = [];
const imgs = new Set();
for (const w of all) {
  if (imgs.has(w.img)) continue;
  imgs.add(w.img);
  uniq.push(w);
}

function js(w) {
  return `{a:${JSON.stringify(w.a)},t:${JSON.stringify(w.t)},y:${JSON.stringify(w.y)},yr:${w.yr},k:${JSON.stringify(w.k)},era:${JSON.stringify(w.era)},img:${JSON.stringify(w.img)}}`;
}

console.log('const POOL=[\n' + uniq.map(js).join(',\n') + '\n];');
