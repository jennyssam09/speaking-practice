(function () {
'use strict';

/* ---------- 저장 (localStorage, 막혀 있어도 동작) ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let lessons = LS.get('sp.lessons', []);
if (!Array.isArray(lessons)) lessons = [];
let marks = LS.get('sp.marks', {});     // 다시 볼 카드
let checks = LS.get('sp.checks', {});   // 따라 말했어요
let prefs = Object.assign({ rate: 0.9, voice: '', last: '', tab: 'cards' }, LS.get('sp.prefs', {}));
const saveLessons = () => LS.set('sp.lessons', lessons);
const saveMarks = () => LS.set('sp.marks', marks);
const saveChecks = () => LS.set('sp.checks', checks);
const savePrefs = () => LS.set('sp.prefs', prefs);

/* ---------- 작은 도우미 ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const k in (props || {})) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
  return el;
}
const $ = s => document.querySelector(s);
const str = v => typeof v === 'string' && v.trim() !== '';
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const byId = id => lessons.find(l => l.id === id);
const norm = s => String(s).toLowerCase().replace(/[‘’ʼ`´]/g, "'").replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

/* ---------- 음성 ---------- */
const synth = window.speechSynthesis;
let voices = [], speakId = 0, curAudio = null, paraReset = null;
const TOY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph)\b/i;
const FEMALE = [/Google US English/i, /Samantha/i, /^Ava\b/i, /Allison/i, /Nicky/i, /^Flo\b/i, /^Sandy/i, /^Shelley/i];
const MALE = [/Evan/i, /Aaron/i, /^Alex\b/i, /^Tom\b/i, /^Reed/i, /^Eddy/i, /^Rocko/i, /^Grandpa/i];
function loadVoices() {
  if (!synth) return;
  const us = synth.getVoices().filter(v => /^en[-_]US/i.test(v.lang) && !TOY.test(v.name));
  const find = list => { for (const r of list) { const v = us.find(x => r.test(x.name)); if (v) return v; } return null; };
  const f = find(FEMALE), m = find(MALE);
  voices = [];
  if (f) { f.label = '미국식 여성 · ' + f.name.replace(/\s*\(.*\)/, ''); voices.push(f); }
  if (m) { m.label = '미국식 남성 · ' + m.name.replace(/\s*\(.*\)/, ''); voices.push(m); }
  if (!voices.length && us[0]) { us[0].label = us[0].name; voices.push(us[0]); }
  refreshBar();
}
if (synth) { loadVoices(); synth.addEventListener ? synth.addEventListener('voiceschanged', loadVoices) : (synth.onvoiceschanged = loadVoices); }
function pickVoice() { return voices.find(v => v.voiceURI === prefs.voice) || voices[0] || null; }
function speak(text, onend) {
  if (!synth) return;
  synth.cancel(); stopAudio();
  const id = ++speakId;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = prefs.rate;
  const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; }
  u.onend = () => { if (id === speakId && onend) onend(); };
  synth.speak(u);
}
function stopAudio() { if (curAudio) { try { curAudio.pause(); } catch (e) {} curAudio = null; } }
function stopSpeech() {
  speakId++; if (synth) synth.cancel(); stopAudio();
  if (paraReset) paraReset();
}
function refreshBar() {
  const bar = $('#speechbar'); if (!bar) return;
  bar.innerHTML = '';
  if (!synth) { bar.append(h('p', { class: 'warn', text: '이 브라우저는 음성 읽기를 지원하지 않아요. 크롬이나 사파리에서 열어 주세요.' })); return; }
  if (!voices.length) {
    bar.append(h('p', { class: 'warn', text: '영어 음성을 찾지 못했어요. 시스템 설정 → 손쉬운 사용 → 읽기 및 말하기에서 영어 음성을 추가하세요. (추가한 뒤 이 페이지를 새로고침해 주세요)' }));
    return;
  }
  const cur = pickVoice();
  const rate = h('select', { onchange: e => { prefs.rate = parseFloat(e.target.value); savePrefs(); } },
    [0.75, 0.9, 1.0].map(r => h('option', { value: r, text: r === 1 ? '1.0' : String(r), selected: prefs.rate === r })));
  const vsel = h('select', { onchange: e => { prefs.voice = e.target.value; savePrefs(); } },
    voices.map(v => h('option', { value: v.voiceURI, text: v.label, selected: cur && cur.voiceURI === v.voiceURI })));
  bar.append(h('label', {}, '영어 음성 ', vsel), h('label', {}, '속도 ', rate),
    h('button', { class: 'btn listen small', text: '들어보기', onclick: () => speak("Hi, this is how I sound. Let's practice speaking English.") }));
}

/* ---------- 화면 상태 ---------- */
const ui = { view: '', tab: 'cards', notice: '' };
let sess = {};
let rec = null, recs = {}, micState = '';

function startView() {
  if (prefs.last === 'all' && lessons.length) return 'all';
  if (byId(prefs.last)) return prefs.last;
  return lessons.length ? sorted()[0].id : 'empty';
}
const sorted = () => lessons.slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));

function go(view, tab) {
  stopSpeech(); if (rec) rec.recorder.stop();
  ui.view = view;
  ui.tab = tab || (['cards', 'quiz', 'read'].includes(prefs.tab) ? prefs.tab : 'cards');
  if (view === 'all' && ui.tab === 'read') ui.tab = 'cards';
  sess = {};
  if (view !== 'add' && view !== 'empty') { prefs.last = view; prefs.tab = ui.tab; savePrefs(); }
  render();
  window.scrollTo(0, 0);
}
function setTab(t) {
  stopSpeech(); if (rec) rec.recorder.stop();
  ui.tab = t; prefs.tab = t; savePrefs(); renderMain();
}

/* ---------- 데이터 검사 ---------- */
function extractJSON(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].includes('{')) t = fence[1];
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return { error: '붙여넣은 글에서 { } 로 된 JSON 부분을 찾지 못했어요.' };
  try { return { data: JSON.parse(t.slice(a, b + 1)) }; }
  catch (e) { return { error: 'JSON 형식이 맞지 않아요. 쉼표나 따옴표가 빠졌거나, 코드 블록이 중간에 잘렸을 수 있어요. (' + e.message + ')' }; }
}
function validate(d) {
  const e = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['수업 데이터가 { } 객체 형태가 아니에요.'];
  if (d.type !== 'speaking-lesson') e.push('type이 "speaking-lesson"이 아니에요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) e.push('date가 없거나 형식이 달라요. (예: 2026-10-16)');
  if (!str(d.title)) e.push('title이 없어요.');
  const arr = (k, fn) => {
    if (d[k] == null) return;
    if (!Array.isArray(d[k])) { e.push(k + '는 목록([ ]) 이어야 해요.'); return; }
    d[k].forEach((x, i) => { if (!x || typeof x !== 'object') e.push(k + ' ' + (i + 1) + '번이 올바른 형태가 아니에요.'); else fn(x, i + 1); });
  };
  arr('top3', (x, n) => { if (!str(x.en)) e.push('top3 ' + n + '번에 en이 없어요.'); });
  arr('flashcards', (x, n) => {
    if (!str(x.ko)) e.push('flashcards ' + n + '번에 ko가 없어요.');
    if (!str(x.en)) e.push('flashcards ' + n + '번에 en이 없어요.');
  });
  arr('quiz', (x, n) => {
    if (x.kind === 'choice') {
      if (!Array.isArray(x.options) || x.options.length < 2 || !x.options.every(str)) e.push('quiz ' + n + '번에 options(보기 2개 이상)가 없어요.');
      if (x.answer == null) e.push('quiz ' + n + '번에 answer가 없어요.');
      else if (!Number.isInteger(x.answer) || !Array.isArray(x.options) || x.answer < 0 || x.answer >= x.options.length) e.push('quiz ' + n + '번의 answer가 보기 번호 범위를 벗어났어요. (0부터 시작)');
    } else if (x.kind === 'blank') {
      if (!str(x.sentence) || !x.sentence.includes('___')) e.push('quiz ' + n + '번의 sentence에 빈칸(___)이 없어요.');
      if (!Array.isArray(x.answers) || !x.answers.length || !x.answers.every(str)) e.push('quiz ' + n + '번에 answers가 없어요.');
    } else e.push('quiz ' + n + '번의 kind가 "choice" 또는 "blank"가 아니에요.');
  });
  if (d.reading != null) {
    if (typeof d.reading !== 'object' || Array.isArray(d.reading)) e.push('reading이 올바른 형태가 아니에요.');
    else if (d.reading.sentences != null && (!Array.isArray(d.reading.sentences) || !d.reading.sentences.every(str))) e.push('reading의 sentences는 문장 목록이어야 해요.');
  }
  return e;
}

/* ---------- 왼쪽 목록 ---------- */
function renderNav() {
  const nav = $('#nav'); nav.innerHTML = '';
  nav.append(h('h1', { text: '회화 연습장' }));
  nav.append(h('button', { class: 'nav-item' + (ui.view === 'add' ? ' active' : ''), onclick: () => go('add'), text: '＋ 수업 추가' }));
  if (lessons.length) {
    nav.append(h('button', { class: 'nav-item' + (ui.view === 'all' ? ' active' : ''), onclick: () => go('all'), text: '전체 복습' }));
    nav.append(h('div', { class: 'nav-sep' }));
    nav.append(h('div', { class: 'nav-list' }, sorted().map(l =>
      h('button', { class: 'nav-item' + (ui.view === l.id ? ' active' : ''), onclick: () => go(l.id) }, l.title, h('small', { text: l.date })))));
  }
}

/* ---------- 메인 ---------- */
function render() { renderNav(); renderMain(); }
function renderMain() {
  const m = $('#main'); m.innerHTML = '';
  paraReset = null;
  m.append(h('div', { class: 'speechbar', id: 'speechbar' })); refreshBar();
  if (ui.view === 'add') return m.append(addView());
  if (ui.view === 'empty' || (!lessons.length)) return m.append(emptyView());
  if (ui.view === 'all') {
    m.append(h('div', { class: 'pane-head' }, h('h2', { text: '전체 복습' }), h('div', { class: 'date', text: '모든 수업의 카드와 문제를 섞어서 봐요' })));
  } else {
    const l = byId(ui.view);
    if (!l) return go(startView());
    m.append(lessonHead(l));
  }
  if (ui.notice) { m.append(h('div', { class: 'notice', text: ui.notice })); ui.notice = ''; }
  const tabs = [['cards', '플래시카드'], ['quiz', '퀴즈']];
  if (ui.view !== 'all') tabs.push(['read', '소리 내어 읽기']);
  if (!tabs.some(t => t[0] === ui.tab)) ui.tab = 'cards';
  m.append(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(t => h('button', { class: 'tab' + (ui.tab === t[0] ? ' active' : ''), role: 'tab', onclick: () => setTab(t[0]), text: t[1] }))));
  m.append(h('div', { id: 'pane' }));
  renderPane();
}
function renderPane() {
  const p = $('#pane'); if (!p) return; p.innerHTML = '';
  if (ui.tab === 'cards') p.append(cardsView());
  else if (ui.tab === 'quiz') p.append(quizView());
  else p.append(readView());
}
function emptyView() {
  return h('div', { class: 'empty' },
    h('p', { text: '회화 첨삭 끝에 받은 수업 코드를 붙여넣으면 여기에 쌓여요.' }),
    h('button', { class: 'btn primary', onclick: () => go('add'), text: '수업 추가' }));
}

function lessonHead(l) {
  const wrap = h('div', {});
  const delArea = h('div', {});
  const askDel = () => {
    delArea.innerHTML = '';
    delArea.append(h('div', { class: 'confirm' },
      h('p', { style: 'margin:0 0 8px', text: '이 수업을 이 기기에서 지울까요? 되돌릴 수 없어요.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn danger', text: '지우기', onclick: () => {
          lessons = lessons.filter(x => x.id !== l.id); clearLessonState(l.id); saveLessons();
          ui.notice = '수업을 지웠어요.'; go(startView());
        } }),
        h('button', { class: 'btn', text: '그대로 두기', onclick: () => { delArea.innerHTML = ''; } }))));
  };
  wrap.append(h('div', { class: 'pane-head' },
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('div', {}, h('h2', { text: l.title }), h('div', { class: 'date', text: l.date })),
      h('button', { class: 'btn small', text: '수업 삭제', onclick: askDel }))),
    delArea);
  if (l.top3 && l.top3.length) {
    wrap.append(h('div', { class: 'top3' },
      h('h3', { text: '다음 수업에서 써볼 3개' }),
      h('p', { class: 'tip', text: '전부 외우려 하지 말고, 이 3개만 실제로 말해보면 충분해요.' }),
      h('ol', {}, l.top3.map(t => h('li', {},
        h('div', { class: 'en' }, t.en, ' ', synth ? h('button', { class: 'btn listen small', text: '듣기', onclick: () => speak(t.en) }) : null),
        t.ko ? h('div', { class: 'ko', text: t.ko }) : null)))));
  }
  return wrap;
}
function clearLessonState(id) {
  Object.keys(marks).forEach(k => { if (k.startsWith(id + ':')) delete marks[k]; });
  Object.keys(checks).forEach(k => { if (k.startsWith(id + ':')) delete checks[k]; });
  saveMarks(); saveChecks();
}

/* ---------- 수업 추가 ---------- */
function addView() {
  const out = h('div', {});
  const ta = h('textarea', { class: 'paste', placeholder: '첨삭 끝에 받은 수업 코드를 여기에 붙여넣어 주세요. (```json 표시나 설명 문장이 같이 붙어도 괜찮아요)', spellcheck: false });
  const prev = h('div', {});
  let parsed = null;
  const update = () => {
    prev.innerHTML = ''; parsed = null;
    if (!ta.value.trim()) return;
    const r = extractJSON(ta.value);
    const errs = r.error ? [r.error] : validate(r.data);
    if (errs.length) {
      prev.append(h('ul', { class: 'errs' }, errs.slice(0, 8).map(x => h('li', { text: x })), errs.length > 8 ? h('li', { text: '…그 밖에도 더 있어요.' }) : null));
      return;
    }
    parsed = r.data;
    const c = (parsed.flashcards || []).length, q = (parsed.quiz || []).length, s = ((parsed.reading || {}).sentences || []).length;
    const area = h('div', {});
    prev.append(h('div', { class: 'box' },
      h('div', { style: 'font-weight:700', text: parsed.date + ' · ' + parsed.title }),
      h('p', { class: 'note', text: `카드 ${c}장 · 문제 ${q}개 · 읽기 문장 ${s}개 들어왔어요.` }),
      h('button', { class: 'btn primary', text: '추가하기', onclick: () => tryAdd(parsed, area) }), area));
  };
  ta.addEventListener('input', update);
  out.append(h('div', { class: 'pane-head' }, h('h2', { text: '수업 추가' })),
    h('p', { class: 'note', text: '붙여넣으면 아래에 미리보기가 나와요.' }), ta, prev);
  return out;
}
function tryAdd(d, area) {
  area.innerHTML = '';
  const dup = lessons.find(l => l.date === d.date);
  if (!dup) return commitAdd(d);
  area.append(h('div', { class: 'confirm' },
    h('p', { style: 'margin:0 0 8px', text: `${d.date} 수업이 이미 있어요 (${dup.title}). 어떻게 할까요?` }),
    h('div', { class: 'row' },
      h('button', { class: 'btn danger', text: '덮어쓸까요', onclick: () => { lessons = lessons.filter(l => l.id !== dup.id); clearLessonState(dup.id); commitAdd(d); } }),
      h('button', { class: 'btn', text: '둘 다 둘까요', onclick: () => commitAdd(d) }),
      h('button', { class: 'btn', text: '취소', onclick: () => { area.innerHTML = ''; } }))));
}
function commitAdd(d) {
  const l = Object.assign({}, d, { id: uid() });
  lessons.push(l); saveLessons();
  ui.notice = '수업을 추가했어요.';
  go(l.id, 'cards');
}

/* ---------- 플래시카드 ---------- */
function scopeLessons() { return ui.view === 'all' ? lessons : [byId(ui.view)].filter(Boolean); }
function allCards() {
  const out = [];
  scopeLessons().forEach(l => (l.flashcards || []).forEach((c, i) => out.push({ key: l.id + ':c' + i, c })));
  return out;
}
function cardsView() {
  const root = h('div', {});
  const all = allCards();
  if (!all.length) { root.append(h('p', { class: 'empty', text: '이 수업에는 플래시카드가 없어요.' })); return root; }
  const S = sess.cards = sess.cards || { queue: ui.view === 'all' ? shuffle(all) : all.slice(), pos: 0, flipped: false, done: false };
  const draw = () => {
    root.innerHTML = '';
    if (S.done) {
      const left = all.filter(x => marks[x.key]);
      root.append(h('div', { class: 'done' },
        h('p', { text: left.length ? '한 바퀴 끝! 다시 볼 카드만 한 번 더 넘겨봐요.' : '한 바퀴 끝! 모두 말할 수 있다고 했어요. 잘했어요.' }),
        h('div', { class: 'row', style: 'justify-content:center' },
          left.length ? h('button', { class: 'btn primary', text: '다시 볼 카드만', onclick: () => restart(left) }) : null,
          h('button', { class: 'btn', text: '처음부터 섞어서', onclick: () => restart(shuffle(all)) }))));
      return;
    }
    const item = S.queue[S.pos], c = item.c;
    const front = [h('div', { class: 'big-ko', text: c.ko }), c.situation ? h('div', { class: 'sit', text: c.situation }) : null,
      h('div', { class: 'hint', text: '영어로 먼저 말해보고, 눌러서 확인해요' })];
    const back = [
      c.source ? h('span', { class: 'label' + (c.source === 'native' ? ' native' : ''), text: c.source === 'native' ? '원어민 표현' : c.source === 'fix' ? '첨삭한 문장' : c.source }) : null,
      h('div', { class: 'en', text: c.en }),
      c.note ? h('div', { class: 'sit', text: c.note }) : null,
      synth ? h('button', { class: 'btn listen small', text: '듣기', onclick: e => { e.stopPropagation(); speak(c.en); } }) : null];
    const card = h('div', { class: 'card', tabIndex: 0, role: 'button', 'aria-label': '카드 뒤집기', onclick: flip }, S.flipped ? back : front);
    root.append(h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(S.pos / S.queue.length * 100)}%` })), card,
      h('div', { class: 'cardbtns' },
        h('button', { class: 'btn', text: '← 이전 카드', disabled: S.pos === 0, onclick: () => step(-1) }),
        h('button', { class: 'btn', text: '다음 카드 →', onclick: () => step(1) })),
      h('div', { class: 'cardbtns' },
        h('button', { class: 'btn', text: '다시 볼래요', onclick: () => mark(true) }),
        h('button', { class: 'btn primary', text: '말할 수 있어요', onclick: () => mark(false) })),
      h('div', { class: 'keys', text: '스페이스 뒤집기 · ← 다시 볼래요 · → 말할 수 있어요 · ↑ 이전 · ↓ 다음' }));
  };
  function flip() { S.flipped = !S.flipped; draw(); if (S.flipped) speak(S.queue[S.pos].c.en); else stopSpeech(); }
  function mark(again) {
    const it = S.queue[S.pos];
    if (again) marks[it.key] = true; else delete marks[it.key];
    saveMarks(); stopSpeech();
    S.pos++; S.flipped = false;
    if (S.pos >= S.queue.length) S.done = true;
    draw();
  }
  function step(d) {
    stopSpeech(); S.pos = Math.max(0, S.pos + d); S.flipped = false;
    if (S.pos >= S.queue.length) S.done = true;
    draw();
  }
  function restart(q) { S.queue = q; S.pos = 0; S.flipped = false; S.done = false; draw(); }
  S.flip = flip; S.mark = mark; S.step = step;
  draw();
  return root;
}
document.addEventListener('keydown', e => {
  const t = e.target, tag = t && t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const S = ui.tab === 'cards' && sess.cards;
  if (!S || S.done || !S.flip) return;
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); S.flip(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); S.mark(true); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); S.mark(false); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); S.step(-1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); S.step(1); }
});

/* ---------- 퀴즈 ---------- */
function allQuiz() {
  const out = [];
  scopeLessons().forEach(l => (l.quiz || []).forEach((q, i) => out.push({ key: l.id + ':q' + i, q })));
  return out;
}
function quizView() {
  const root = h('div', {});
  const all = allQuiz();
  if (!all.length) { root.append(h('p', { class: 'empty', text: '이 수업에는 퀴즈가 없어요.' })); return root; }
  const S = sess.quiz = sess.quiz || { pattern: '', round: 0 };
  const patterns = [...new Set(all.map(x => x.q.pattern).filter(Boolean))];
  const draw = () => {
    root.innerHTML = '';
    if (patterns.length) {
      root.append(h('div', { class: 'chips' },
        h('button', { class: 'chip' + (!S.pattern ? ' active' : ''), text: '전체', onclick: () => { S.pattern = ''; S.round++; draw(); } }),
        patterns.map(p => h('button', { class: 'chip' + (S.pattern === p ? ' active' : ''), text: p, onclick: () => { S.pattern = p; S.round++; draw(); } }))));
    }
    let items = all.filter(x => !S.pattern || x.q.pattern === S.pattern);
    if (ui.view === 'all') items = shuffle(items);
    const total = items.length; let answered = 0;
    const end = h('div', { class: 'done' });
    const onAnswered = () => {
      answered++;
      if (answered === total) {
        end.append(h('p', { text: '한 바퀴 끝! 다시 풀고 싶으면 아래 버튼을 눌러요.' }));
      }
    };
    items.forEach(x => root.append(x.q.kind === 'choice' ? choiceQ(x.q, onAnswered) : blankQ(x.q, onAnswered)));
    root.append(end, h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn', text: '다시 풀기', onclick: () => { stopSpeech(); S.round++; draw(); } })));
  };
  draw();
  return root;
}
function qHead(q) {
  return [q.pattern ? h('span', { class: 'chip static', text: q.pattern }) : null,
    q.before ? h('div', { class: 'before' }, '수업 때 한 말: ', h('s', { text: q.before })) : null];
}
function listenBtn(text) { return synth ? h('button', { class: 'btn listen small', text: '완성 문장 듣기', onclick: () => speak(text) }) : null; }
function choiceQ(q, onAnswered) {
  const fb = h('div', {});
  const btns = q.options.map((o, i) => h('button', { class: 'opt', text: o, onclick: () => {
    btns.forEach((b, j) => { b.disabled = true; if (j === q.answer) b.classList.add('right'); else if (j === i) b.classList.add('wrong'); });
    fb.append(h('div', { class: 'fb' }, i === q.answer ? h('b', { style: 'color:var(--teal)', text: '맞아요' }) : h('b', { style: 'color:var(--red)', text: '아쉬워요, 초록색이 정답이에요' }),
      q.explain ? h('span', { text: q.explain }) : null, listenBtn(q.options[q.answer])));
    onAnswered();
  } }));
  return h('div', { class: 'q' }, qHead(q), h('div', { class: 'prompt', text: q.prompt || '자연스러운 문장을 고르세요.' }), btns, fb);
}
function blankQ(q, onAnswered) {
  const parts = q.sentence.split('___');
  const first = parts.shift(), rest = parts.join('___');
  const width = Math.max(4, ...q.answers.map(a => a.length)) + 2;
  const fb = h('div', {});
  let finished = false;
  const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, style: `width:${width}ch`, 'aria-label': '빈칸' });
  const full = () => q.sentence.replace('___', q.answers[0]);
  const finish = (cls) => {
    finished = true; input.disabled = true; input.className = cls; skip.disabled = true;
    fb.innerHTML = '';
    fb.append(h('div', { class: 'fb' }, cls === 'ok' ? h('b', { style: 'color:var(--teal)', text: '맞아요' }) : h('span', { text: '정답은 이거예요' }),
      q.explain ? h('span', { text: q.explain }) : null, listenBtn(full())));
    onAnswered();
  };
  const check = () => {
    if (finished || !input.value.trim()) return;
    if (q.answers.some(a => norm(a) === norm(input.value))) finish('ok');
    else { input.className = 'no'; fb.innerHTML = ''; fb.append(h('div', { class: 'fb', style: 'color:var(--red)', text: '한 번 더 써볼까요? 막히면 "모르겠어요"를 눌러요.' })); }
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  input.addEventListener('input', () => { if (input.className === 'no') { input.className = ''; fb.innerHTML = ''; } });
  const skip = h('button', { class: 'btn small', text: '모르겠어요', onclick: () => { if (finished) return; input.value = q.answers[0]; finish('show'); } });
  return h('div', { class: 'q' }, qHead(q),
    h('div', { class: 'blank' }, first, input, rest),
    h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn small', text: '확인', onclick: check }), skip), fb);
}

/* ---------- 소리 내어 읽기 ---------- */
function splitSentences(p) {
  const m = p.match(/[^.!?]+[.!?]+["'’”)\]]*\s*|[^.!?]+$/g);
  return (m || [p]).map(s => s.trim()).filter(Boolean);
}
function readView() {
  const root = h('div', {});
  const l = byId(ui.view), r = (l && l.reading) || {};
  const hasP = str(r.paragraph), sents = r.sentences || [];
  if (!hasP && !sents.length) { root.append(h('p', { class: 'empty', text: '이 수업에는 읽기 자료가 없어요.' })); return root; }
  const micOff = micState === 'denied' || micState === 'unsupported';

  if (hasP) {
    const ps = splitSentences(r.paragraph);
    const spans = ps.map(s => h('span', { class: 'hlsent', text: s + ' ' }));
    const btn = h('button', { class: 'btn listen', text: '문단 듣기' });
    let playing = false;
    const clear = () => spans.forEach(s => s.classList.remove('on'));
    paraReset = () => { playing = false; btn.textContent = '문단 듣기'; clear(); };
    const seq = i => {
      clear();
      if (i >= ps.length) { paraReset(); return; }
      spans[i].classList.add('on'); spans[i].scrollIntoView({ block: 'nearest' });
      speak(ps[i], () => seq(i + 1));
    };
    btn.addEventListener('click', () => {
      if (playing) { stopSpeech(); return; }
      stopSpeech(); playing = true; btn.textContent = '멈추기'; paraReset = () => { playing = false; btn.textContent = '문단 듣기'; clear(); };
      seq(0);
    });
    root.append(h('h3', { class: 'sec', text: '문단' }), h('div', { class: 'para' }, spans),
      synth ? btn : null);
  }
  if (sents.length) {
    root.append(h('h3', { class: 'sec', text: '핵심 문장' }));
    if (micState === 'denied') root.append(h('p', { class: 'warn', text: '브라우저 설정에서 마이크를 허용하면 녹음할 수 있어요. (허용한 뒤 페이지를 새로고침해 주세요)' }));
    if (micState === 'unsupported') root.append(h('p', { class: 'warn', text: '이 브라우저에서는 녹음을 지원하지 않아요.' }));
    sents.forEach((s, i) => {
      const key = l.id + ':s' + i;
      const recording = rec && rec.key === key;
      const mine = recs[key];
      const hint = h('div', { class: 'note' });
      const playMine = () => { stopSpeech(); curAudio = new Audio(mine.url); curAudio.play().catch(() => {}); };
      root.append(h('div', { class: 'sent' },
        h('div', { class: 'en', text: s }),
        h('div', { class: 'row' },
          synth ? h('button', { class: 'btn listen small', text: '듣기', onclick: () => speak(s) }) : null,
          h('button', { class: 'btn small' + (recording ? ' rec-on' : ''), disabled: micOff, onclick: () => toggleRec(key) },
            recording ? [h('span', { class: 'dot' }), '멈추기'] : '녹음'),
          h('button', { class: 'btn small', text: '내 녹음 듣기', disabled: !mine || recording, onclick: playMine }),
          synth ? h('button', { class: 'btn small', text: '번갈아 듣기', onclick: () => {
            if (!mine) { hint.textContent = '먼저 녹음해 두면 원어민 → 내 목소리 순서로 번갈아 들을 수 있어요.'; return; }
            hint.textContent = ''; speak(s, playMine);
          } }) : null,
          h('label', {}, h('input', { type: 'checkbox', checked: !!checks[key], onchange: e => { if (e.target.checked) checks[key] = true; else delete checks[key]; saveChecks(); } }), '따라 말했어요')),
        hint));
    });
  }
  return root;
}
function refreshRead() { if (ui.tab === 'read' && $('#pane')) { const y = window.scrollY; renderPane(); window.scrollTo(0, y); } }
async function toggleRec(key) {
  if (rec && rec.key === key) { rec.recorder.stop(); return; }
  if (rec) rec.recorder.stop();
  stopSpeech();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { micState = 'unsupported'; refreshRead(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { micState = 'denied'; refreshRead(); return; }
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
  let recorder;
  try { recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined); }
  catch (e) { stream.getTracks().forEach(t => t.stop()); micState = 'unsupported'; refreshRead(); return; }
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' });
    if (recs[key]) URL.revokeObjectURL(recs[key].url);
    if (blob.size) recs[key] = { url: URL.createObjectURL(blob) };
    if (rec && rec.recorder === recorder) rec = null;
    refreshRead();
  };
  rec = { key, recorder };
  recorder.start();
  refreshRead();
}

/* ---------- 시작 ---------- */
ui.view = startView();
ui.tab = ['cards', 'quiz', 'read'].includes(prefs.tab) ? prefs.tab : 'cards';
if (ui.view === 'all' && ui.tab === 'read') ui.tab = 'cards';
render();
})();
