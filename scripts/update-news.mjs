// Google 뉴스 RSS → news.json (핵심 요약: 수치=blue bold, 인사이트=red)

import { writeFile } from 'node:fs/promises';

const TOPICS = [
  { id: 'ux', label: 'UX·디자인', q: 'UX 디자인 트렌드 OR 제품 디자인' },
  { id: 'health', label: 'AI 헬스케어', q: '의료 AI OR 디지털 헬스케어' },
  { id: 'samd', label: 'SaMD 규제', q: '디지털 의료기기 OR 의료기기 소프트웨어 허가 OR SaMD' },
  { id: 'it', label: 'IT 산업', q: '인공지능 빅테크 OR AI 반도체 OR 생성형 AI' },
];

const FEED = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:7d&hl=ko&gl=KR&ceid=KR:ko`;

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
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

function splitTitle(title, source) {
  let t = title, s = source;
  const i = title.lastIndexOf(' - ');
  if (i > 0) { t = title.slice(0, i); if (!s) s = title.slice(i + 3); }
  return { t: t.trim(), s: (s || '뉴스').trim() };
}

function extractNumbers(text) {
  const found = new Set();
  for (const re of [
    /\d[\d,]*(?:\.\d+)?%/g,
    /\d{4}년/g,
    /\d+선/g,
    /\d+(?:th|st|nd|rd)/gi,
    /\d[\d,]*(?:억|조|만|천)?(?:원|달러|USD|배|건|명|개|ms|fps|GB|TB|nm)/g,
  ]) {
    for (const m of text.matchAll(re)) {
      const v = m[0].trim();
      if (v.length >= 2 || /%|년|억|조|원|달러|건|명|개|배|선/.test(v)) found.add(v);
    }
  }
  return [...found];
}

function numSpan(v) {
  return `<strong class="num">${v}</strong>`;
}

function buildInsight(title, topicId) {
  const t = title.toLowerCase();
  const rules = [
    [/법|규제|허가|식약처|거버넌스|가이드라인|승인|인허가/, '규제 논의는 출시 일정보다 변경관리·추적 가능성·책임 소재를 먼저 묻는 방향으로 이동하고 있다.'],
    [/인공지능|생성형|\bAI\b|AI칩|반도체|칩|LLM|모델/, 'AI 관련 보도는 성능 수치만큼 배포 통제·검증 루프·현장 워크플로 적합성이 승패를 가른다.'],
    [/디지털.?헬스|의료|임상|환자|병원/, '헬스케어 디지털화는 기술 가능성보다 임상 유효성·데이터 거버넌스·책임 체계가 병목이 된다.'],
    [/UX|UI|디자인|서비스.?디자인|인하우스/, '디자인 조직과 프로세스 성숙도가 제품 경험의 상한과 출시 속도를 동시에 좌우한다.'],
    [/특허|ip|표준|라이선스/, '기술 경쟁은 기능 차별을 넘어 IP·표준·라이선스 포지셔닝 싸움으로 확장된다.'],
    [/투자|유치|시드|ipo|매출|점유/, '시장 재편기에는 기술 스토리보다 단위경제성·채널·규제 대응력이 더 자주 거론된다.'],
  ];
  for (const [re, msg] of rules) {
    if (re.test(t)) return msg;
  }
  const defaults = {
    ux: 'UX·디자인 트렌드는 화면 미학보다 조직 협업 방식과 검증 루프 설계로 읽히는 경우가 많다.',
    health: '디지털 헬스 보도는 임상 현장 수용성과 규제·급여 연결 여부가 핵심 변수다.',
    samd: 'SaMD·디지털 의료기기 이슈는 허가 이후 변경관리와 전주기 거버넌스로 무게중심이 옮겨간다.',
    it: 'IT·AI 산업은 모델 성능 경쟁과 동시에 인프라·안보·공급망 제약이 출시 전략을 규율한다.',
  };
  return defaults[topicId] || '업계는 단기 화제보다 구조적 변화—규제, 인프라, 조직 역량—를 더 오래 추적할 필요가 있다.';
}

function expandContext(title, topicLabel) {
  const t = title;
  if (/법|규제|허가|식약처|거버넌스|가이드라인/.test(t)) return `${topicLabel} 영역에서 규제 프레임과 산업 대응이 맞물리며`;
  if (/디자인|UX|UI|ux|ui|인하우스/.test(t)) return `${topicLabel} 업계에서 설계·조직·프로세스 이슈가 겹치며`;
  if (/인공지능|생성형|\bAI\b|AI칩|AI 반도체/.test(t)) return `${topicLabel} 분야에서 AI 도입과 거버넌스 논의가 겹치며`;
  if (/헬스|의료|임상|병원|디지털.?헬스/.test(t)) return `${topicLabel} 영역에서 임상·데이터·규제 논의가 동시에`;
  return `${topicLabel} 분야에서`;
}

function buildParas(title, source, topic, pub) {
  const { t, s } = splitTitle(title, source);
  const rd = relDate(pub);
  const nums = extractNumbers(t);
  const ctx = expandContext(t, topic.label);

  let p1 = `<p><strong class="num">${s}</strong>가 ${rd ? `<strong class="num">${rd}</strong> ` : ''}보도한 '${t}' 소식이다. ${ctx} 업계 관심이 모이고 있다.`;
  if (nums.length) {
    p1 += ` 보도에 등장하는 핵심 수치는 ${nums.map(numSpan).join(' · ')}이다.`;
  }
  p1 += '</p>';

  const insight = buildInsight(t, topic.id);
  const paras = [p1];
  if (insight) paras.push(`<p class="insight">${insight}</p>`);
  return paras;
}

function mk(it, topic) {
  const { t, s } = splitTitle(it.title, it.source);
  const rd = relDate(it.pub);
  return {
    tag: s + (rd ? ` · ${rd}` : ''),
    h4: t,
    paras: buildParas(it.title, it.source, topic, it.pub),
    src: [{ t: '원문 보기', u: it.link }],
  };
}

async function topicData(topic) {
  let res;
  try {
    res = await fetch(FEED(topic.q), { headers: { 'user-agent': 'Mozilla/5.0 (uxbrew-bot)' } });
  } catch (e) {
    console.error(topic.id, 'fetch error', e.message);
    return null;
  }
  if (!res.ok) {
    console.error(topic.id, 'http', res.status);
    return null;
  }

  const items = parseItems(await res.text()).slice(0, 4);
  if (!items.length) {
    console.error(topic.id, 'no items');
    return null;
  }

  const cards = items.map((it) => mk(it, topic));
  const f = cards[0];
  return {
    feature: {
      tag: '머리기사 · ' + f.tag,
      h4: f.h4,
      paras: f.paras,
      src: f.src,
    },
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
console.log('news.json updated:', Object.keys(out).filter((k) => k !== 'updated').join(', '));
