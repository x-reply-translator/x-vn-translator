// X 베트남어 댓글창 번역 버튼.
// 댓글창(tweetTextarea_*) 밑에 한국어·영어·중국어 버튼을 붙이고, 번역은 background.js 가 설정한 AI API 로.
// 글은 버튼을 눌렀을 때만 바꿈. 게시 버튼은 절대 안 누름.
(() => {
  'use strict';
  const EDITOR = '[data-testid^="tweetTextarea_"][contenteditable="true"]';
  const LANGS = { ko: '한국어', en: '영어', zh: '중국어' };
  const panels = new Map(); // editor → host

  // 베트남어 성조·모음 부호. lang=vi 이거나 이 글자가 있으면 베트남어로 봄.
  const VI_DIAC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
  function isVi(text, langAttr) {
    const t = String(text || '').trim();
    if (!t) return false;
    const lang = String(langAttr || '').toLowerCase();
    if (lang === 'vi' || lang.startsWith('vi-')) return true;
    return VI_DIAC.test(t);
  }

  const CSS = `
    :host{display:block;margin:6px 0 4px}
    .bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    button{font:600 12px system-ui,sans-serif;border-radius:999px;padding:4px 12px;cursor:pointer;border:1px solid #536471;background:transparent;color:inherit}
    button.go{background:#1d9bf0;border-color:#1d9bf0;color:#fff}
    button:disabled{opacity:.45;cursor:default}
    .tag{font:11px system-ui,sans-serif;opacity:.6}
    .msg{font:12px system-ui,sans-serif;opacity:.8;margin-top:6px}
    .msg:empty{display:none}
    .box{margin-top:8px;border:1px solid #536471;border-radius:12px;padding:10px;font:13px/1.5 system-ui,sans-serif}
    .box[hidden]{display:none}
    .row{display:grid;grid-template-columns:52px 1fr;gap:8px;margin-bottom:6px}
    .row b{opacity:.6;font-weight:600}
    .row p{margin:0;white-space:pre-wrap;word-break:break-word}
    .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}`;

  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function readDraft(editor) {
    return (editor.innerText || '').replace(/\u200b/g, '').replace(/\n$/, '');
  }

  const norm = s => s.replace(/\s+/g, ' ').trim();
  const tick = ms => new Promise(r => setTimeout(r, ms));

  // Range 로 고르면 X 편집기(Draft)가 선택을 몰라 번역이 뒤에 덧붙음.
  // → selectAll 로 고르고, X가 선택을 알아챌 틈을 준 뒤 붙여넣기. 안 되면 지우고 insertText.
  async function writeDraft(editor, value) {
    editor.focus();
    document.execCommand('selectAll', false);
    await tick(30);
    const dt = new DataTransfer();
    dt.setData('text/plain', value);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    editor.dispatchEvent(ev);
    if (!ev.defaultPrevented) document.execCommand('insertText', false, value);
    await tick(80);
    if (norm(readDraft(editor)) === norm(value)) return true;
    editor.focus();
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    await tick(30);
    document.execCommand('insertText', false, value);
    await tick(80);
    return norm(readDraft(editor)) === norm(value);
  }

  // 답글 다는 대상 글(말투 맞추기용): 댓글창보다 위에 있는 가장 가까운 글 본문.
  function replyTarget(editor) {
    const scope = editor.closest('[role="dialog"]') || document.querySelector('main') || document;
    let best = null;
    for (const a of scope.querySelectorAll('article')) {
      if (a.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING) best = a;
    }
    const t = best?.querySelector('[data-testid="tweetText"]');
    return t ? (t.innerText || '').trim().slice(0, 1500) : '';
  }

  // ---- 미리 번역: 같은 글·언어·용도면 한 번만 부르고 결과를 재사용 ----
  const cache = new Map(); // key → Promise<res>
  let lastLang = 'ko';
  function ask(text, lang, context = '', mode = 'draft') {
    const key = JSON.stringify([mode, lang, text]);
    if (cache.has(key)) return cache.get(key);
    const p = chrome.runtime.sendMessage({ type: 'TRANSLATE', text, lang, context, mode })
      .catch(() => ({ ok: false, error: '확장이 새로고침됐어요. X 탭을 새로고침하세요.' }))
      .then(res => { if (!res?.ok) cache.delete(key); return res; });
    cache.set(key, p);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    return p;
  }

  function makePanel(editor) {
    const host = el('div');
    host.dataset.xtrVn = '1';
    // 패널 안 클릭·키가 X 단축키나 글 열기로 새지 않게.
    for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress']) {
      host.addEventListener(t, e => e.stopPropagation());
    }
    const root = host.attachShadow({ mode: 'closed' });
    const style = el('style'); style.textContent = CSS;
    const bar = el('div', 'bar'), msg = el('div', 'msg'), box = el('div', 'box');
    box.hidden = true;
    const st = { busy: false, original: '', out: '', lang: '', seq: 0 };
    const buttons = {};
    for (const [code, name] of Object.entries(LANGS)) {
      const b = el('button', 'go', `${name}로`);
      b.type = 'button';
      b.addEventListener('click', () => run(code));
      buttons[code] = b; bar.append(b);
    }
    root.append(style, bar, msg, box);

    function refresh() {
      const empty = !readDraft(editor).trim();
      for (const [code, b] of Object.entries(buttons)) {
        b.disabled = st.busy || empty;
        b.textContent = st.busy && st.lang === code ? '번역 중…' : `${LANGS[code]}로`;
      }
    }

    async function put(value, okMsg) {
      msg.textContent = await writeDraft(editor, value) ? okMsg : '못 넣었어요. 복사해서 붙여 넣으세요.';
      refresh();
    }

    function showResult() {
      box.replaceChildren();
      const name = LANGS[st.lang];
      for (const [k, v] of [['원문', st.original], [name, st.out]]) {
        const r = el('div', 'row'); r.append(el('b', '', k), el('p', '', v)); box.append(r);
      }
      const acts = el('div', 'acts');
      const bPut = el('button', '', `${name} 넣기`), bBack = el('button', '', '원문 되돌리기'),
        bCopy = el('button', '', `${name} 복사`), bClose = el('button', '', '닫기');
      for (const b of [bPut, bBack, bCopy, bClose]) b.type = 'button';
      bPut.addEventListener('click', () => put(st.out, `${name}로 바꿨어요. 확인하고 직접 올리세요.`));
      bBack.addEventListener('click', () => put(st.original, '원문으로 되돌렸어요.'));
      bCopy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(st.out); bCopy.textContent = '복사함'; } catch { bCopy.textContent = '복사 실패'; }
      });
      bClose.addEventListener('click', () => { box.hidden = true; msg.textContent = ''; });
      acts.append(bPut, bBack, bCopy, bClose); box.append(acts);
      box.hidden = false;
    }

    async function run(code) {
      if (st.busy) return;
      const text = readDraft(editor);
      if (!text.trim()) return;
      if (!isVi(text)) { msg.textContent = '베트남어로 쓴 초안만 번역해요.'; return; }
      if ([...text].length > 2000) { msg.textContent = '한 번에 2,000자까지예요.'; return; }
      const seq = ++st.seq;
      Object.assign(st, { busy: true, lang: code, original: text });
      box.hidden = true; msg.textContent = '번역 중… (초안은 계속 고쳐도 돼요)'; refresh();
      lastLang = code;
      const res = await ask(text, code, replyTarget(editor), 'draft');
      if (seq !== st.seq || !editor.isConnected) return;
      st.busy = false;
      if (!res?.ok) { msg.textContent = String(res?.error || '번역 실패. 초안은 그대로예요.'); refresh(); return; }
      st.out = res.text;
      showResult();
      // 그사이 초안을 안 고쳤으면 바로 바꿔 넣음. 고쳤으면 대조만 보여 줌.
      if (readDraft(editor) === text) await put(st.out, `${LANGS[code]}로 바꿨어요. 확인하고 직접 올리세요.`);
      else { msg.textContent = '그사이 초안이 바뀌어서 안 넣었어요. 확인하고 넣기를 누르세요.'; refresh(); }
    }

    // 쓰다가 1.5초 멈추면 마지막에 쓴 언어로 뒤에서 미리 번역 → 버튼 누르면 바로 바뀜.
    let pf = null;
    editor.addEventListener('input', () => {
      refresh();
      clearTimeout(pf);
      pf = setTimeout(() => {
        const t = readDraft(editor);
        if (st.busy || [...t.trim()].length < 4 || t === st.out || !isVi(t) || [...t].length > 2000) return;
        ask(t, lastLang, replyTarget(editor), 'draft');
      }, 1500);
    });
    refresh();
    return host;
  }

  // 댓글창과 그 밑 도구줄(사진·이모지·게시 버튼) 사이에 끼움.
  function spot(editor) {
    let n = editor;
    while (n.parentElement && n.parentElement !== document.body) {
      const p = n.parentElement;
      if (p.querySelector('[data-testid="toolBar"]') && !n.querySelector('[data-testid="toolBar"]')) return n;
      n = p;
    }
    return null;
  }

  function scan() {
    for (const [editor, host] of panels) {
      if (!editor.isConnected || !host.isConnected) { host.remove(); panels.delete(editor); }
    }
    for (const editor of document.querySelectorAll(EDITOR)) {
      if (panels.has(editor)) continue;
      const at = spot(editor);
      if (!at) continue;
      const host = makePanel(editor);
      at.after(host);
      panels.set(editor, host);
    }
  }

  // ---- 글 본문 해석(베트남어 → 한국어·영어·중국어, 읽기용). 언어는 버튼으로 바꿈. ----
  const done = new WeakSet();
  const READ_CSS = `
    :host{display:block;margin:0 0 2px}
    .bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    button{font:600 12px system-ui,sans-serif;border-radius:999px;padding:3px 10px;cursor:pointer;border:1px solid #536471;background:transparent;color:inherit}
    button.on{background:#1d9bf0;border-color:#1d9bf0;color:#fff}
    button:disabled{opacity:.5;cursor:default}
    p{margin:6px 0 0;padding:8px 10px;border-left:3px solid #1d9bf0;white-space:pre-wrap;word-break:break-word;font:14px/1.5 system-ui,sans-serif}
    p[hidden]{display:none}
    .err{opacity:.8;font-size:12px}`;

  function readButton(textEl) {
    const host = el('div');
    host.dataset.xtrVnRead = '1';
    for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) host.addEventListener(t, e => e.stopPropagation());
    const root = host.attachShadow({ mode: 'closed' });
    const style = el('style'); style.textContent = READ_CSS;
    const bar = el('div', 'bar'), out = el('p');
    out.hidden = true;
    const buttons = {};
    const have = {}; // lang → text
    let shown = '';
    let busy = '';
    const text = () => (textEl.innerText || '').trim().slice(0, 2000);

    function paint() {
      for (const [code, b] of Object.entries(buttons)) {
        b.disabled = !!busy;
        b.className = shown === code && !out.hidden ? 'on' : '';
        b.textContent = busy === code ? '해석 중…' : LANGS[code];
      }
    }

    async function show(code) {
      if (busy) return;
      if (shown === code && !out.hidden) {
        out.hidden = true; shown = ''; paint(); return;
      }
      if (have[code]) {
        shown = code; out.className = ''; out.textContent = have[code]; out.hidden = false; paint(); return;
      }
      const t = text();
      if (!t) return;
      busy = code; paint();
      const res = await ask(t, code, '', 'read');
      busy = '';
      if (!res?.ok) {
        out.className = 'err';
        out.textContent = String(res?.error || '해석 실패');
        out.hidden = false;
        shown = '';
        paint();
        return;
      }
      have[code] = res.text;
      shown = code;
      out.className = '';
      out.textContent = have[code];
      out.hidden = false;
      paint();
    }

    for (const [code, name] of Object.entries(LANGS)) {
      const b = el('button', '', name);
      b.type = 'button';
      // 마우스를 올리면 바로 해석 시작 → 누를 때쯤 반은 끝나 있음.
      // 스크롤하며 스치기만 해도 불리지 않게 0.3초 이상 올려 둘 때만 미리 시작.
      let hov = null;
      b.addEventListener('pointerenter', () => {
        clearTimeout(hov);
        hov = setTimeout(() => { if (!have[code] && text()) ask(text(), code, '', 'read'); }, 300);
      });
      b.addEventListener('pointerleave', () => clearTimeout(hov));
      b.addEventListener('click', () => show(code));
      buttons[code] = b; bar.append(b);
    }
    root.append(style, bar, out);
    return host;
  }

  function scanPosts() {
    for (const t of document.querySelectorAll('article [data-testid="tweetText"]')) {
      if (done.has(t)) continue;
      done.add(t);
      const raw = (t.innerText || '').trim();
      if (!isVi(raw, t.getAttribute('lang') || '')) continue;
      t.before(readButton(t));
    }
  }

  let timer = null;
  new MutationObserver(() => { if (!timer) timer = setTimeout(() => { timer = null; scan(); scanPosts(); }, 400); })
    .observe(document.documentElement, { childList: true, subtree: true });
  scan(); scanPosts();
})();
