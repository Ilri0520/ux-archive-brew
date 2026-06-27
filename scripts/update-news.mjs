// 무료 버전: Google 뉴스 RSS에서 주제별 최신 기사를 모아 news.json을 만든다.
// API 키 불필요. GitHub Actions의 Node 20+ 환경에서 전역 fetch로 동작한다.

import { writeFile } from 'node:fs/promises';

// 주제별 한국어 검색어 (hl=ko 라 한국어 기사 우선)
const TOPICS = [
  { id: 'ux',     label: 'UX·디자인',     q: 'UX 디자인 트렌드 OR 제품 디자인' },
  { id: 'health', label: 'AI 헬스케어',   q: '의료 AI OR 디지털 헬스케어' },
  { id: 'samd',   label: 'SaMD 규제',     q: '디지털 의료기기 OR 의료기기 소프트웨어 허가 OR SaMD' },
  { id: 'it',     label: 'IT 산업',       q: '인공지능 빅테크 OR AI 반도체 OR 생성형 AI' },
];

const FEED = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:7d&hl=ko&gl=KR&ceid=KR:ko`;

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')   // 잔여 태그 제거
    .trim();
}

function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const pick = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
      const x = r.exec(b);
      return x ? decode(x[1]) : '';
    };
    const title = pick('title');
    const link = pick('link');
    const pub = pick('pubDate');
    const source = pick('source');
    if (title && link) items.push({ title, link, pub, source });
  }
  return items;
}

function relDate(pub) {
  const d = new Date(pub);
  if (isNaN(d)) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`;
}

// Google 뉴스 제목은 보통 "헤드라인 - 출처명" 형식
function splitTitle(title, source) {
  let t = title, s = source;
  const i = title.lastIndexOf(' - ');
  if (i > 0) { t = title.slice(0, i); if (!s) s = title.slice(i + 3); }
  return { t: t.trim(), s: (s || '뉴스').trim() };
}

async function topicData(topic) {
  let res;
  try {
    res = await fetch(FEED(topic.q), { headers: { 'user-agent': 'Mozilla/5.0 (uxbrew-bot)' } });
  } catch (e) { console.error(topic.id, 'fetch error', e.message); return null; }
  if (!res.ok) { console.error(topic.id, 'http', res.status); return null; }

  const xml = await res.text();
  const items = parseItems(xml).slice(0, 4);
  if (!items.length) { console.error(topic.id, 'no items'); return null; }

  const mk = (it) => {
    const { t, s } = splitTitle(it.title, it.source);
    const rd = relDate(it.pub);
    return { tag: s + (rd ? ` · ${rd}` : ''), h4: t, para: `${s} 보도${rd ? ` · ${rd}` : ''}.`, src: [{ t: '원문 보기', u: it.link }] };
  };

  const cards = items.map(mk);
  const f = cards[0];
  return {
    feature: { tag: '머리기사 · ' + f.tag, h4: f.h4, paras: [`${topic.label} 분야 최신 소식. ` + f.para], src: f.src },
    items: cards.slice(1),
  };
}

const out = { updated: new Date().toISOString() };
for (const t of TOPICS) {
  const r = await topicData(t);
  if (r) out[t.id] = r;
  else console.error('skip', t.id);
}

if (Object.keys(out).length <= 1) {
  console.error('No topics collected — aborting so news.json is not emptied.');
  process.exit(1);
}

await writeFile('news.json', JSON.stringify(out, null, 2));
console.log('news.json updated:', Object.keys(out).filter(k => k !== 'updated').join(', '));
