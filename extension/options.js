'use strict';
const DEFAULTS = { provider: 'anthropic', apiKey: '', model: 'claude-haiku-5-5', baseUrl: 'https://api.openai.com/v1' };
const $ = id => document.getElementById(id);

function toggle() { $('baseRow').hidden = $('provider').value !== 'openai'; }

chrome.storage.local.get(Object.keys(DEFAULTS)).then(saved => {
  const cfg = { ...DEFAULTS, ...saved };
  for (const k of Object.keys(DEFAULTS)) $(k).value = cfg[k];
  toggle();
});

$('provider').addEventListener('change', () => {
  toggle();
  if ($('provider').value === 'anthropic' && !$('model').value.startsWith('claude')) $('model').value = DEFAULTS.model;
});

$('save').addEventListener('click', async () => {
  const cfg = {
    provider: $('provider').value,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    baseUrl: $('baseUrl').value.trim().replace(/\/+$/, '')
  };
  if (cfg.provider === 'openai') {
    let u;
    try { u = new URL(cfg.baseUrl); } catch { $('msg').textContent = 'API 주소가 이상해요.'; return; }
    const local = ['127.0.0.1', 'localhost'].includes(u.hostname);
    if (u.protocol !== 'https:' && !local) { $('msg').textContent = 'API 주소는 https 여야 해요.'; return; }
    if (u.hostname !== 'api.openai.com') {
      const origin = `${u.protocol}//${u.hostname}/*`;
      const ok = await chrome.permissions.request({ origins: [origin] });
      if (!ok) { $('msg').textContent = '그 주소에 접속 허락이 필요해요.'; return; }
    }
  }
  await chrome.storage.local.set(cfg);
  $('msg').textContent = '저장했어요. X 탭을 새로고침하세요.';
});
