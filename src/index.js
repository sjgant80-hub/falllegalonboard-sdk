// falllegalonboard SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from falllegalonboard/index.html · 142381 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/completions' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "falllegalonboard" }); }
    else go();
  })();
'use strict';
const TOOLNAME='falllegalonboard';
const VERSION='1.0.0';
const PRIME=751;
const SCHEMA_V=1;
const STORE='falllegalonboard.v1';
const AUDIT_CAP=50000;
const TABS=[
  {id:'clients',label:'Clients'},
  {id:'dashboard',label:'Dashboard'},
  {id:'conflicts',label:'Conflict register'},
  {id:'firm',label:'Firm'},
  {id:'advisers',label:'Advisers'},
  {id:'qa',label:'SRA Help'},
];
const REVIEW_CADENCE={standard:365,enhanced:180,high:90};
const DOC_EXPIRY={'passport':3650,'driving-licence':3650,'utility-bill':90,'bank-statement':90,'incorp-cert':null,'psc-list':null,'electronic-verification':null,'other':null};
const DOC_TYPES=[
  {v:'passport',l:'Passport'},
  {v:'driving-licence',l:'Driving licence'},
  {v:'utility-bill',l:'Utility bill (last 3 months)'},
  {v:'bank-statement',l:'Bank statement (last 3 months)'},
  {v:'incorp-cert',l:'Company incorporation certificate'},
  {v:'psc-list',l:'Certified PSC list'},
  {v:'electronic-verification',l:'Electronic verification report'},
  {v:'other',l:'Other (specify)'}
];
const HIGH_RISK_JURIS=['AF','BY','MM','KP','SY','IR','CU','VE','RU','HT','YE','SS','LY'];
const CLIENT_TYPES=[
  {v:'individual',l:'Individual'},
  {v:'sole-trader',l:'Sole trader'},
  {v:'partnership',l:'Partnership'},
  {v:'llp',l:'Limited Liability Partnership (LLP)'},
  {v:'limited-company',l:'Private limited company (Ltd)'},
  {v:'charity',l:'Charity'},
  {v:'trust',l:'Trust'},
  {v:'public-body',l:'Public body'},
  {v:'other',l:'Other'}
];
const PRACTICE_AREAS=['conveyancing','family','crime','wills-probate','civil-litigation','employment','commercial','immigration','landlord-tenant','personal-injury','clinical-neg','other'];
const SMCR_ROLES=[
  {v:'COLP',l:'COLP · Compliance Officer for Legal Practice'},
  {v:'COFA',l:'COFA · Compliance Officer for Finance & Administration'},
  {v:'partner',l:'Partner'},
  {v:'solicitor',l:'Solicitor'},
  {v:'paralegal',l:'Paralegal'},
  {v:'consultant',l:'Consultant'}
];
let state={
  schemaVersion:SCHEMA_V,
  active:'clients',
  firm:null,
  advisers:[],
  clients:[],
  conflictRegister:[],
  audit:[],
  chat:[],
  settings:{
    engineName:'FallLegalOnboard',
    anthropicKey:'',openaiKey:'',geminiKey:'',openrouterKey:'',
    auditChain:true,
    isDemoSeeded:false,
    setupDismissed:false,
  },
  ui:{
    filter:{cdd:'',risk:'',type:'',due:false},
    wizard:null,
    activeClient:null,
    pendingConflict:null,
  }
};
const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>Array.from(p.querySelectorAll(s));
const uid=(p='id')=>p+'_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,16):Math.random().toString(36).slice(2,18));
const now=()=>Date.now();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=t=>{if(!t)return'—';const d=new Date(t);return d.toLocaleDateString('en-GB',{year:'numeric',month:'short',day:'2-digit'})};
const fmtDateTime=t=>{if(!t)return'—';const d=new Date(t);return d.toLocaleString('en-GB',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})};
const fmtDateISO=t=>{if(!t)return'';const d=new Date(t);return d.toISOString().slice(0,10)};
const ageYears=dob=>{if(!dob)return null;const d=new Date(dob),n=new Date();let a=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();if(m<0||(m===0&&n.getDate()<d.getDate()))a--;return a};
const addDays=(t,d)=>t+d*86400000;
const daysBetween=(a,b)=>Math.round((b-a)/86400000);
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),2200)}
async function sha256(s){const buf=s instanceof ArrayBuffer?s:new TextEncoder().encode(typeof s==='string'?s:JSON.stringify(s));const h=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function sha256Blob(blob){const buf=await blob.arrayBuffer();return sha256(buf)}
function bytes(n){if(n<1024)return n+'B';if(n<1024*1024)return(n/1024).toFixed(1)+'KB';return(n/1048576).toFixed(2)+'MB'}
let db;
function openDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(STORE,1);
    r.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains('state'))d.createObjectStore('state');
      if(!d.objectStoreNames.contains('audit'))d.createObjectStore('audit',{keyPath:'i'});
      if(!d.objectStoreNames.contains('documents'))d.createObjectStore('documents',{keyPath:'id'});
      if(!d.objectStoreNames.contains('conflictRegister'))d.createObjectStore('conflictRegister',{keyPath:'id'});
    };
    r.onsuccess=e=>{db=e.target.result;res(db)};
    r.onerror=e=>rej(e);
  });
}
function idbPut(store,val,key){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');const r=key?tx.objectStore(store).put(val,key):tx.objectStore(store).put(val);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function idbGet(store,key){return new Promise((res,rej)=>{const tx=db.transaction(store,'readonly');const r=tx.objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function idbDel(store,key){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');const r=tx.objectStore(store).delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function idbAll(store){return new Promise((res,rej)=>{const tx=db.transaction(store,'readonly');const r=tx.objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function persistState(){
  if(!db)await openDB();
  const snap={schemaVersion:state.schemaVersion,active:state.active,firm:state.firm,advisers:state.advisers,clients:state.clients,chat:state.chat,settings:state.settings};
  try{localStorage.setItem(STORE+'.state',JSON.stringify(snap))}catch(e){}
  return idbPut('state',snap,'main');
}
async function loadState(){
  if(!db)await openDB();
  let s=await idbGet('state','main');
  if(!s){try{const raw=localStorage.getItem(STORE+'.state');if(raw)s=JSON.parse(raw)}catch(e){}}
  if(s){
    state.schemaVersion=s.schemaVersion||SCHEMA_V;
    state.active=s.active||'clients';
    state.firm=s.firm||null;
    state.advisers=Array.isArray(s.advisers)?s.advisers:[];
    state.clients=Array.isArray(s.clients)?s.clients:[];
    state.chat=Array.isArray(s.chat)?s.chat:[];
    state.settings=Object.assign({},state.settings,s.settings||{});
  }
  state.audit=await idbAll('audit');state.audit.sort((a,b)=>a.i-b.i);
  state.conflictRegister=await idbAll('conflictRegister');state.conflictRegister.sort((a,b)=>b.ts-a.ts);
}
async function appendAudit(action,info){
  if(!state.settings.auditChain)return;
  if(!db)await openDB();
  const i=state.audit.length?state.audit[state.audit.length-1].i+1:1;
  const prevHash=state.audit.length?state.audit[state.audit.length-1].docHash:'';
  const payload=info.payload||{};
  const entry={i,ts:Date.now(),tool:TOOLNAME,adviserId:info.adviserId||'',clientId:info.clientId||'',action,reasoning:info.reasoning||'',configVersion:`${TOOLNAME}@${VERSION}`,prevHash,docHash:'',payload,retentionYears:6};
  entry.docHash=await sha256(JSON.stringify({prevHash,ts:entry.ts,action,clientId:entry.clientId,payload}));
  state.audit.push(entry);
  if(state.audit.length>AUDIT_CAP){const drop=state.audit.length-AUDIT_CAP;for(let k=0;k<drop;k++){await idbDel('audit',state.audit[k].i)}state.audit=state.audit.slice(drop)}
  await idbPut('audit',entry);
}
// MESH · fall-law (matter/client) + fall-signal (estate)
let bcLaw=null,bcSignal=null,_bcDebounce={};
function bcInit(){
  try{
    bcLaw=new BroadcastChannel('fall-law');
    bcLaw.addEventListener('message',handleLawMsg);
    bcSignal=new BroadcastChannel('fall-signal');
    bcSignal.addEventListener('message',handleSignalMsg);
    bcSignal.postMessage({source:TOOLNAME,type:'hello',prime:PRIME,version:VERSION,ts:now()});
    bcLaw.postMessage({v:1,type:'sync.request',ts:now(),source:TOOLNAME,payload:{}});
  }catch(e){console.warn('BroadcastChannel unavailable',e)}
}
function bcSend(type,payload){
  if(!bcLaw)return;
  const key=type+'|'+(payload?.id||'');
  clearTimeout(_bcDebounce[key]);
  _bcDebounce[key]=setTimeout(()=>{try{bcLaw.postMessage({v:1,type,ts:now(),source:TOOLNAME,payload})}catch(e){}},300);
}
function bcSendNow(type,payload){if(!bcLaw)return;try{bcLaw.postMessage({v:1,type,ts:now(),source:TOOLNAME,payload})}catch(e){}}
function bcAlsoClient(type,payload){
  // Some IFA tools listen on fall-client — emit there too for cross-bundle visibility
  try{const c=new BroadcastChannel('fall-client');c.postMessage({v:1,type,ts:now(),source:TOOLNAME,payload});setTimeout(()=>c.close(),200)}catch(e){}
}
async function handleLawMsg(e){
  const m=e.data;if(!m||m.source===TOOLNAME)return;
  switch(m.type){
    case 'sync.request':bcSendNow('sync.snapshot',{clients:state.clients,advisers:state.advisers,firm:state.firm});break;
    case 'sync.snapshot':mergeSnapshot(m.payload||{});render();break;
    case 'client.created':case 'client.updated':case 'client.archived':mergeRecord('clients',m.payload);render();break;
    case 'adviser.created':case 'adviser.updated':case 'adviser.archived':mergeRecord('advisers',m.payload);render();break;
    case 'firm.updated':if(!state.firm||(m.payload?.updatedAt||0)>(state.firm?.updatedAt||0)){state.firm=m.payload;persistState();render()}break;
    case 'conflict.check.request':handleConflictRequest(m);break;
    case 'conflict.check.response':collectConflictResponse(m);break;
    case 'matter.created':case 'matter.updated':case 'matter.closed':case 'matter.reopened':case 'matter.archived':
      // We don't store matters but track them for conflict-check visibility
      break;
  }
}
function handleSignalMsg(e){
  const m=e.data;if(!m||m.source===TOOLNAME)return;
  if(m.type==='ping'&&bcSignal)bcSignal.postMessage({source:TOOLNAME,type:'pong',prime:PRIME,version:VERSION,ts:now()});
}
function mergeRecord(coll,rec){
  if(!rec||!rec.id)return;
  const arr=state[coll];const i=arr.findIndex(x=>x.id===rec.id);
  if(i<0){arr.push(rec);persistState();return}
  if((rec.updatedAt||0)>(arr[i].updatedAt||0)){arr[i]=rec;persistState()}
}
function mergeSnapshot(p){
  if(Array.isArray(p.clients))p.clients.forEach(c=>mergeRecord('clients',c));
  if(Array.isArray(p.advisers))p.advisers.forEach(a=>mergeRecord('advisers',a));
  if(p.firm){if(!state.firm||(p.firm.updatedAt||0)>(state.firm.updatedAt||0)){state.firm=p.firm;persistState()}}
}
// CONFLICT CHECK — scan local IDB + broadcast
let _conflictBuf={};
async function runConflictCheck(name,otherParty){
  const reqId=uid('cq');
  _conflictBuf[reqId]={hits:[],ts:now()};
  // local scan
  const q=(name||'').toLowerCase().trim();
  const op=(otherParty||'').toLowerCase().trim();
  if(q.length>=2){
    state.clients.forEach(c=>{
      const full=(`${c.individual?.firstName||''} ${c.individual?.lastName||''} ${c.entity?.legalName||''}`).toLowerCase();
      if(full.includes(q)||(op&&full.includes(op))){
        _conflictBuf[reqId].hits.push({source:TOOLNAME,clientId:c.id,name:displayName(c),matchedOn:full.includes(q)?'client name':'opposing party',note:`Existing client · CDD ${c.kyc?.status||'pending'} · risk ${c.kyc?.riskGrade||'standard'}`});
      }
    });
  }
  // broadcast to sibling tools (falllegal, falllegalpaper, falllegalpractice)
  bcSendNow('conflict.check.request',{reqId,name:name||'',otherParty:otherParty||'',source:TOOLNAME});
  // aggregate 1s
  await new Promise(r=>setTimeout(r,1000));
  const hits=_conflictBuf[reqId].hits.slice();
  delete _conflictBuf[reqId];
  return hits;
}
function handleConflictRequest(m){
  // sibling asked us to scan — reply with any matches in our client store
  const q=(m.payload?.name||'').toLowerCase().trim();
  const op=(m.payload?.otherParty||'').toLowerCase().trim();
  const hits=[];
  if(q.length>=2){
    state.clients.forEach(c=>{
      const full=(`${c.individual?.firstName||''} ${c.individual?.lastName||''} ${c.entity?.legalName||''}`).toLowerCase();
      if(full.includes(q)||(op&&full.includes(op))){
        hits.push({source:TOOLNAME,clientId:c.id,name:displayName(c),matchedOn:full.includes(q)?'client name':'opposing party',note:`Existing CDD record · ${c.kyc?.status||'pending'}`});
      }
    });
  }
  if(hits.length)bcSendNow('conflict.check.response',{reqId:m.payload.reqId,hits,source:TOOLNAME});
}
function collectConflictResponse(m){
  const id=m.payload?.reqId;if(!id||!_conflictBuf[id])return;
  (m.payload.hits||[]).forEach(h=>_conflictBuf[id].hits.push(Object.assign({},h,{source:m.source||h.source})));
}
async function recordConflictCheck(rec){
  const id=uid('cr');
  const entry={id,ts:now(),clientName:rec.clientName,otherParty:rec.otherParty||'',scannedBy:rec.scannedBy||'',hits:rec.hits||[],hitCount:(rec.hits||[]).length,resolution:rec.resolution||'pending',resolutionNotes:rec.resolutionNotes||'',clientId:rec.clientId||''};
  await idbPut('conflictRegister',entry);
  state.conflictRegister.unshift(entry);
  await appendAudit('conflict.check.recorded',{clientId:entry.clientId,reasoning:`Conflict check: ${entry.hitCount} hits · ${entry.resolution}`,payload:{id,name:rec.clientName,hits:entry.hitCount}});
  return entry;
}
// FACTORIES
function newClientRec(){
  const t=now();
  return {
    id:uid('cl'),firmId:state.firm?.id||'',
    createdAt:t,updatedAt:t,archivedAt:null,
    clientType:'individual',
    individual:{title:'Mr',firstName:'',middleName:'',lastName:'',preferredName:'',dob:'',gender:'',nationality:'GB',countryOfResidence:'GB',nino:'',utr:''},
    entity:{legalName:'',tradingName:'',entityNumber:'',incorporationDate:'',jurisdiction:'GB',registeredOffice:{line1:'',line2:'',city:'',postcode:'',country:'GB'},sicCode:''},
    email:'',phone:'',
    address:{line1:'',line2:'',city:'',region:'England',postcode:'',country:'GB',since:''},
    addressHistory:[],
    relationships:[],
    kyc:{
      status:'pending',
      riskGrade:'standard',
      cdd:{
        identityVerifiedMethod:'',identityVerifiedAt:null,identityVerifiedBy:'',
        addressVerifiedMethod:'',addressVerifiedAt:null,addressVerifiedBy:'',
        beneficialOwners:[],psc:[],
        sourceOfFundsForMatter:'',
      },
      pepFlag:false,pepDetails:'',
      sanctionsStatus:'not-checked',sanctionsCheckedAt:null,sanctionsCheckedBy:'',
      sourceOfFunds:'',sourceOfFundsNotes:'',
      sourceOfWealth:'',sourceOfWealthNotes:'',
      vulnerableCustomerFlag:false,vulnerabilityCategory:'',vulnerabilityNotes:'',vulnerabilityType:'permanent',
      documentsHeld:[],
      conflictCheckedAt:null,conflictCheckedBy:'',conflictStatus:'pending',conflictNotes:'',
      lastReviewAt:null,nextReviewDue:null,
      retainerScope:'',retainerLimits:'',practiceArea:'other'
    },
    adviserId:state.advisers[0]?.id||'',
    engagement:{startedAt:t,type:'ongoing',feeBasis:'hourly',feeAgreementHash:'',feeAgreementSignedAt:null,initialFee:0,ongoingFee:0,nextReviewDue:null},
    notes:[],
    links:{matterIds:[],documentIds:[]},
    app:{isDemo:false,onboardCompleted:false}
  };
}
function newAdviserRec(){
  const t=now();
  return {id:uid('ad'),firmId:state.firm?.id||'',createdAt:t,updatedAt:t,archivedAt:null,name:'',email:'',phone:'',smcrRole:'solicitor',practicingCertNo:'',practicingCertExpiry:'',cpdHoursThisYear:0,cpdActivities:[],status:'active',startedAt:t,leftAt:null};
}
function newFirmRec(){
  const t=now();
  return {id:uid('fm'),createdAt:t,updatedAt:t,name:'',tradingName:'',sraFirmRef:'',companiesHouseNo:'',vatNumber:'',colpAdviserId:'',cofaAdviserId:'',amlSupervisor:'SRA',registeredAddress:{line1:'',line2:'',city:'',postcode:'',country:'GB'},piInsurer:'',piPolicyNo:'',piExpiresAt:null,piMinCoverGbp:3000000,professionalBody:'SRA',brandColor:'#8b1a1a',brandLogoDataUri:'',setupCompletedAt:null};
}
function displayName(c){
  if(!c)return'(no name)';
  if(c.clientType==='individual'||c.clientType==='sole-trader'){
    const i=c.individual||{};return `${i.firstName||''} ${i.lastName||''}`.trim()||'(no name)';
  }
  return c.entity?.legalName||'(no entity name)';
}
function suggestRiskGrade(c){
  const k=c.kyc||{};let score=0;const reasons=[];
  if(k.pepFlag){score+=3;reasons.push('PEP flagged (+3)')}
  if(k.sanctionsStatus==='match'){score+=4;reasons.push('Sanctions match (+4)')}
  if(k.sanctionsStatus==='review'){score+=2;reasons.push('Sanctions review (+2)')}
  if(k.sanctionsStatus==='not-checked'){score+=1;reasons.push('Sanctions not checked (+1)')}
  if(k.vulnerableCustomerFlag){score+=1;reasons.push('Vulnerable client (+1)')}
  const ind=c.individual||{};const ent=c.entity||{};
  if(HIGH_RISK_JURIS.includes(ind.nationality)){score+=3;reasons.push('Nationality high-risk jurisdiction (+3)')}
  if(HIGH_RISK_JURIS.includes(ind.countryOfResidence)){score+=3;reasons.push('Residence high-risk jurisdiction (+3)')}
  if(HIGH_RISK_JURIS.includes(ent.jurisdiction)){score+=3;reasons.push('Entity jurisdiction high-risk (+3)')}
  if(['business-sale','gift','other'].includes(k.sourceOfFunds)){score+=1;reasons.push('Higher-scrutiny source of funds (+1)')}
  if(['trust','charity'].includes(c.clientType)){score+=1;reasons.push('Trust/charity structure (+1)')}
  if((k.cdd?.beneficialOwners||[]).length>3){score+=1;reasons.push('Complex beneficial ownership (+1)')}
  if(k.conflictStatus==='conflict-identified'){score+=2;reasons.push('Conflict identified (+2)')}
  const grade=score>=4?'high':(score>=2?'enhanced':'standard');
  return {grade,score,reasons};
}
function computeReviewDates(c){
  const grade=c.kyc?.riskGrade||'standard';
  const days=REVIEW_CADENCE[grade]||365;
  const last=c.kyc?.lastReviewAt||c.createdAt||now();
  return {lastReviewAt:last,nextReviewDue:addDays(last,days)};
}
async function saveClient(c,action,reasoning){
  c.updatedAt=now();
  const i=state.clients.findIndex(x=>x.id===c.id);
  const isNew=i<0;
  if(isNew){state.clients.push(c)}else{state.clients[i]=c}
  await persistState();
  await appendAudit(action||(isNew?'client.created':'client.updated'),{
    clientId:c.id,adviserId:c.adviserId,
    reasoning:reasoning||(isNew?'Client onboarding completed':'Client record updated'),
    payload:{id:c.id,name:displayName(c),cddStatus:c.kyc?.status,risk:c.kyc?.riskGrade,clientType:c.clientType}
  });
  bcSend(isNew?'client.created':'client.updated',c);
  bcAlsoClient(isNew?'client.created':'client.updated',c);
  return c;
}
async function archiveClient(c,reasoning){
  c.archivedAt=now();c.updatedAt=now();
  await persistState();
  await appendAudit('client.archived',{clientId:c.id,adviserId:c.adviserId,reasoning:reasoning||'Archived (SRA 6yr retention from end of retainer)',payload:{id:c.id}});
  bcSend('client.archived',c);
}
async function saveAdviser(a,reasoning){
  a.updatedAt=now();
  const i=state.advisers.findIndex(x=>x.id===a.id);
  const isNew=i<0;
  if(isNew)state.advisers.push(a);else state.advisers[i]=a;
  await persistState();
  await appendAudit(isNew?'adviser.created':'adviser.updated',{adviserId:a.id,reasoning:reasoning||'Adviser saved',payload:{id:a.id,name:a.name,role:a.smcrRole,sraRoll:a.practicingCertNo}});
  bcSend(isNew?'adviser.created':'adviser.updated',a);
}
async function saveFirm(f,reasoning){
  f.updatedAt=now();state.firm=f;
  await persistState();
  await appendAudit('firm.updated',{reasoning:reasoning||'Firm record saved',payload:{id:f.id,name:f.name,sra:f.sraFirmRef}});
  bcSend('firm.updated',f);
}
async function storeDocument(file,clientId,type,note){
  const id=uid('dc');
  const hash=await sha256Blob(file);
  const rec={id,clientId,filename:file.name,type,mime:file.type||'',size:file.size,sha256:hash,capturedAt:now(),note:note||'',blob:file};
  await idbPut('documents',rec);
  const expDays=DOC_EXPIRY[type];
  return {id,type,filename:file.name,blobRef:id,sha256:hash,size:file.size,mime:rec.mime,capturedAt:rec.capturedAt,expiresAt:expDays?addDays(rec.capturedAt,expDays):null,verifiedBy:'',note:note||''};
}
async function fetchDocument(id){return idbGet('documents',id)}
async function downloadDocument(id){
  const r=await fetchDocument(id);if(!r){toast('Document not found');return}
  const u=URL.createObjectURL(r.blob);const a=document.createElement('a');a.href=u;a.download=r.filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
}
async function deleteDocument(id){await idbDel('documents',id)}
// T0/T3 CASCADE
const Cascade={
  detectTier(){const s=state.settings;if(s.anthropicKey||s.openaiKey||s.geminiKey||s.openrouterKey)return'T3';return'T0'},
  async generate(sys,user,maxTok){
    const s=state.settings,max=maxTok||1400;
    if(s.anthropicKey)try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':s.anthropicKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:max,system:sys,messages:[{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·Claude',text:d?.content?.[0]?.text||''}}catch(e){}
    if(s.geminiKey)try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${s.geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{parts:[{text:user}]}]})});const d=await r.json();return{tier:'T3·Gemini',text:d?.candidates?.[0]?.content?.parts?.[0]?.text||''}}catch(e){}
    if(s.openaiKey)try{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openaiKey},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·GPT',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
    if(s.openrouterKey)try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openrouterKey,'HTTP-Referer':location.origin},body:JSON.stringify({model:'anthropic/claude-haiku-4-5',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·OpenRouter',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
    return{tier:'T0',text:null}
  }
};
const T0_RULES=[
  {match:/cdd.*solicitor|client due diligence|what.*cdd/i,title:'CDD for solicitors',answer:()=>`**CDD for SRA-regulated solicitor firms** — driven by Money Laundering Regulations 2017, **Legal Sector Affinity Group (LSAG) Guidance**, and **SRA Standards & Regulations 2019**.
**When CDD applies:** instructions falling within MLR 2017 reg.12 — most conveyancing, trust/company formation, financial transactions, tax advice, defending high-value disputes. **Pure litigation** (acting in court proceedings) is generally outside MLR scope, but firm-wide risk assessment still required.
**Standard CDD (reg.28) for a UK natural person:**
1. **Identify** — full name, DOB, residential address
2. **Verify identity** from independent reliable source — passport / driving licence / electronic verification (Experian, GBG, Onfido)
3. **Verify address** — utility bill / bank statement (last 3 months) / electoral roll / electronic match
4. **Purpose & nature** of the retainer
5. **Ongoing monitoring**
**CDD for an entity client (Ltd/LLP/partnership):**
1. Companies House confirmation (incorporation cert, current officers, registered office)
2. **Beneficial owners ≥25%** identified and verified to same standard as individuals
3. **PSC register** check via Companies House
4. Authorised signatory / instructing officer identified and verified
**Two-source rule:** identity + address from **different sources**.
**Retention:** **6 years from end of retainer** (SRA rule 13.5).`},
  {match:/mlr.*2017|source of funds.*wealth|sof.*sow|funds vs wealth/i,title:'MLR 2017 · Source of funds vs source of wealth',answer:()=>`**Source of funds (SoF)** — the specific monies funding **this matter** / this transaction. Concrete, recent, traceable.
- "£325k completion funds from sale of 14 Oak Rd, conveyancer Smith & Co, completion 14 Mar 2026."
**Source of wealth (SoW)** — how the client's **overall wealth** was accumulated over their lifetime. Strategic, cumulative.
- "27 years as NHS consultant + inheritance from mother 2019 + BTL portfolio growth since 2003."
**MLR 2017 reg.28(2)(d):** firm must understand **purpose and intended nature** of the relationship. For higher-risk / EDD matters (reg.33-36) firm must establish **both SoF and SoW** with documentary corroboration proportionate to risk.
**LSAG guidance §6.14:** "savings" alone is never sufficient — always drill: savings *from what*, *over what period*, with *what evidence*.
**Documentary corroboration:**
- Inheritance → grant of probate, executor's letter
- Property sale → completion statement, TR1
- Business sale → SPA, accountant's letter, redacted bank statement
- Earnings → P60s, payslips, tax returns
- Gift → donor's declaration + proof their wealth supports the gift (NOT just trust)
- Crypto → exchange statement + on-chain trace (heightened scrutiny)`},
  {match:/sra.*supervised|aml.*supervisor|who supervises/i,title:'SRA-supervised AML',answer:()=>`**The Solicitors Regulation Authority (SRA)** is the AML supervisor for the legal sector in England & Wales (alongside CILEx Regulation, the Bar Standards Board, and the Council for Licensed Conveyancers for specific cohorts).
**SRA's AML role:**
- Approves firms' written **firm-wide risk assessment** (FWRA) under MLR 2017 reg.18
- Reviews firms' **policies, controls and procedures** (PCPs) under reg.19-21
- Approves **Money Laundering Reporting Officer (MLRO)** and **Money Laundering Compliance Officer (MLCO)** appointments under reg.21(1)(a)/(3)
- Inspects via desk-based and on-site reviews
- Has enforcement powers — fines, rebukes, conditions, suspension, strike-off
**LSAG (Legal Sector Affinity Group) Guidance** — the SRA-approved practical guidance (analogous to JMLSG for financial services). HM Treasury approved. Departing from LSAG requires defensible justification.
**Firm-level obligations:**
- FWRA reviewed annually + on material change
- Independent audit (reg.21(1)(c)) — proportionate frequency, typically every 2-3 years for small firms
- All staff in scope receive AML training (record-kept)
- COLP/COFA accountable; MLRO is the SAR conduit
**Practical:** small firms can use SRA's free FWRA template + LSAG's CDD checklist. FallLegalOnboard supplies the CDD / conflict / audit machinery; the FWRA itself is a firm-level document.`},
  {match:/conflict.*type|types.*conflict|own interest|former client conflict/i,title:'Types of conflict (SRA)',answer:()=>`**SRA Code of Conduct for Solicitors 2019 — Sections 6.1, 6.2, 6.3 + Code for Firms para 6:**
**1. Own-interest conflict (SCC 6.1)** — adviser's personal interest conflicts with client's. **NEVER permissible — no waiver possible.** Examples:
- Acting for a client where you're also a beneficiary of the matter
- Your firm holding a financial interest in opposing party
- Personal relationship with opposing solicitor that risks disclosure
**2. Client conflict (SCC 6.2)** — two current clients with conflicting interests. **Generally prohibited**, two narrow exceptions:
- **Substantially common interest** exception (6.2(a)) — clients have a clear common purpose
- **Competing for the same objective** exception (6.2(b)) — both clients knowingly compete for a finite asset
Both exceptions require: (i) informed written consent, (ii) effective protection of confidentiality, (iii) reasonable belief acting is in both clients' best interests.
**3. Former client conflict (SCC 6.5 / confidentiality)** — you hold confidential information from a former client that is **material** to a current client's matter and adverse to former client's interests. Information barrier ("Chinese walls") may permit acting, but high bar.
**4. Conflict of interest with third party** (witnesses, beneficial owners) — disclose and consider impact.
**FallLegalOnboard's conflict check:** scans existing IDB + broadcasts on \`fall-law\` to siblings, aggregates hits, presents for adviser resolution. **Resolution must be recorded in conflictRegister with rationale.** SRA expects evidence of the conflict check, not just its absence.`},
  {match:/informed consent.*conflict|consent.*conflict|chinese wall/i,title:'Informed consent for conflict',answer:()=>`**Where a Section 6.2 exception is relied on, informed consent must be:**
**Written.** Email or paper, signed or e-signed. Verbal alone insufficient for evidential purposes.
**Specific.** General "I waive future conflicts" boilerplate is unenforceable. Each waiver scopes the **specific conflict** being waived.
**Informed.** Client must understand:
- The nature of the conflict and how it arose
- What information might be shared, withheld, or compartmentalised
- The risk that acting may proceed less zealously than if the conflict didn't exist
- The right to take **separate independent legal advice** before consenting
- That the firm may have to cease acting if matters worsen
**Information barriers ("Chinese walls"):**
- Physically and electronically separate teams
- Document-management system access controls
- No cross-team conversation on the matter
- Designated supervising partner outside the wall
- Annual attestation by walled staff
**SCC 6.5 (former client confidentiality):** firm may continue acting for new client where confidential ex-client info **is material** only if: (a) ex-client gives informed consent, OR (b) effective measures (Chinese walls) **AND** current client gives informed consent to those measures.
**FallLegalOnboard:** every conflict resolution must record the **resolution type** (clear / waiver-obtained / withdrawn / wall-erected) + **adviser notes** referencing where the written consent / wall protocol lives.`},
  {match:/vulnerab|sra equality|equality act/i,title:'Vulnerable client assessment (SRA + Equality Act)',answer:()=>`**The legal-sector framework:** Equality Act 2010 + SRA Principles 2019 (Principle 6: act in best interests) + SRA Standards & Regulations + Consumer Duty-equivalents pulled across from FCA practice.
**Four common vulnerability drivers (mirroring FCA FG21/1):**
1. **Health** — physical disability, mental health, addiction, cognitive impairment (dementia, learning disability), terminal illness
2. **Life events** — bereavement (very common in probate/family), divorce, job loss, becoming a carer, domestic abuse, financial abuse by family
3. **Resilience** — over-indebtedness, low/erratic income, financial pressure during a high-stakes transaction
4. **Capability** — limited English, low legal/financial literacy, neurodivergence, digital exclusion
**Equality Act 2010 specifically requires:**
- **Reasonable adjustments** under s.20 (NOT optional — anticipatory duty for service providers under s.29)
- Examples: large print, plain English client care letter, sign-language interpreter, longer appointment slots, home visit, third-party support
**SRA expectations (Principle 6, Code 3.4):**
- Identify vulnerability proactively
- Adapt service delivery (not just process the file faster)
- Document the adjustments made
- Be alert to undue influence (third-party present, sudden gift to carer, will under suspicious circumstances → Banks v Goodfellow / Re Estate of Park / golden rule)
- Capacity check where required (Mental Capacity Act 2005 s.1-3, Re BKR / Masterman-Lister principles)
**FallLegalOnboard:** records flag + category + type (permanent/temporary/fluctuating) + free-text adjustments made.`},
  {match:/what.*pep|pep definition|politically.?exposed/i,title:'PEP definition',answer:()=>`**PEP — Politically Exposed Person** (MLR 2017 reg.35, mirroring FATF Recommendation 12).
A natural person entrusted with a **prominent public function** — plus their **family members** and **known close associates**.
**Categories of PEP:**
- Heads of state, heads of government, ministers, deputy ministers
- Members of parliament, supreme courts, central bank boards
- Ambassadors, chargés d'affaires, senior military officers (general rank+)
- Senior executives / directors of state-owned enterprises
- International organisation officials (UN, EU, IMF, World Bank, etc.)
**Family:** spouse / civil partner, children + their spouses, parents.
**Known close associates:** beneficial ownership of a legal entity jointly with a PEP; sole BO of an entity set up for a PEP's benefit; close business relationships.
**Domestic vs foreign PEPs:** UK (since 2023 amendment to MLR) explicitly lower-risk default for **domestic PEPs** — EDD still required but firm can apply lighter enhanced measures if no other risk factors. Foreign PEPs remain higher-baseline.
**On identification:**
1. **Senior management approval** to enter/continue the relationship (SRA: COLP or designated senior partner)
2. **EDD** under reg.33 — both SoF and SoW with documentary corroboration
3. **Enhanced ongoing monitoring** — at minimum annual review; daily transactional review if regulated transactional matters
4. **PEP-status persists** for typically **12 months after leaving office** (firm's risk-based judgment; FATF says "no time limit" by nature)`},
  {match:/sanctions.*lookup|ofsi|hmt.*sanctions|consolidated list/i,title:'Sanctions screening (UK)',answer:()=>`**OFSI Consolidated List** — HM Treasury's Office of Financial Sanctions Implementation maintains the UK's official sanctions targets across all regimes (Russia, Iran, terrorism, Belarus, Myanmar, etc.).
**Where to check:**
- Web search: https://sanctionssearch.ofsi.hmtreasury.gov.uk/
- Consolidated list (CSV/XML): https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets
- UK Sanctions List: https://www.gov.uk/government/publications/the-uk-sanctions-list
**What to screen (for each new matter and at periodic CDD review):**
- Client name + DOB + nationality
- All **beneficial owners ≥25%** (companies, trusts, partnerships)
- PSCs (persons with significant control)
- PEP family + close associates
- **Opposing parties** in litigation/conveyancing (especially for sanctioned entity property transfers)
- Source of funds counterparties
**Update cadence:** OFSI updates the list **weekly**. Daily for crisis periods (e.g. Russia post-2022).
**On a match (positive hit):**
1. **DO NOT** tip off the client (Sanctions and Anti-Money Laundering Act 2018 / POCA tipping-off)
2. Stop processing the matter immediately — **asset freeze** applies
3. Report to OFSI via the Compliance Reporting Form (max 14 days; sooner if asked)
4. Consider SAR to NCA via MLRO
5. Apply for a **licence** if you need to continue (e.g. essential professional services exception under General Licence)
**FallLegalOnboard records:** sanctions status (clear/match/review/not-checked), adviser ID, timestamp. Manual workflow — automated screening requires paid feed (Refinitiv World-Check, ComplyAdvantage, Dow Jones).`},
  {match:/edd.*trigger|enhanced due diligence|when.*edd/i,title:'EDD triggers (MLR 2017)',answer:()=>`**EDD — Enhanced Due Diligence** under MLR 2017 reg.33 is **mandatory** in these circumstances:
**1. High-risk third countries** (reg.33(1)(b)) — the UK list mirrors FATF + UK additions (HMT publishes; check current list).
**2. PEPs, family, close associates** (reg.35) — even domestic.
**3. Complex or unusually large transactions** with no apparent economic or lawful purpose (reg.33(1)(f)).
**4. Unusual patterns of transactions** (reg.33(1)(f)).
**5. Where the firm's own risk assessment** (FWRA) flags higher risk for this matter/client (reg.33(1)(a)).
**6. Correspondent relationships** with non-UK respondents (reg.34) — rarely applies to legal sector but possible for trust services.
**7. Where there is suspicion of money laundering or terrorist financing** but no SAR has yet been filed.
**SRA-specific higher-risk indicators (LSAG §6):**
- Cash-intensive matter
- Disguised beneficial ownership / nominees / unusual corporate structure
- Source of funds from a higher-risk jurisdiction
- Client reluctance to provide CDD evidence
- Use of pooled / client account routing without clear purpose
- "Friendly" loans between non-related parties
**EDD adds (over standard CDD):**
- **Senior management approval** to onboard/continue
- **SoF AND SoW** with documentary corroboration proportionate to risk
- **Enhanced ongoing monitoring** — frequency, depth, escalation triggers
- Additional verification of beneficial ownership (e.g. independent register confirmation, not just client declaration)
**FallLegalOnboard:** auto-suggests risk grade and EDD requirement; adviser must confirm or override.`},
  {match:/beneficial owner.*threshold|25%|bo threshold|ownership threshold/i,title:'Beneficial ownership thresholds',answer:()=>`**Beneficial Owner definition (MLR 2017 reg.5-7):**
**For a body corporate (Ltd, plc):**
- A natural person who **owns or controls** more than **25% of shares or voting rights**, OR
- Otherwise exercises **significant influence or control** (e.g. veto rights, golden share)
**For a partnership/LLP:**
- A natural person ultimately entitled to or controlling more than **25% of capital, profits, or voting rights**
**For a trust:**
- The **settlor**
- The **trustees**
- The **protector** (if any)
- The **beneficiaries** (or class of beneficiaries where individuals not yet identifiable)
- Any other natural person exercising **ultimate effective control**
**For a charity / foundation:**
- Trustees + persons exercising effective control + beneficial class if identifiable
**Cascade / look-through rule:** if the BO is itself a corporate, you must trace through to the **ultimate natural person**. Chains of holdings count multiplicatively (e.g. 50% of 60% = 30% — still BO; 30% of 60% = 18% — not BO under 25% rule unless control otherwise exists).
**Verification:**
- Standard CDD: client declaration + reasonable measures (Companies House PSC search, articles of association review)
- EDD: independent corroboration (e.g. legal opinion, audited accounts, beneficial-ownership register where available — UK PSC, Trust Register on TRS)
**FallLegalOnboard:** captures named BOs with % ownership and a "nature of control" free-text field. For complex structures (>3 BOs) the risk score increments — likely EDD.`},
  {match:/psc|persons.*significant control|psc.*report/i,title:'PSC reporting (Companies House)',answer:()=>`**Persons with Significant Control register (PSC)** — created by Small Business, Enterprise and Employment Act 2015, in force from June 2016 for UK companies and LLPs.
**Who must be on PSC:**
A natural person who meets **one or more** of:
1. Directly or indirectly holds **more than 25% of shares**
2. Directly or indirectly holds **more than 25% of voting rights**
3. Has the right (directly or indirectly) to **appoint or remove a majority of directors**
4. Has the right to exercise, or actually exercises, **significant influence or control**
5. Has the right to exercise, or actually exercises, **significant influence or control over a trust or firm** that itself satisfies any of 1-4
**Bands disclosed (anonymised by band, not exact %):**
- Over 25% up to 50%
- More than 50% up to 75%
- More than 75%
**Filing obligations:**
- Company must take **reasonable steps** to identify PSCs (s.790D)
- Notify PSC within 1 month of identification
- File on confirmation statement annually
- Notify changes within 14 days (s.790VA)
**Penalties:** failure to comply is a **criminal offence** for the company and every officer in default (up to 2 years imprisonment + fine).
**For a solicitor doing CDD:**
1. Search Companies House PSC entry **first** — free and authoritative
2. Cross-check against client declaration — discrepancies are red flags
3. For trust/foundation clients, check **Trust Registration Service (TRS)** via HMRC if a UK express trust
4. Verify that the PSC matches the natural persons your client has declared as BOs
5. If PSC is "subject to enforcement" or "exempt", document why and consider EDD
**FallLegalOnboard:** PSC list capture sits in the beneficial-ownership step for entity clients. Match the % bands to PSC convention so the firm's record reconciles with Companies House on inspection.`},
  {match:/equality act|duties.*equality|reasonable adjustment/i,title:'Equality Act duties for solicitors',answer:()=>`**Equality Act 2010** applies to solicitors as service providers (Part 3) and as employers (Part 5). For client onboarding the **Part 3** duties bite.
**Protected characteristics (s.4):** age, disability, gender reassignment, marriage/civil partnership, pregnancy/maternity, race, religion/belief, sex, sexual orientation.
**Prohibited conduct:**
- **Direct discrimination** (s.13) — treating someone less favourably because of a protected characteristic
- **Indirect discrimination** (s.19) — applying a neutral provision/criterion/practice that puts a group at particular disadvantage and cannot be objectively justified
- **Harassment** (s.26)
- **Victimisation** (s.27)
- **Failure to make reasonable adjustments** (s.20-22, **anticipatory duty for disability**)
**The anticipatory duty (s.20-22):** unlike employment, in service provision the duty arises **before any individual disabled person seeks the service**. Firms must consider:
1. **Provision, criterion or practice** that puts disabled persons at a substantial disadvantage
2. **Physical features** (steps, narrow doors, signage)
3. **Auxiliary aids and services** (large print, BSL, hearing loops, screen-reader-friendly docs)
**SRA Standards & Regulations + Code 1.1:** treat clients with dignity, do not discriminate; this maps onto the Act.
**Practical onboarding implications:**
- Client care letter in plain English at default; available in large print / easy-read on request
- Asking about adjustment needs respectfully, not as a tick-box
- Don't insist on online-only intake if client is digitally excluded
- Translation/interpretation where needed (firm pays; cannot pass cost to client without consent in a way that disadvantages them)
- Capacity assessment if cognitive impairment is suspected (MCA 2005 framework)
**FallLegalOnboard:** vulnerability assessment captures category + adjustments made — this evidences the firm's compliance.`},
  {match:/consumer duty.*equivalent|legal.*consumer duty|sra.*consumer|prin 2a.*legal/i,title:'Consumer Duty equivalents in the legal sector',answer:()=>`**There is no direct Consumer Duty (FCA PRIN 2A) for solicitors** — the FCA's PRIN doesn't bind SRA-regulated firms. But the SRA has analogous obligations that, in practice, achieve similar outcomes:
**SRA Principles 2019** (apply to firms and individuals):
- **Principle 1** — act in a way that upholds the constitutional principle of the rule of law and the proper administration of justice
- **Principle 2** — uphold public trust and confidence
- **Principle 3** — act with independence
- **Principle 4** — act with honesty
- **Principle 5** — act with integrity
- **Principle 6** — act in a way that encourages equality, diversity and inclusion
- **Principle 7** — **act in the best interests of each client** ← the closest analogue to Consumer Duty
**SRA Code of Conduct (firms + solicitors) operationalising Principle 7:**
- **Para 1.1** — do not unfairly discriminate
- **Para 3.4** — consider and take account of the client's attributes, needs and circumstances
- **Para 8.6/8.7** — give costs information and information about the right to complain at outset
- **Para 8.11** — keep clients informed about progress
- **Transparency Rules 2018** — published price/service information for specified work types
**Legal Services Act 2007 s.1(1)** — regulatory objectives include "protecting and promoting the interests of consumers" and "promoting competition".
**Legal Ombudsman scheme** — complaints handling, 8-week firm complaints procedure, LeO escalation, time limits (6 years from act, 3 years from awareness, max 1 year from end of firm complaints).
**Practical equivalents to the FCA's 4 outcomes:**
1. **Products & services** ↔ scope-of-retainer matched to client need (Code 8.7)
2. **Price & value** ↔ Transparency Rules + costs information (Code 8.7)
3. **Consumer understanding** ↔ Code 8.6 (information in a way the client can understand)
4. **Consumer support** ↔ Code 3.4 + Equality Act adjustments + complaints handling
**FallLegalOnboard:** Vulnerable-client step + retainer-scope capture together evidence "Principle 7 in best interests".`},
  {match:/retention.*period|cdd.*retention|how long.*keep|6 ?year|sra retention/i,title:'CDD retention period (SRA)',answer:()=>`**Retention periods relevant to SRA-regulated firms:**
| Record | Min retention | Source |
|---|---|---|
| CDD evidence (ID, address, beneficial ownership) | **5 years from end of business relationship** | MLR 2017 reg.40 |
| Transaction records | **5 years from transaction** | MLR 2017 reg.40 |
| Firm-wide risk assessment + PCPs | **5 years from supersession** | MLR 2017 reg.18-19 |
| Closed client file (matter file) | **6 years from end of retainer** | SRA rule 13.5 |
| Client account records (SAR-side) | **6 years from creation** | SRA Accounts Rules 13.3 |
| Conflict register entries | **6 years (aligned with file retention)** | SRA practice + LSAG |
| SARs / internal MLRO reports | **5 years from making the report** | POCA 2002 |
| Audit / training records | **5 years** | LSAG guidance |
| Wills + probate originals | **indefinitely until requested or destruction agreed** | client property duty |
| Conveyancing files (post-completion) | **15 years recommended** (deeds + dispute window) | Law Society / insurer guidance |
**Practical SRA-aligned default:** **6 years from end of retainer** covers MLR (5yr), SRA file retention (6yr), and most negligence/limitation windows for contract claims.
**Format:** electronic is fine if tamper-evident and accessible. FallLegalOnboard's audit chain + IDB + JSON export gives you this if you export periodically to off-device cold storage.
**Destruction:** schedule + reasoned destruction record (don't just delete). Client property (deeds, wills) requires explicit instructions or retention indefinitely.
**FallLegalOnboard's audit entries** carry \`retentionYears: 6\` per SRA. Cap is 50,000 entries — for a 1-10 person firm that comfortably covers a decade+ of activity.`},
];
async function answer(q){
  for(const r of T0_RULES){if(r.match.test(q))return{src:'T0 · '+r.title,text:r.answer()}}
  const tier=Cascade.detectTier();
  if(tier==='T3'){
    const sys=`You are FallLegalOnboard, a sovereign SRA-shaped client onboarding tool for UK solicitor firms. You help with CDD, conflict-of-interest checks, source-of-funds analysis, vulnerable-client assessment (Equality Act 2010 + SRA Principle 7), PEP & sanctions screening (OFSI), beneficial-ownership / PSC capture, EDD triggers (MLR 2017), and audit-trail discipline. **You are informational — not regulatory compliance advice.** Always cite the source (MLR 2017 reg.N, SRA Standards & Regs / Code para, LSAG section, Equality Act s.N, case name). UK-specific. End with: "Verify with your COLP / MLRO before relying."`;
    const ctx=`Firm: ${state.firm?.name||'(not set up)'}. SRA ref: ${state.firm?.sraFirmRef||'—'}. Active clients: ${state.clients.filter(c=>!c.archivedAt).length}. Advisers: ${state.advisers.length}.`;
    const r=await Cascade.generate(sys,ctx+'\n\nQuestion: '+q,1400);
    if(r.text)return{src:r.tier,text:r.text}
  }
  return{src:'T0 · fallback',text:`I don't have a canned rule for that question. Add an API key in **Settings** (Gemini is free) to enable T3 grounded answers.\n\nSupported T0 topics:\n${T0_RULES.map(r=>'• '+r.title).join('\n')}`};
}
// VIEW ROUTER
function render(){
  $('#brandName').textContent=state.settings.engineName||'FallLegalOnboard';
  const nav=$('#nav');
  const clientCount=state.clients.filter(c=>!c.archivedAt).length;
  nav.innerHTML=TABS.map(t=>{
    let count='';
    if(t.id==='clients')count=clientCount;
    else if(t.id==='advisers')count=state.advisers.filter(a=>!a.archivedAt).length;
    else if(t.id==='conflicts')count=state.conflictRegister.length;
    const cnt=count!==''&&count!==0?`<span class="tcount">${count}</span>`:(count===0?'':'');
    return `<button class="${state.active===t.id?'active':''}" onclick="go('${t.id}')">${t.label}${cnt}</button>`;
  }).join('');
  updateTierBadge();
  const v=$('#view');
  if(state.ui.wizard){v.innerHTML=renderWizardShell();bindWizard();return}
  if(state.ui.activeClient){v.innerHTML=renderClientDetail();bindClientDetail();return}
  switch(state.active){
    case 'clients':v.innerHTML=renderClients();bindClients();break;
    case 'dashboard':v.innerHTML=renderDashboard();break;
    case 'conflicts':v.innerHTML=renderConflictRegister();break;
    case 'firm':v.innerHTML=renderFirm();bindFirm();break;
    case 'advisers':v.innerHTML=renderAdvisers();bindAdvisers();break;
    case 'qa':v.innerHTML=renderQA();bindQA();break;
    default:v.innerHTML=renderClients();bindClients();
  }
}
function go(id){state.active=id;state.ui.activeClient=null;state.ui.wizard=null;persistState();render()}
function updateTierBadge(){const t=Cascade.detectTier();const el=$('#tierBadge');if(!el)return;el.textContent=t==='T0'?'T0 · offline':t;el.classList.toggle('t3',t==='T3')}
function disclaimerBanner(){
  return `<div class="disclaimer"><strong>FallLegalOnboard</strong> is a tool for SRA-regulated UK solicitors. It assists with CDD, conflict-of-interest checks, and onboarding evidence capture. It is not regulatory submission or legal opinion software. The firm's <strong>COLP / COFA</strong> remain responsible. <strong>Sovereign</strong> — client data never leaves the device unless you export.</div>`;
}
function needsSetupBanner(){
  if(state.settings.setupDismissed)return'';
  if(state.firm&&state.advisers.length>0)return'';
  return `<div class="banner warn">First-run setup is incomplete. <a href="#" onclick="go('firm');return false">Set up your firm record</a>${state.advisers.length===0?' and <a href="#" onclick="go(\'advisers\');return false">add at least one adviser</a>':''} for a complete audit trail. <button class="btn sm ghost" style="margin-left:8px" onclick="dismissSetup()">dismiss</button></div>`;
}
function dismissSetup(){state.settings.setupDismissed=true;persistState();render()}
function chip(label,active,onclick,cls){return `<button class="chip ${active?'active':''} ${cls||''}" onclick="${onclick()}">${esc(label)}</button>`}
function cddColor(s){return ({pending:'amber',verified:'green',review:'blue',failed:'red'})[s]||'muted'}
function riskColor(s){return ({standard:'green',enhanced:'amber',high:'red'})[s]||'muted'}
function conflictColor(s){return ({pending:'amber',clear:'green','conflict-identified':'red','conflict-waived':'violet',withdrawn:'muted'})[s]||'muted'}
function setFilter(k,v){state.ui.filter[k]=v;render()}
function clearFilter(){state.ui.filter={cdd:'',risk:'',type:'',due:false};render()}
// CLIENTS LIST
function renderClients(){
  const active=state.clients.filter(c=>!c.archivedAt);
  if(state.clients.length===0){
    return `${disclaimerBanner()}${needsSetupBanner()}<div class="empty">
      <div class="big">No clients yet</div>
      <div class="small">Start onboarding your first client to build the CDD record + conflict register.</div>
      <button class="btn primary" onclick="newClient()">+ onboard a client</button>
    </div>`;
  }
  const f=state.ui.filter;
  let list=active.slice();
  if(f.cdd)list=list.filter(c=>c.kyc?.status===f.cdd);
  if(f.risk)list=list.filter(c=>c.kyc?.riskGrade===f.risk);
  if(f.type)list=list.filter(c=>c.clientType===f.type);
  if(f.due){const n=now();list=list.filter(c=>c.kyc?.nextReviewDue&&c.kyc.nextReviewDue-n<30*86400000)}
  list.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const overdueCount=active.filter(c=>c.kyc?.nextReviewDue&&c.kyc.nextReviewDue-now()<30*86400000).length;
  return `${disclaimerBanner()}${needsSetupBanner()}
  <div class="section-h"><div><h2>Clients</h2><div class="sub">${active.length} active · ${overdueCount} due for review</div></div>
    <div class="actions"><button class="btn primary" onclick="newClient()">+ new client</button></div>
  </div>
  <div class="chip-row">
    ${chip('all',!f.cdd&&!f.risk&&!f.type&&!f.due,()=>'clearFilter()')}
    ${['pending','verified','review','failed'].map(s=>chip('cdd · '+s,f.cdd===s,()=>`setFilter('cdd','${s}')`,cddColor(s))).join('')}
    ${['standard','enhanced','high'].map(s=>chip('risk · '+s,f.risk===s,()=>`setFilter('risk','${s}')`,riskColor(s))).join('')}
    ${['individual','limited-company','partnership','llp','trust','charity'].map(s=>chip(s,f.type===s,()=>`setFilter('type','${s}')`)).join('')}
    ${chip('review due ≤30d',f.due,()=>`setFilter('due',true)`,f.due?'due':'')}
  </div>
  ${list.length===0?'<div class="banner info">No clients match the current filters.</div>':`
  <div class="card" style="padding:0;overflow:hidden">
  <div style="overflow-x:auto"><table>
    <thead><tr><th>Name</th><th>Type</th><th>CDD</th><th>Risk</th><th>Conflict</th><th>Practice</th><th>Last review</th><th>Next due</th></tr></thead>
    <tbody>
    ${list.map(c=>{
      const due=c.kyc?.nextReviewDue;const overdue=due&&due-now()<30*86400000;
      return `<tr class="row-link" onclick="openClient('${c.id}')">
        <td><strong>${esc(displayName(c))}</strong>${c.app?.isDemo?' <span class="tag muted">demo</span>':''}</td>
        <td>${esc(c.clientType||'individual')}</td>
        <td><span class="tag ${cddColor(c.kyc?.status)}">${esc(c.kyc?.status||'pending')}</span></td>
        <td><span class="tag ${riskColor(c.kyc?.riskGrade)}">${esc(c.kyc?.riskGrade||'standard')}</span></td>
        <td><span class="tag ${conflictColor(c.kyc?.conflictStatus)}">${esc(c.kyc?.conflictStatus||'pending')}</span></td>
        <td>${esc(c.kyc?.practiceArea||'—')}</td>
        <td>${c.kyc?.lastReviewAt?esc(fmtDate(c.kyc.lastReviewAt)):'—'}</td>
        <td>${due?`<span class="${overdue?'tag ox':''}">${esc(fmtDate(due))}</span>`:'—'}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>
  </div>`}
  ${renderArchivedSection()}`;
}
function bindClients(){}
function renderArchivedSection(){
  const arch=state.clients.filter(c=>c.archivedAt);
  if(arch.length===0)return'';
  return `<div class="divider"></div><details class="card" style="padding:14px"><summary style="cursor:pointer;color:var(--cream-dim);font-family:var(--mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase">Archived (${arch.length}) · SRA 6-yr retention from end of retainer</summary>
    <table style="margin-top:10px"><thead><tr><th>Name</th><th>Archived</th><th></th></tr></thead><tbody>
    ${arch.map(c=>`<tr><td>${esc(displayName(c))}</td><td>${esc(fmtDate(c.archivedAt))}</td><td class="r"><button class="btn sm" onclick="openClient('${c.id}')">view</button></td></tr>`).join('')}
    </tbody></table></details>`;
}
// DASHBOARD
function renderDashboard(){
  const active=state.clients.filter(c=>!c.archivedAt);
  const n=now();
  const dueSoon=active.filter(c=>c.kyc?.nextReviewDue&&c.kyc.nextReviewDue-n<30*86400000);
  const overdue=active.filter(c=>c.kyc?.nextReviewDue&&c.kyc.nextReviewDue<n);
  const pep=active.filter(c=>c.kyc?.pepFlag).length;
  const sancMatch=active.filter(c=>c.kyc?.sanctionsStatus==='match'||c.kyc?.sanctionsStatus==='review').length;
  const vuln=active.filter(c=>c.kyc?.vulnerableCustomerFlag).length;
  const conflicts=active.filter(c=>c.kyc?.conflictStatus==='conflict-identified'||c.kyc?.conflictStatus==='conflict-waived').length;
  const high=active.filter(c=>c.kyc?.riskGrade==='high').length;
  const byCdd={pending:0,verified:0,review:0,failed:0};
  active.forEach(c=>{byCdd[c.kyc?.status||'pending']=(byCdd[c.kyc?.status||'pending']||0)+1});
  const byRisk={standard:0,enhanced:0,high:0};
  active.forEach(c=>{byRisk[c.kyc?.riskGrade||'standard']=(byRisk[c.kyc?.riskGrade||'standard']||0)+1});
  return `${disclaimerBanner()}
  <div class="section-h"><div><h2>Dashboard</h2><div class="sub">portfolio of ${active.length} client${active.length===1?'':'s'}</div></div></div>
  <div class="dash-kpis">
    <div class="dash-kpi"><div class="n">${active.length}</div><div class="l">Active clients</div></div>
    <div class="dash-kpi ${overdue.length?'due':'ok'}"><div class="n">${overdue.length}</div><div class="l">CDD overdue</div></div>
    <div class="dash-kpi ${dueSoon.length-overdue.length>0?'warn':'ok'}"><div class="n">${dueSoon.length-overdue.length}</div><div class="l">Due ≤30 days</div></div>
    <div class="dash-kpi ${pep?'warn':'ok'}"><div class="n">${pep}</div><div class="l">PEPs</div></div>
    <div class="dash-kpi ${sancMatch?'due':'ok'}"><div class="n">${sancMatch}</div><div class="l">Sanctions review</div></div>
    <div class="dash-kpi ${vuln?'warn':'ok'}"><div class="n">${vuln}</div><div class="l">Vulnerable</div></div>
    <div class="dash-kpi ${conflicts?'warn':'ok'}"><div class="n">${conflicts}</div><div class="l">Conflict flags</div></div>
    <div class="dash-kpi ${high?'due':'ok'}"><div class="n">${high}</div><div class="l">High-risk grade</div></div>
  </div>
  <div class="grid-2">
    <div class="card"><h3>CDD status mix</h3>${Object.entries(byCdd).map(([k,v])=>`<div class="kpi"><span class="l"><span class="tag ${cddColor(k)}">${k}</span></span><span class="v">${v}</span></div>`).join('')}</div>
    <div class="card"><h3>Risk grade distribution</h3>${Object.entries(byRisk).map(([k,v])=>`<div class="kpi"><span class="l"><span class="tag ${riskColor(k)}">${k}</span></span><span class="v">${v}</span></div>`).join('')}</div>
  </div>
  ${dueSoon.length?`<div class="divider"></div>
  <div class="card">
    <h3>Due for CDD refresh <span class="meta">${dueSoon.length} client${dueSoon.length===1?'':'s'}</span></h3>
    <table><thead><tr><th>Client</th><th>Risk</th><th>Last review</th><th>Next due</th><th>Status</th></tr></thead><tbody>
    ${dueSoon.sort((a,b)=>(a.kyc.nextReviewDue||0)-(b.kyc.nextReviewDue||0)).map(c=>{
      const d=c.kyc.nextReviewDue;const od=d<n;
      return `<tr class="row-link" onclick="openClient('${c.id}')"><td>${esc(displayName(c))}</td><td><span class="tag ${riskColor(c.kyc.riskGrade)}">${esc(c.kyc.riskGrade)}</span></td><td>${esc(fmtDate(c.kyc.lastReviewAt))}</td><td>${esc(fmtDate(d))}</td><td>${od?'<span class="tag ox">overdue</span>':'<span class="tag amber">due soon</span>'}</td></tr>`;
    }).join('')}
    </tbody></table>
  </div>`:''}
  <div class="divider"></div>
  <div class="card">
    <h3>Firm health</h3>
    <div class="kpi"><span class="l">Firm record</span><span class="v ${state.firm?'green':'red'}">${state.firm?'configured':'missing'}</span></div>
    <div class="kpi"><span class="l">SRA firm ref</span><span class="v">${esc(state.firm?.sraFirmRef||'—')}</span></div>
    <div class="kpi"><span class="l">COLP</span><span class="v">${esc(state.advisers.find(a=>a.id===state.firm?.colpAdviserId)?.name||'unassigned')}</span></div>
    <div class="kpi"><span class="l">COFA</span><span class="v">${esc(state.advisers.find(a=>a.id===state.firm?.cofaAdviserId)?.name||'unassigned')}</span></div>
    <div class="kpi"><span class="l">Advisers on books</span><span class="v">${state.advisers.filter(a=>!a.archivedAt).length}</span></div>
    <div class="kpi"><span class="l">PI insurance expiry</span><span class="v ${piExpiryColor()}">${state.firm?.piExpiresAt?esc(fmtDate(state.firm.piExpiresAt)):'—'} ${state.firm?.piMinCoverGbp?`· min cover £${(state.firm.piMinCoverGbp/1000000).toFixed(1)}M`:''}</span></div>
    <div class="kpi"><span class="l">Conflict checks recorded</span><span class="v">${state.conflictRegister.length}</span></div>
    <div class="kpi"><span class="l">Audit chain entries</span><span class="v">${state.audit.length.toLocaleString('en-GB')}</span></div>
    <div class="kpi"><span class="l">Documents stored</span><span class="v">${active.reduce((a,c)=>a+(c.kyc?.documentsHeld?.length||0),0)}</span></div>
  </div>
  <div class="foot">${TOOLNAME} v${VERSION} · prime ${PRIME} · schema v${SCHEMA_V} · fall-law mesh · sovereign</div>`;
}
function piExpiryColor(){const e=state.firm?.piExpiresAt;if(!e)return'';const d=daysBetween(now(),e);if(d<0)return'red';if(d<30)return'amber';return'green'}
// CONFLICT REGISTER
function renderConflictRegister(){
  const list=state.conflictRegister;
  return `${disclaimerBanner()}
  <div class="section-h"><div><h2>Conflict register</h2><div class="sub">${list.length} check${list.length===1?'':'s'} recorded · SRA Code 6.1-6.5 · 6-yr retention</div></div></div>
  ${list.length===0?'<div class="empty"><div class="big">No conflict checks recorded</div><div class="small">Conflict checks run during onboarding land here automatically.</div></div>':`
  <div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table>
    <thead><tr><th>When</th><th>Client / subject</th><th>Opposing party</th><th>Scanned by</th><th>Hits</th><th>Resolution</th><th>Notes</th></tr></thead>
    <tbody>${list.map(e=>{const adv=state.advisers.find(a=>a.id===e.scannedBy);return `<tr>
      <td>${esc(fmtDateTime(e.ts))}</td>
      <td><strong>${esc(e.clientName||'—')}</strong></td>
      <td>${esc(e.otherParty||'—')}</td>
      <td>${esc(adv?.name||'—')}</td>
      <td><span class="tag ${e.hitCount?'red':'green'}">${e.hitCount} hit${e.hitCount===1?'':'s'}</span></td>
      <td><span class="tag ${conflictColor(e.resolution)}">${esc(e.resolution)}</span></td>
      <td style="max-width:300px">${esc(e.resolutionNotes||'—')}</td>
    </tr>`}).join('')}</tbody>
  </table></div></div>
  <div class="foot">Conflict register · entries are append-only · export via Audit modal</div>`}`;
}
// FIRM
function renderFirm(){
  const f=state.firm||newFirmRec();
  const isNew=!state.firm;
  const advs=state.advisers.filter(a=>!a.archivedAt);
  return `${disclaimerBanner()}
  <div class="section-h"><div><h2>Firm record</h2><div class="sub">single record per device · broadcast on save</div></div></div>
  <div class="card" style="max-width:820px">
    ${isNew?'<div class="banner info">First-run setup. Tell FallLegalOnboard about your firm — these fields appear on CDD certificates, audit entries, and engagement letters generated downstream.</div>':''}
    <div class="row">
      <div class="field"><label>Legal name <span class="req">*</span></label><input id="f_name" value="${esc(f.name)}"></div>
      <div class="field"><label>Trading name</label><input id="f_trading" value="${esc(f.tradingName)}"></div>
    </div>
    <div class="row3">
      <div class="field"><label>SRA firm reference</label><input id="f_sra" value="${esc(f.sraFirmRef)}"><div class="hint">6-digit SRA ID</div></div>
      <div class="field"><label>Companies House no</label><input id="f_ch" value="${esc(f.companiesHouseNo)}"></div>
      <div class="field"><label>VAT number</label><input id="f_vat" value="${esc(f.vatNumber)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>COLP (Compliance Officer for Legal Practice)</label><select id="f_colp"><option value="">— unassigned —</option>${advs.map(a=>`<option value="${a.id}" ${f.colpAdviserId===a.id?'selected':''}>${esc(a.name)} · ${esc(a.smcrRole)}</option>`).join('')}</select></div>
      <div class="field"><label>COFA (Compliance Officer for Finance & Admin)</label><select id="f_cofa"><option value="">— unassigned —</option>${advs.map(a=>`<option value="${a.id}" ${f.cofaAdviserId===a.id?'selected':''}>${esc(a.name)} · ${esc(a.smcrRole)}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>AML supervisor</label><select id="f_aml">${['SRA','CILEx Regulation','BSB','CLC','Other'].map(x=>`<option ${f.amlSupervisor===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Professional body</label><select id="f_pb">${['SRA','Law Society','Other'].map(x=>`<option ${f.professionalBody===x?'selected':''}>${x}</option>`).join('')}</select></div>
    </div>
    <h3 style="font-family:var(--serif);font-size:14px;margin:18px 0 10px;color:var(--brass)">Registered address</h3>
    <div class="row">
      <div class="field"><label>Line 1</label><input id="f_a1" value="${esc(f.registeredAddress?.line1||'')}"></div>
      <div class="field"><label>Line 2</label><input id="f_a2" value="${esc(f.registeredAddress?.line2||'')}"></div>
    </div>
    <div class="row3">
      <div class="field"><label>City</label><input id="f_city" value="${esc(f.registeredAddress?.city||'')}"></div>
      <div class="field"><label>Postcode</label><input id="f_pc" value="${esc(f.registeredAddress?.postcode||'')}"></div>
      <div class="field"><label>Country</label><input id="f_country" value="${esc(f.registeredAddress?.country||'GB')}"></div>
    </div>
    <h3 style="font-family:var(--serif);font-size:14px;margin:18px 0 10px;color:var(--brass)">Professional Indemnity insurance <span class="help-pill" title="SRA minimum: £3M qualifying cover for incorporated practices, £2M for sole practitioners">SRA min ?</span></h3>
    <div class="row3">
      <div class="field"><label>Insurer</label><input id="f_pi" value="${esc(f.piInsurer)}"></div>
      <div class="field"><label>Policy no</label><input id="f_pin" value="${esc(f.piPolicyNo)}"></div>
      <div class="field"><label>Expires</label><input type="date" id="f_pix" value="${f.piExpiresAt?fmtDateISO(f.piExpiresAt):''}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Minimum cover (£)</label><input id="f_pim" type="number" value="${f.piMinCoverGbp||3000000}"><div class="hint">SRA minimum £3M (incorporated) / £2M (sole practitioner)</div></div>
      <div class="field"><label>Brand colour (hex)</label><input id="f_color" value="${esc(f.brandColor||'#8b1a1a')}"></div>
    </div>
    <div style="margin-top:18px"><button class="btn primary" onclick="commitFirm()">${isNew?'Create firm record':'Save changes'}</button></div>
  </div>`;
}
function bindFirm(){}
async function commitFirm(){
  const f=state.firm||newFirmRec();
  f.name=$('#f_name').value.trim();
  f.tradingName=$('#f_trading').value.trim();
  f.sraFirmRef=$('#f_sra').value.trim();
  f.companiesHouseNo=$('#f_ch').value.trim();
  f.vatNumber=$('#f_vat').value.trim();
  f.colpAdviserId=$('#f_colp').value;
  f.cofaAdviserId=$('#f_cofa').value;
  f.amlSupervisor=$('#f_aml').value;
  f.professionalBody=$('#f_pb').value;
  f.registeredAddress={line1:$('#f_a1').value.trim(),line2:$('#f_a2').value.trim(),city:$('#f_city').value.trim(),postcode:$('#f_pc').value.trim().toUpperCase(),country:$('#f_country').value.trim().toUpperCase()||'GB'};
  f.piInsurer=$('#f_pi').value.trim();
  f.piPolicyNo=$('#f_pin').value.trim();
  f.piExpiresAt=$('#f_pix').value?new Date($('#f_pix').value).getTime():null;
  f.piMinCoverGbp=parseInt($('#f_pim').value,10)||3000000;
  f.brandColor=$('#f_color').value.trim()||'#8b1a1a';
  if(!f.name){toast('Firm legal name required');return}
  if(!f.setupCompletedAt)f.setupCompletedAt=now();
  await saveFirm(f,'Firm record saved via setup');
  toast('Firm saved · broadcast');
  render();
}
// ADVISERS
function renderAdvisers(){
  const list=state.advisers.filter(a=>!a.archivedAt);
  return `${disclaimerBanner()}
  <div class="section-h"><div><h2>Advisers</h2><div class="sub">${list.length} on books</div></div>
    <div class="actions"><button class="btn primary" onclick="openAdvForm()">+ adviser</button></div>
  </div>
  ${list.length===0?'<div class="empty"><div class="big">No advisers yet</div><div class="small">Add at least one adviser to attribute CDD work in the audit chain.</div><button class="btn primary" onclick="openAdvForm()">+ add adviser</button></div>':
  `<div class="card" style="padding:0;overflow:hidden"><table>
    <thead><tr><th>Name</th><th>Role</th><th>SRA roll</th><th>Practising cert expiry</th><th>CPD hrs</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(a=>{const certExp=a.practicingCertExpiry?new Date(a.practicingCertExpiry).getTime():0;const certDue=certExp&&certExp-now()<30*86400000;return `<tr>
      <td><strong>${esc(a.name)}</strong></td>
      <td><span class="tag blue">${esc(a.smcrRole)}</span></td>
      <td>${esc(a.practicingCertNo||'—')}</td>
      <td>${a.practicingCertExpiry?`<span class="${certDue?'tag ox':''}">${esc(fmtDate(certExp))}</span>`:'—'}</td>
      <td>${a.cpdHoursThisYear||0} / 16</td>
      <td><span class="tag ${a.status==='active'?'green':'muted'}">${esc(a.status)}</span></td>
      <td class="r"><button class="btn sm" onclick="openAdvForm('${a.id}')">edit</button></td>
    </tr>`}).join('')}</tbody>
  </table></div>`}`;
}
function bindAdvisers(){}
function openAdvForm(id){
  const a=id?state.advisers.find(x=>x.id===id):newAdviserRec();
  if(id&&!a){toast('Adviser not found');return}
  showModal('Adviser',`
    <div class="row"><div class="field"><label>Name <span class="req">*</span></label><input id="ad_n" value="${esc(a.name)}"></div><div class="field"><label>Email</label><input id="ad_e" type="email" value="${esc(a.email)}"></div></div>
    <div class="row"><div class="field"><label>Phone</label><input id="ad_p" value="${esc(a.phone)}"></div><div class="field"><label>SRA role</label><select id="ad_r">${SMCR_ROLES.map(r=>`<option value="${r.v}" ${a.smcrRole===r.v?'selected':''}>${r.l}</option>`).join('')}</select></div></div>
    <div class="row"><div class="field"><label>SRA roll / practising cert no</label><input id="ad_f" value="${esc(a.practicingCertNo)}"></div><div class="field"><label>Practising cert expiry</label><input id="ad_x" type="date" value="${esc(a.practicingCertExpiry)}"></div></div>
    <div class="row"><div class="field"><label>CPD hours this year</label><input id="ad_c" type="number" min="0" max="50" value="${a.cpdHoursThisYear||0}"><div class="hint">SRA continuing competence: 16hrs/year recommended</div></div><div class="field"><label>Status</label><select id="ad_s">${['active','suspended','left'].map(x=>`<option ${a.status===x?'selected':''}>${x}</option>`).join('')}</select></div></div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      ${id?`<button class="btn danger" onclick="archiveAdv('${id}')">archive</button>`:''}
      <button class="btn primary" onclick="commitAdv('${a.id}')">${id?'save':'add adviser'}</button>
    </div>`);
}
async function commitAdv(id){
  let a=state.advisers.find(x=>x.id===id);const isNew=!a;
  if(isNew){a=newAdviserRec();a.id=id||a.id}
  a.name=$('#ad_n').value.trim();a.email=$('#ad_e').value.trim();a.phone=$('#ad_p').value.trim();
  a.practicingCertNo=$('#ad_f').value.trim();a.practicingCertExpiry=$('#ad_x').value;
  a.smcrRole=$('#ad_r').value;a.status=$('#ad_s').value;
  a.cpdHoursThisYear=parseInt($('#ad_c').value,10)||0;
  if(!a.name){toast('Name required');return}
  await saveAdviser(a,isNew?'Adviser added':'Adviser edited');
  closeModal();toast('Saved');render();
}
async function archiveAdv(id){
  if(!confirm('Archive this adviser? Audit history is preserved.'))return;
  const a=state.advisers.find(x=>x.id===id);if(!a)return;
  a.archivedAt=now();a.updatedAt=now();a.status='left';
  await persistState();await appendAudit('adviser.archived',{adviserId:id,reasoning:'Adviser archived'});
  bcSend('adviser.archived',a);
  closeModal();render();toast('Archived');
}
// WIZARD · 11 steps
const WIZARD_STEPS=[
  {k:'type',l:'Type'},
  {k:'identity',l:'Identity'},
  {k:'contact',l:'Contact'},
  {k:'beneficial',l:'BO/PSC'},
  {k:'cdd',l:'CDD core'},
  {k:'source',l:'Source funds'},
  {k:'pep',l:'PEP/Sanctions'},
  {k:'vulnerability',l:'Vulnerable'},
  {k:'documents',l:'Documents'},
  {k:'risk',l:'Risk'},
  {k:'conflict',l:'Conflict'},
  {k:'confirm',l:'Confirm'},
];
function newClient(){
  if(!state.firm){toast('Set up firm first');go('firm');return}
  if(state.advisers.length===0){toast('Add an adviser first');go('advisers');return}
  state.ui.wizard={client:newClientRec(),step:0,editing:false,conflictHits:null,conflictResolution:'pending',conflictNotes:''};
  state.ui.activeClient=null;
  render();
}
function editClientWizard(id){
  const c=state.clients.find(x=>x.id===id);if(!c)return;
  state.ui.wizard={client:JSON.parse(JSON.stringify(c)),step:0,editing:true,conflictHits:null,conflictResolution:c.kyc?.conflictStatus||'pending',conflictNotes:c.kyc?.conflictNotes||''};
  state.ui.activeClient=null;
  render();
}
function renderWizardShell(){
  const w=state.ui.wizard;const s=WIZARD_STEPS[w.step];
  return `<div class="wizard">
    <div class="section-h"><div><h2>${w.editing?'Edit client':'Onboard new client'}</h2><div class="sub">step ${w.step+1} of ${WIZARD_STEPS.length} · ${s.l}</div></div>
      <div class="actions"><button class="btn ghost" onclick="cancelWizard()">cancel</button></div>
    </div>
    <div class="wizard-steps">${WIZARD_STEPS.map((x,i)=>`<div class="wstep ${i<w.step?'done':''} ${i===w.step?'active':''}" onclick="gotoStep(${i})"><span class="n">${i+1}</span>${esc(x.l)}</div>`).join('')}</div>
    <div class="wizard-body" id="wbody">${renderWizardStep()}</div>
    <div class="wizard-foot">
      <button class="btn ghost" onclick="prevStep()" ${w.step===0?'disabled':''}>← back</button>
      ${w.step<WIZARD_STEPS.length-1?`<button class="btn primary" onclick="nextStep()">next →</button>`:`<button class="btn primary" onclick="commitWizard()">${w.editing?'save changes':'commit onboarding'}</button>`}
    </div>
  </div>`;
}
function gotoStep(i){captureStep();state.ui.wizard.step=i;render()}
function prevStep(){captureStep();if(state.ui.wizard.step>0)state.ui.wizard.step--;render()}
function nextStep(){if(!captureStep())return;if(state.ui.wizard.step<WIZARD_STEPS.length-1)state.ui.wizard.step++;render()}
function cancelWizard(){if(confirm('Discard onboarding in progress?')){state.ui.wizard=null;render()}}
function renderWizardStep(){
  const w=state.ui.wizard;const c=w.client;
  switch(WIZARD_STEPS[w.step].k){
    case 'type':return stepType(c);
    case 'identity':return stepIdentity(c);
    case 'contact':return stepContact(c);
    case 'beneficial':return stepBeneficial(c);
    case 'cdd':return stepCdd(c);
    case 'source':return stepSource(c);
    case 'pep':return stepPep(c);
    case 'vulnerability':return stepVulnerability(c);
    case 'documents':return stepDocuments(c);
    case 'risk':return stepRisk(c);
    case 'conflict':return stepConflict(c);
    case 'confirm':return stepConfirm(c);
  }
  return'';
}
function bindWizard(){
  const dz=$('#dz');
  if(dz){
    dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('hover')});
    dz.addEventListener('dragleave',()=>dz.classList.remove('hover'));
    dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('hover');handleDocFiles(e.dataTransfer.files)});
    dz.addEventListener('click',()=>$('#dzPicker').click());
  }
  const picker=$('#dzPicker');
  if(picker)picker.addEventListener('change',e=>handleDocFiles(e.target.files));
}
function stepType(c){
  return `<h3>Client type</h3><div class="step-sub">Drives which CDD evidence applies (individual vs entity vs trust).</div>
    <div class="field"><label>Client type <span class="req">*</span></label>
      <select id="w_ctype">${CLIENT_TYPES.map(t=>`<option value="${t.v}" ${c.clientType===t.v?'selected':''}>${t.l}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Practice area for this retainer</label>
      <select id="w_parea">${PRACTICE_AREAS.map(p=>`<option ${c.kyc?.practiceArea===p?'selected':''}>${p}</option>`).join('')}</select>
      <div class="hint">Conveyancing and trust/company formation work always within MLR scope; pure litigation outside.</div>
    </div>
    <div class="field"><label>Scope of retainer</label><textarea id="w_rscope" rows="3" placeholder="e.g. Acting on the sale of 12 High St — completion only, not future tax planning.">${esc(c.kyc?.retainerScope||'')}</textarea></div>
    <div class="field"><label>Retainer limits / exclusions</label><textarea id="w_rlim" rows="2" placeholder="e.g. Does not include capital gains tax advice.">${esc(c.kyc?.retainerLimits||'')}</textarea></div>`;
}
function stepIdentity(c){
  const isEntity=['limited-company','llp','partnership','charity','trust','public-body'].includes(c.clientType);
  if(isEntity){
    const e=c.entity||{};
    return `<h3>Entity identity</h3><div class="step-sub">For company / LLP / partnership / trust / charity. Verify against Companies House where applicable.</div>
      <div class="row">
        <div class="field"><label>Legal name <span class="req">*</span></label><input id="w_eName" value="${esc(e.legalName)}"></div>
        <div class="field"><label>Trading name</label><input id="w_eTrade" value="${esc(e.tradingName)}"></div>
      </div>
      <div class="row3">
        <div class="field"><label>Entity number</label><input id="w_eNum" value="${esc(e.entityNumber)}"><div class="hint">Companies House / Charity Commission / TRS ref</div></div>
        <div class="field"><label>Incorporation date</label><input id="w_eInc" type="date" value="${esc(e.incorporationDate)}"></div>
        <div class="field"><label>Jurisdiction (ISO-2)</label><input id="w_eJur" maxlength="2" value="${esc(e.jurisdiction||'GB')}"></div>
      </div>
      <div class="field"><label>SIC code (if Ltd)</label><input id="w_eSic" value="${esc(e.sicCode)}"></div>
      <h3 style="font-family:var(--serif);font-size:14px;margin:14px 0 10px;color:var(--brass)">Registered office</h3>
      <div class="row">
        <div class="field"><label>Line 1</label><input id="w_eA1" value="${esc(e.registeredOffice?.line1||'')}"></div>
        <div class="field"><label>Line 2</label><input id="w_eA2" value="${esc(e.registeredOffice?.line2||'')}"></div>
      </div>
      <div class="row3">
        <div class="field"><label>City</label><input id="w_eCity" value="${esc(e.registeredOffice?.city||'')}"></div>
        <div class="field"><label>Postcode</label><input id="w_ePc" value="${esc(e.registeredOffice?.postcode||'')}"></div>
        <div class="field"><label>Country</label><input id="w_eCountry" value="${esc(e.registeredOffice?.country||'GB')}"></div>
      </div>
      <div class="banner info">For an entity client you'll also identify a <strong>natural-person authorised signatory</strong> on the Contact step, and capture <strong>beneficial owners ≥25%</strong> on the BO/PSC step.</div>`;
  }
  const i=c.individual||{};
  return `<h3>Individual identity</h3><div class="step-sub">Per LSAG §6 — full name, DOB, nationality, tax IDs. Two-source rule on next steps.</div>
    <div class="row3">
      <div class="field"><label>Title</label><select id="w_title">${['Mr','Mrs','Ms','Miss','Mx','Dr','Other'].map(x=>`<option ${i.title===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>First name <span class="req">*</span></label><input id="w_first" value="${esc(i.firstName)}"></div>
      <div class="field"><label>Last name <span class="req">*</span></label><input id="w_last" value="${esc(i.lastName)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Middle name(s)</label><input id="w_mid" value="${esc(i.middleName)}"></div>
      <div class="field"><label>Preferred name</label><input id="w_pref" value="${esc(i.preferredName)}"></div>
    </div>
    <div class="row3">
      <div class="field"><label>DOB <span class="req">*</span></label><input id="w_dob" type="date" value="${esc(i.dob)}"></div>
      <div class="field"><label>Nationality (ISO-2)</label><input id="w_nat" maxlength="2" value="${esc(i.nationality||'GB')}"></div>
      <div class="field"><label>Country of residence</label><input id="w_cor" maxlength="2" value="${esc(i.countryOfResidence||'GB')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>NINO</label><input id="w_nino" value="${esc(i.nino)}" placeholder="AB 12 34 56 C"></div>
      <div class="field"><label>UTR</label><input id="w_utr" value="${esc(i.utr)}" placeholder="10 digits"></div>
    </div>
    <div class="field"><label>Gender (optional)</label><input id="w_gender" value="${esc(i.gender)}"></div>`;
}
function stepContact(c){
  const a=c.address||{};
  const isEntity=['limited-company','llp','partnership','charity','trust','public-body'].includes(c.clientType);
  return `<h3>Contact ${isEntity?'· authorised signatory + correspondence':''}</h3><div class="step-sub">${isEntity?'Capture the natural-person contact for this entity (instructing officer / trustee / signatory).':'Current address from last 3 months proof — passport + utility bill cover the two-source rule.'}</div>
    <div class="row">
      <div class="field"><label>Email <span class="req">*</span></label><input id="w_email" type="email" value="${esc(c.email)}"></div>
      <div class="field"><label>Phone</label><input id="w_phone" value="${esc(c.phone)}" placeholder="+44 7700 900000"></div>
    </div>
    <h3 style="font-family:var(--serif);font-size:14px;margin:14px 0 10px;color:var(--brass)">Correspondence address</h3>
    <div class="row">
      <div class="field"><label>Line 1</label><input id="w_a1" value="${esc(a.line1||'')}"></div>
      <div class="field"><label>Line 2</label><input id="w_a2" value="${esc(a.line2||'')}"></div>
    </div>
    <div class="row3">
      <div class="field"><label>City</label><input id="w_city" value="${esc(a.city||'')}"></div>
      <div class="field"><label>Postcode</label><input id="w_pc" value="${esc(a.postcode||'')}"></div>
      <div class="field"><label>Region</label><select id="w_region">${['England','Wales','Scotland','Northern Ireland','Other'].map(x=>`<option ${(a.region||'England')===x?'selected':''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Country (ISO-2)</label><input id="w_country" maxlength="2" value="${esc(a.country||'GB')}"></div>
      <div class="field"><label>At this address since</label><input id="w_since" type="date" value="${esc(a.since||'')}"></div>
    </div>
    <h3 style="font-family:var(--serif);font-size:14px;margin:14px 0 10px;color:var(--brass)">Address history <span class="help-pill" title="LSAG §6: address history covering past 3 years where current is recent">3 yrs ?</span></h3>
    <div id="w_history">${(c.addressHistory||[]).map((h,i)=>`<div class="row3" style="align-items:end">
      <div class="field"><label>From</label><input class="hist-from" data-i="${i}" type="date" value="${esc(h.from||'')}"></div>
      <div class="field"><label>To</label><input class="hist-to" data-i="${i}" type="date" value="${esc(h.to||'')}"></div>
      <div class="field"><label>Address</label><input class="hist-addr" data-i="${i}" value="${esc(h.address||'')}"></div>
    </div>`).join('')}</div>
    <button class="btn sm ghost" type="button" onclick="addHistRow()">+ add prior address</button>`;
}
function stepBeneficial(c){
  const isEntity=['limited-company','llp','partnership','charity','trust'].includes(c.clientType);
  if(!isEntity){
    return `<h3>Beneficial ownership / PSC</h3><div class="step-sub">Not applicable for individuals or sole traders. Skip to next.</div>
      <div class="banner info">For individual / sole-trader clients there are no beneficial-owner declarations required under MLR 2017 reg.5-7. Continue to CDD core.</div>`;
  }
  const bos=c.kyc?.cdd?.beneficialOwners||[];
  const pscs=c.kyc?.cdd?.psc||[];
  return `<h3>Beneficial owners + PSC</h3><div class="step-sub">All natural persons holding &gt;25% shares/votes/control OR otherwise exercising significant influence (MLR 2017 reg.5-7).</div>
    <div class="banner info">Verify against <a href="https://find-and-update.company-information.service.gov.uk/" target="_blank" rel="noopener">Companies House PSC</a> register and (for trusts) <a href="https://www.gov.uk/guidance/register-a-trust-as-a-trustee" target="_blank" rel="noopener">Trust Registration Service</a>. Discrepancies between client declaration and PSC are red flags.</div>
    <h3 style="font-family:var(--serif);font-size:14px;margin:14px 0 10px;color:var(--brass)">Beneficial owners</h3>
    <div id="w_bos">${bos.map((b,i)=>boRow(b,i)).join('')}</div>
    <button class="btn sm ghost" type="button" onclick="addBoRow()">+ add beneficial owner</button>
    <h3 style="font-family:var(--serif);font-size:14px;margin:18px 0 10px;color:var(--brass)">Persons with Significant Control (PSC)</h3>
    <div id="w_pscs">${pscs.map((p,i)=>pscRow(p,i)).join('')}</div>
    <button class="btn sm ghost" type="button" onclick="addPscRow()">+ add PSC</button>`;
}
function boRow(b,i){
  return `<div class="bo-row" data-bo="${i}">
    <div class="field"><label>Name</label><input class="bo-name" data-i="${i}" value="${esc(b.name||'')}"></div>
    <div class="field"><label>% ownership</label><input class="bo-pct" data-i="${i}" type="number" min="0" max="100" value="${b.percentage||25}"></div>
    <div class="field"><label>Nature of control</label><input class="bo-ctl" data-i="${i}" value="${esc(b.controlNotes||'')}" placeholder="e.g. ordinary shares voting"></div>
    <button class="btn sm danger" type="button" onclick="rmBoRow(${i})">×</button>
  </div>`;
}
function pscRow(p,i){
  return `<div class="bo-row" data-psc="${i}">
    <div class="field"><label>Name</label><input class="psc-name" data-i="${i}" value="${esc(p.name||'')}"></div>
    <div class="field"><label>Band</label><select class="psc-band" data-i="${i}">${['25-50%','50-75%','75-100%','other-control'].map(x=>`<option ${p.band===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label>Notified date</label><input class="psc-date" data-i="${i}" type="date" value="${esc(p.notifiedDate||'')}"></div>
    <button class="btn sm danger" type="button" onclick="rmPscRow(${i})">×</button>
  </div>`;
}
function addBoRow(){captureStep();state.ui.wizard.client.kyc.cdd.beneficialOwners.push({name:'',percentage:25,controlNotes:''});render()}
function addPscRow(){captureStep();state.ui.wizard.client.kyc.cdd.psc.push({name:'',band:'25-50%',notifiedDate:''});render()}
function rmBoRow(i){captureStep();state.ui.wizard.client.kyc.cdd.beneficialOwners.splice(i,1);render()}
function rmPscRow(i){captureStep();state.ui.wizard.client.kyc.cdd.psc.splice(i,1);render()}
function addHistRow(){captureStep();state.ui.wizard.client.addressHistory.push({from:'',to:'',address:''});render()}
function stepCdd(c){
  const cd=c.kyc?.cdd||{};
  return `<h3>CDD core · identity + address verification</h3><div class="step-sub">Two-source rule: identity + address verified from <strong>different</strong> sources. Record who verified, when, and method (MLR 2017 reg.28).</div>
    <div class="card" style="background:var(--ink);padding:14px;margin-bottom:14px">
      <div style="font-family:var(--mono);font-size:11px;color:var(--brass);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Identity verification</div>
      <div class="row">
        <div class="field"><label>Method</label><select id="w_idMethod">${[['','—'],['passport','Passport'],['drivinglicence','Driving licence'],['biometric-platform','Biometric platform (Onfido / iProov)'],['electronic-verification','Electronic verification (Experian / GBG / LexisNexis)']].map(([v,l])=>`<option value="${v}" ${cd.identityVerifiedMethod===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Verified by</label><select id="w_idBy"><option value="">—</option>${state.advisers.filter(a=>!a.archivedAt).map(a=>`<option value="${a.id}" ${cd.identityVerifiedBy===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
      </div>
      <button class="btn sm" type="button" onclick="markIdNow()">mark verified now</button>
      ${cd.identityVerifiedAt?`<div class="hint">Last verified: ${esc(fmtDateTime(cd.identityVerifiedAt))}</div>`:''}
    </div>
    <div class="card" style="background:var(--ink);padding:14px">
      <div style="font-family:var(--mono);font-size:11px;color:var(--brass);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Address verification</div>
      <div class="row">
        <div class="field"><label>Method</label><select id="w_adMethod">${[['','—'],['utility','Utility bill (last 3 months)'],['bank-statement','Bank statement (last 3 months)'],['electronic','Electronic match (Experian / GBG)']].map(([v,l])=>`<option value="${v}" ${cd.addressVerifiedMethod===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Verified by</label><select id="w_adBy"><option value="">—</option>${state.advisers.filter(a=>!a.archivedAt).map(a=>`<option value="${a.id}" ${cd.addressVerifiedBy===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
      </div>
      <button class="btn sm" type="button" onclick="markAdNow()">mark verified now</button>
      ${cd.addressVerifiedAt?`<div class="hint">Last verified: ${esc(fmtDateTime(cd.addressVerifiedAt))}</div>`:''}
    </div>`;
}
function markIdNow(){captureStep();const c=state.ui.wizard.client;c.kyc.cdd.identityVerifiedAt=now();if(!c.kyc.cdd.identityVerifiedBy)c.kyc.cdd.identityVerifiedBy=state.advisers[0]?.id||'';render()}
function markAdNow(){captureStep();const c=state.ui.wizard.client;c.kyc.cdd.addressVerifiedAt=now();if(!c.kyc.cdd.addressVerifiedBy)c.kyc.cdd.addressVerifiedBy=state.advisers[0]?.id||'';render()}
function stepSource(c){
  const k=c.kyc||{};const cd=k.cdd||{};
  const sources=[['','—'],['earnings','Earnings (PAYE / self-employed)'],['savings','Savings'],['inheritance','Inheritance'],['property-sale','Property sale'],['business-sale','Business sale'],['gift','Gift'],['matter-proceeds','Proceeds of matter (settlement / award)'],['other','Other']];
  return `<h3>Source of funds &amp; source of wealth</h3><div class="step-sub">SoF = money for <strong>this matter</strong>. SoW = lifetime accumulation. EDD requires both with documentary corroboration.</div>
    <div class="grid-2">
      <div>
        <div class="field"><label>Source of funds for this matter</label><select id="w_sofMatter">${sources.map(([v,l])=>`<option value="${v}" ${cd.sourceOfFundsForMatter===v?'selected':''}>${l}</option>`).join('')}</select><div class="hint">Per-matter, drill-able (LSAG §6.14).</div></div>
        <div class="field"><label>Source of funds (general)</label><select id="w_sof">${sources.map(([v,l])=>`<option value="${v}" ${k.sourceOfFunds===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>SoF notes &amp; evidence</label><textarea id="w_sofn" rows="5">${esc(k.sourceOfFundsNotes)}</textarea><div class="hint">Be concrete: amount, date, counterparty, document held.</div></div>
      </div>
      <div>
        <div class="field"><label>Source of wealth</label><select id="w_sow">${sources.map(([v,l])=>`<option value="${v}" ${k.sourceOfWealth===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>SoW notes &amp; evidence</label><textarea id="w_sown" rows="6">${esc(k.sourceOfWealthNotes)}</textarea><div class="hint">Lifetime accumulation: career, inheritances, business exits.</div></div>
      </div>
    </div>`;
}
function stepPep(c){
  const k=c.kyc||{};
  return `<h3>PEP &amp; sanctions screen</h3><div class="step-sub">PEP per MLR 2017 reg.35 · sanctions screen against OFSI Consolidated List.</div>
    <div class="card" style="margin-bottom:14px;padding:14px;background:var(--ink)">
      <label style="font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--brass)"><input type="checkbox" id="w_pep" ${k.pepFlag?'checked':''}> Client is a Politically Exposed Person (PEP) — or family / known close associate</label>
      <div class="field" style="margin-top:10px"><label>PEP details (role, jurisdiction, dates, domestic/foreign)</label><textarea id="w_pepd" rows="3">${esc(k.pepDetails)}</textarea></div>
    </div>
    <div class="card" style="padding:14px;background:var(--ink)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px">
        <div style="font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--brass)">Sanctions screening</div>
        <a href="https://sanctionssearch.ofsi.hmtreasury.gov.uk/" target="_blank" rel="noopener" class="btn sm">↗ open OFSI search</a>
      </div>
      <div class="row">
        <div class="field"><label>Status</label><select id="w_sancS">${[['not-checked','Not checked'],['clear','Clear · no match'],['match','MATCH · file SAR + freeze'],['review','Review needed']].map(([v,l])=>`<option value="${v}" ${k.sanctionsStatus===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Checked by</label><select id="w_sancBy"><option value="">—</option>${state.advisers.filter(a=>!a.archivedAt).map(a=>`<option value="${a.id}" ${k.sanctionsCheckedBy===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
      </div>
      <button class="btn sm" type="button" onclick="markSancNow()">mark as checked now</button>
      ${k.sanctionsCheckedAt?`<div class="hint">Last check: ${esc(fmtDateTime(k.sanctionsCheckedAt))}</div>`:''}
    </div>`;
}
function markSancNow(){captureStep();const c=state.ui.wizard.client;c.kyc.sanctionsCheckedAt=now();if(!c.kyc.sanctionsCheckedBy)c.kyc.sanctionsCheckedBy=state.advisers[0]?.id||'';if(c.kyc.sanctionsStatus==='not-checked')c.kyc.sanctionsStatus='clear';render()}
function stepVulnerability(c){
  const k=c.kyc||{};
  return `<h3>Vulnerable client assessment <span class="help-pill" title="SRA Principle 6 + Equality Act 2010 + Consumer Duty equivalents">SRA + EA10 ?</span></h3><div class="step-sub">Equality Act 2010 anticipatory duty (s.20) + SRA Principle 6 + Code 3.4. Four drivers mirror FCA FG21/1.</div>
    <div class="card" style="background:var(--ink);padding:14px">
      <label style="font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--brass)"><input type="checkbox" id="w_vuln" ${k.vulnerableCustomerFlag?'checked':''}> Client shows characteristics of vulnerability</label>
      <div class="row" style="margin-top:12px">
        <div class="field"><label>Primary category</label><select id="w_vc"><option value="">—</option>${[['health','Health'],['life-event','Life event (bereavement, divorce, etc.)'],['resilience','Resilience (financial)'],['capability','Capability (literacy, digital, English, neurodivergence)']].map(([v,l])=>`<option value="${v}" ${k.vulnerabilityCategory===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Type</label><select id="w_vt">${['permanent','temporary','fluctuating'].map(x=>`<option ${k.vulnerabilityType===x?'selected':''}>${x}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Notes &amp; reasonable adjustments made</label><textarea id="w_vn" rows="4">${esc(k.vulnerabilityNotes)}</textarea><div class="hint">e.g. "Recent bereavement — communications by phone + 7-day cool-off on irrevocable decisions. Large-print client care letter sent."</div></div>
    </div>`;
}
function stepDocuments(c){
  const k=c.kyc||{};const docs=k.documentsHeld||[];
  return `<h3>Document capture</h3><div class="step-sub">Drag &amp; drop — files stored locally in IDB as Blobs. SHA-256 hash recorded. Expiry computed per type.</div>
    <div class="row">
      <div class="field" style="grid-column:1 / span 2"><label>Document type for next upload</label>
        <select id="w_dtype">${DOC_TYPES.map(d=>`<option value="${d.v}">${d.l}</option>`).join('')}</select>
      </div>
    </div>
    <div class="dz" id="dz">
      <div class="icon">⬆</div>
      <div class="label">Drop files here or click to choose</div>
      <input type="file" id="dzPicker" hidden multiple accept="image/*,.pdf,.jpg,.jpeg,.png,.gif,.webp">
    </div>
    <div class="doc-list">
    ${docs.length===0?'<div class="hint" style="text-align:center;margin-top:12px">No documents yet. Capture: passport, driving licence, utility bill, bank statement, company incorp cert, certified PSC list.</div>':docs.map((d,i)=>`<div class="doc-row">
      <div class="dtype">${esc(d.type)}</div>
      <div class="dname">${esc(d.filename)}</div>
      <div class="dmeta">${bytes(d.size||0)} · ${esc(fmtDate(d.capturedAt))}${d.expiresAt?' · exp '+esc(fmtDate(d.expiresAt)):''}</div>
      <div class="dhash" title="${esc(d.sha256)}">${esc((d.sha256||'').slice(0,12))}…</div>
      <button class="btn sm" onclick="dlDoc('${d.blobRef}')">download</button>
      <button class="btn sm danger" onclick="rmDoc(${i})">×</button>
    </div>`).join('')}
    </div>`;
}
async function handleDocFiles(files){
  if(!files||!files.length)return;
  captureStep();
  const c=state.ui.wizard.client;
  const dtype=$('#w_dtype').value||'other';
  for(const f of files){
    if(f.size>25*1024*1024){toast(f.name+': over 25MB skipped');continue}
    const ref=await storeDocument(f,c.id,dtype);
    c.kyc.documentsHeld.push(ref);
  }
  toast(files.length+' file'+(files.length===1?'':'s')+' captured');
  render();
}
function dlDoc(id){downloadDocument(id)}
async function rmDoc(i){
  captureStep();
  const c=state.ui.wizard.client;
  const d=c.kyc.documentsHeld[i];if(!d)return;
  if(!confirm('Remove '+d.filename+'?'))return;
  await deleteDocument(d.blobRef);
  c.kyc.documentsHeld.splice(i,1);
  render();
}
function stepRisk(c){
  const sug=suggestRiskGrade(c);const k=c.kyc;
  return `<h3>AML risk grade</h3><div class="step-sub">Auto-suggestion based on PEP, sanctions, jurisdiction, source of funds, structure complexity. <strong>Adviser MUST confirm or override.</strong> High = EDD required.</div>
    <div class="banner ${sug.grade==='high'?'danger':(sug.grade==='enhanced'?'warn':'success')}">
      <strong>Suggested grade:</strong> <span class="tag ${riskColor(sug.grade)}">${sug.grade.toUpperCase()}</span> · score ${sug.score}
      <ul style="margin:8px 0 0 18px;font-size:11px;font-family:var(--mono);color:var(--cream-dim)">
      ${sug.reasons.length?sug.reasons.map(r=>'<li>'+esc(r)+'</li>').join(''):'<li>No risk indicators triggered (base = standard)</li>'}
      </ul>
    </div>
    <div class="row">
      <div class="field"><label>Final risk grade <span class="req">*</span></label><select id="w_risk">${['standard','enhanced','high'].map(x=>`<option ${k.riskGrade===x?'selected':''}>${x}</option>`).join('')}</select><div class="hint">Review cadence: standard=365d · enhanced=180d · high=90d</div></div>
      <div class="field"><label>CDD status</label><select id="w_kstatus">${['pending','verified','review','failed'].map(x=>`<option ${k.status===x?'selected':''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Responsible solicitor</label><select id="w_adv">${state.advisers.filter(a=>!a.archivedAt).map(a=>`<option value="${a.id}" ${c.adviserId===a.id?'selected':''}>${esc(a.name)} · ${esc(a.smcrRole)}</option>`).join('')}</select></div>
      <div class="field"><label>Engagement type</label><select id="w_etype">${['ongoing','one-off','transactional'].map(x=>`<option ${c.engagement?.type===x?'selected':''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Fee basis</label><select id="w_fbasis">${['hourly','fixed','conditional','damages-based','legal-aid'].map(x=>`<option ${c.engagement?.feeBasis===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Initial / hourly fee (£)</label><input id="w_initFee" type="number" min="0" value="${c.engagement?.initialFee||0}"></div>
    </div>`;
}
function stepConflict(c){
  const w=state.ui.wizard;
  const subjectName=displayName(c);
  const hits=w.conflictHits;
  return `<h3>Conflict-of-interest check</h3><div class="step-sub">Scans local IDB + broadcasts on <code>fall-law</code> to sibling tools (falllegal, falllegalpaper, falllegalpractice). SRA Code 6.1-6.5.</div>
    <div class="banner info">Subject: <strong>${esc(subjectName)}</strong> · clientType ${esc(c.clientType)}. Add an opposing party / counterparty name below to widen the scan.</div>
    <div class="row">
      <div class="field"><label>Opposing party / counterparty (optional)</label><input id="w_oppParty" value="${esc(w.opposingParty||'')}" placeholder="e.g. ABC Ltd, John Smith"></div>
      <div class="field" style="display:flex;align-items:end"><button class="btn primary" type="button" onclick="runConflictNow()">run conflict check</button></div>
    </div>
    ${hits===null?'<div class="hint">No check run yet. Click <strong>run conflict check</strong> above. Aggregation window is 1 second.</div>':(
      hits.length===0?'<div class="banner success">No conflicts identified · local IDB + broadcast aggregate clear.</div>':`<div class="banner danger"><strong>${hits.length} possible conflict${hits.length===1?'':'s'} identified.</strong> Review below and record resolution before committing.</div>
      <div class="conflict-hits">${hits.map(h=>`<div class="conflict-hit">
        <div class="ch-src">source: ${esc(h.source||'?')} · matched on: ${esc(h.matchedOn||'name')}</div>
        <div class="ch-name">${esc(h.name)}</div>
        <div class="ch-note">${esc(h.note||'')}</div>
      </div>`).join('')}</div>`
    )}
    <div class="row" style="margin-top:14px">
      <div class="field"><label>Resolution</label><select id="w_conflRes">${[['pending','Pending / not yet resolved'],['clear','Clear · no conflict'],['conflict-identified','Conflict identified · cannot act'],['conflict-waived','Conflict identified · informed written consent obtained (SCC 6.2)'],['withdrawn','Withdrew from acting']].map(([v,l])=>`<option value="${v}" ${w.conflictResolution===v?'selected':''}>${l}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Resolution notes</label><textarea id="w_conflNotes" rows="3" placeholder="e.g. 'Two clients have substantially common interest under SCC 6.2(a). Both signed informed consent letter dated [date]; consent stored at /matter-files/[ref]/consent.pdf. Confidentiality protected by team separation.'">${esc(w.conflictNotes)}</textarea></div>`;
}
async function runConflictNow(){
  captureStep();
  const w=state.ui.wizard;
  const subjectName=displayName(w.client);
  const opp=$('#w_oppParty')?.value?.trim()||'';
  w.opposingParty=opp;
  toast('Scanning local + broadcasting on fall-law…');
  const hits=await runConflictCheck(subjectName,opp);
  w.conflictHits=hits;
  render();
}
function stepConfirm(c){
  const sug=suggestRiskGrade(c);
  const docs=c.kyc?.documentsHeld||[];
  const w=state.ui.wizard;
  const issues=[];
  if(c.clientType==='individual'||c.clientType==='sole-trader'){
    if(!c.individual?.firstName||!c.individual?.lastName)issues.push('Individual name missing');
    if(!c.individual?.dob)issues.push('DOB missing');
  } else {
    if(!c.entity?.legalName)issues.push('Entity legal name missing');
  }
  if(!c.email)issues.push('Email missing');
  if(!c.address?.line1||!c.address?.postcode)issues.push('Address incomplete');
  if(c.kyc?.sanctionsStatus==='not-checked')issues.push('Sanctions not checked');
  if(docs.length===0)issues.push('No documents captured');
  if(!c.kyc?.sourceOfFunds&&!c.kyc?.cdd?.sourceOfFundsForMatter)issues.push('Source of funds not stated');
  if(!c.kyc?.cdd?.identityVerifiedAt)issues.push('Identity verification not marked');
  if(w.conflictHits===null)issues.push('Conflict check not run');
  if(w.conflictResolution==='pending'&&w.conflictHits&&w.conflictHits.length>0)issues.push('Conflict hits present but resolution pending');
  const adv=state.advisers.find(a=>a.id===c.adviserId);
  return `<h3>Confirm &amp; commit</h3><div class="step-sub">On commit: writes to IDB, broadcasts on fall-law + fall-client, appends audit chain entry, records conflict register entry.</div>
    ${issues.length?`<div class="banner warn"><strong>${issues.length} item${issues.length===1?'':'s'} to address:</strong><ul style="margin:6px 0 0 18px">${issues.map(i=>'<li>'+esc(i)+'</li>').join('')}</ul>You can still commit, but the record will be flagged incomplete.</div>`:'<div class="banner success">All required fields complete.</div>'}
    <div class="grid-2">
      <div class="card">
        <h3>Identity</h3>
        <div class="kpi"><span class="l">Type</span><span class="v">${esc(c.clientType)}</span></div>
        <div class="kpi"><span class="l">Name</span><span class="v">${esc(displayName(c))}</span></div>
        ${c.clientType==='individual'||c.clientType==='sole-trader'?`<div class="kpi"><span class="l">DOB</span><span class="v">${esc(fmtDate(c.individual?.dob?new Date(c.individual.dob):null))}${ageYears(c.individual?.dob)!=null?' (age '+ageYears(c.individual.dob)+')':''}</span></div><div class="kpi"><span class="l">Nationality</span><span class="v">${esc(c.individual?.nationality||'—')}</span></div>`:`<div class="kpi"><span class="l">Entity no</span><span class="v">${esc(c.entity?.entityNumber||'—')}</span></div><div class="kpi"><span class="l">Jurisdiction</span><span class="v">${esc(c.entity?.jurisdiction||'—')}</span></div>`}
      </div>
      <div class="card">
        <h3>Contact</h3>
        <div class="kpi"><span class="l">Email</span><span class="v">${esc(c.email||'—')}</span></div>
        <div class="kpi"><span class="l">Phone</span><span class="v">${esc(c.phone||'—')}</span></div>
        <div class="kpi"><span class="l">Address</span><span class="v">${esc(c.address?.line1||'')} ${esc(c.address?.postcode||'')}</span></div>
      </div>
      <div class="card">
        <h3>CDD / AML</h3>
        <div class="kpi"><span class="l">ID method</span><span class="v">${esc(c.kyc?.cdd?.identityVerifiedMethod||'—')}</span></div>
        <div class="kpi"><span class="l">Address method</span><span class="v">${esc(c.kyc?.cdd?.addressVerifiedMethod||'—')}</span></div>
        <div class="kpi"><span class="l">PEP</span><span class="v ${c.kyc?.pepFlag?'red':'green'}">${c.kyc?.pepFlag?'YES':'no'}</span></div>
        <div class="kpi"><span class="l">Sanctions</span><span class="v">${esc(c.kyc?.sanctionsStatus)}</span></div>
        <div class="kpi"><span class="l">Vulnerable</span><span class="v ${c.kyc?.vulnerableCustomerFlag?'amber':''}">${c.kyc?.vulnerableCustomerFlag?'YES · '+esc(c.kyc?.vulnerabilityCategory||''):'no'}</span></div>
        <div class="kpi"><span class="l">SoF (matter)</span><span class="v">${esc(c.kyc?.cdd?.sourceOfFundsForMatter||c.kyc?.sourceOfFunds||'—')}</span></div>
        <div class="kpi"><span class="l">Risk grade</span><span class="v ${riskColor(c.kyc?.riskGrade)==='red'?'red':(riskColor(c.kyc?.riskGrade)==='amber'?'amber':'green')}">${esc((c.kyc?.riskGrade||'standard').toUpperCase())} ${sug.grade!==c.kyc?.riskGrade?'(suggested '+sug.grade+')':''}</span></div>
        <div class="kpi"><span class="l">Documents</span><span class="v">${docs.length}</span></div>
        <div class="kpi"><span class="l">Beneficial owners</span><span class="v">${(c.kyc?.cdd?.beneficialOwners||[]).length}</span></div>
        <div class="kpi"><span class="l">PSC entries</span><span class="v">${(c.kyc?.cdd?.psc||[]).length}</span></div>
      </div>
      <div class="card">
        <h3>Adviser &amp; conflict</h3>
        <div class="kpi"><span class="l">Responsible solicitor</span><span class="v">${esc(adv?.name||'unassigned')}</span></div>
        <div class="kpi"><span class="l">Engagement</span><span class="v">${esc(c.engagement?.type||'ongoing')}</span></div>
        <div class="kpi"><span class="l">Practice area</span><span class="v">${esc(c.kyc?.practiceArea||'—')}</span></div>
        <div class="kpi"><span class="l">Review cadence</span><span class="v">${REVIEW_CADENCE[c.kyc?.riskGrade||'standard']} days</span></div>
        <div class="kpi"><span class="l">Conflict check</span><span class="v">${w.conflictHits===null?'—':w.conflictHits.length+' hits'}</span></div>
        <div class="kpi"><span class="l">Conflict resolution</span><span class="v"><span class="tag ${conflictColor(w.conflictResolution)}">${esc(w.conflictResolution)}</span></span></div>
      </div>
    </div>`;
}
function captureStep(){
  const w=state.ui.wizard;if(!w)return true;
  const c=w.client;
  try{
    switch(WIZARD_STEPS[w.step].k){
      case 'type':
        c.clientType=$('#w_ctype')?.value||c.clientType;
        c.kyc.practiceArea=$('#w_parea')?.value||c.kyc.practiceArea;
        c.kyc.retainerScope=$('#w_rscope')?.value||'';
        c.kyc.retainerLimits=$('#w_rlim')?.value||'';
        break;
      case 'identity':
        if(['limited-company','llp','partnership','charity','trust','public-body'].includes(c.clientType)){
          if(!c.entity)c.entity={};
          c.entity.legalName=$('#w_eName')?.value?.trim()||'';
          c.entity.tradingName=$('#w_eTrade')?.value?.trim()||'';
          c.entity.entityNumber=$('#w_eNum')?.value?.trim()||'';
          c.entity.incorporationDate=$('#w_eInc')?.value||'';
          c.entity.jurisdiction=($('#w_eJur')?.value?.trim()||'GB').toUpperCase();
          c.entity.sicCode=$('#w_eSic')?.value?.trim()||'';
          c.entity.registeredOffice={line1:$('#w_eA1')?.value?.trim()||'',line2:$('#w_eA2')?.value?.trim()||'',city:$('#w_eCity')?.value?.trim()||'',postcode:($('#w_ePc')?.value?.trim()||'').toUpperCase(),country:($('#w_eCountry')?.value?.trim()||'GB').toUpperCase()};
        } else {
          if(!c.individual)c.individual={};
          c.individual.title=$('#w_title')?.value||c.individual.title;
          c.individual.firstName=$('#w_first')?.value?.trim()||'';
          c.individual.lastName=$('#w_last')?.value?.trim()||'';
          c.individual.middleName=$('#w_mid')?.value?.trim()||'';
          c.individual.preferredName=$('#w_pref')?.value?.trim()||'';
          c.individual.dob=$('#w_dob')?.value||'';
          c.individual.nationality=($('#w_nat')?.value?.trim()||'GB').toUpperCase();
          c.individual.countryOfResidence=($('#w_cor')?.value?.trim()||'GB').toUpperCase();
          c.individual.nino=$('#w_nino')?.value?.trim()||'';
          c.individual.utr=$('#w_utr')?.value?.trim()||'';
          c.individual.gender=$('#w_gender')?.value?.trim()||'';
        }
        break;
      case 'contact':
        c.email=$('#w_email')?.value?.trim()||'';
        c.phone=$('#w_phone')?.value?.trim()||'';
        c.address={line1:$('#w_a1')?.value?.trim()||'',line2:$('#w_a2')?.value?.trim()||'',city:$('#w_city')?.value?.trim()||'',postcode:($('#w_pc')?.value?.trim()||'').toUpperCase(),region:$('#w_region')?.value||'England',country:($('#w_country')?.value?.trim()||'GB').toUpperCase(),since:$('#w_since')?.value||''};
        const hf=$$('.hist-from'),ht=$$('.hist-to'),ha=$$('.hist-addr');
        c.addressHistory=hf.map((el,i)=>({from:el.value,to:ht[i]?.value||'',address:ha[i]?.value||''})).filter(h=>h.address||h.from||h.to);
        break;
      case 'beneficial':
        const bn=$$('.bo-name'),bp=$$('.bo-pct'),bc=$$('.bo-ctl');
        c.kyc.cdd.beneficialOwners=bn.map((el,i)=>({name:el.value.trim(),percentage:parseFloat(bp[i]?.value)||0,controlNotes:bc[i]?.value?.trim()||''})).filter(b=>b.name);
        const pn=$$('.psc-name'),pb=$$('.psc-band'),pd=$$('.psc-date');
        c.kyc.cdd.psc=pn.map((el,i)=>({name:el.value.trim(),band:pb[i]?.value||'25-50%',notifiedDate:pd[i]?.value||''})).filter(p=>p.name);
        break;
      case 'cdd':
        c.kyc.cdd.identityVerifiedMethod=$('#w_idMethod')?.value||'';
        c.kyc.cdd.identityVerifiedBy=$('#w_idBy')?.value||'';
        c.kyc.cdd.addressVerifiedMethod=$('#w_adMethod')?.value||'';
        c.kyc.cdd.addressVerifiedBy=$('#w_adBy')?.value||'';
        break;
      case 'source':
        c.kyc.cdd.sourceOfFundsForMatter=$('#w_sofMatter')?.value||'';
        c.kyc.sourceOfFunds=$('#w_sof')?.value||'';
        c.kyc.sourceOfFundsNotes=$('#w_sofn')?.value||'';
        c.kyc.sourceOfWealth=$('#w_sow')?.value||'';
        c.kyc.sourceOfWealthNotes=$('#w_sown')?.value||'';
        break;
      case 'pep':
        c.kyc.pepFlag=$('#w_pep')?.checked||false;
        c.kyc.pepDetails=$('#w_pepd')?.value||'';
        c.kyc.sanctionsStatus=$('#w_sancS')?.value||'not-checked';
        c.kyc.sanctionsCheckedBy=$('#w_sancBy')?.value||'';
        break;
      case 'vulnerability':
        c.kyc.vulnerableCustomerFlag=$('#w_vuln')?.checked||false;
        c.kyc.vulnerabilityCategory=$('#w_vc')?.value||'';
        c.kyc.vulnerabilityType=$('#w_vt')?.value||'permanent';
        c.kyc.vulnerabilityNotes=$('#w_vn')?.value||'';
        break;
      case 'documents':break;
      case 'risk':
        c.kyc.riskGrade=$('#w_risk')?.value||'standard';
        c.kyc.status=$('#w_kstatus')?.value||'pending';
        c.adviserId=$('#w_adv')?.value||c.adviserId;
        if(!c.engagement)c.engagement={};
        c.engagement.type=$('#w_etype')?.value||'ongoing';
        c.engagement.feeBasis=$('#w_fbasis')?.value||'hourly';
        c.engagement.initialFee=parseFloat($('#w_initFee')?.value)||0;
        break;
      case 'conflict':
        w.opposingParty=$('#w_oppParty')?.value?.trim()||'';
        w.conflictResolution=$('#w_conflRes')?.value||'pending';
        w.conflictNotes=$('#w_conflNotes')?.value||'';
        break;
      case 'confirm':break;
    }
  }catch(e){console.warn('captureStep error',e)}
  return true;
}
async function commitWizard(){
  captureStep();
  const w=state.ui.wizard;
  const c=w.client;
  // finalise risk + review dates
  const rd=computeReviewDates(c);c.kyc.lastReviewAt=rd.lastReviewAt;c.kyc.nextReviewDue=rd.nextReviewDue;
  // record conflict on client
  c.kyc.conflictStatus=w.conflictResolution||'pending';
  c.kyc.conflictCheckedAt=now();
  c.kyc.conflictCheckedBy=c.adviserId;
  c.kyc.conflictNotes=w.conflictNotes||'';
  c.app.onboardCompleted=true;
  // purge demo if first real
  if(!c.app.isDemo)await purgeDemoIfPresent();
  await saveClient(c,w.editing?'client.updated':'client.created',w.editing?'Onboarding wizard edit':'Onboarding wizard committed');
  // record conflict register entry
  if(w.conflictHits!==null){
    await recordConflictCheck({clientName:displayName(c),otherParty:w.opposingParty||'',scannedBy:c.adviserId,hits:w.conflictHits,resolution:w.conflictResolution,resolutionNotes:w.conflictNotes,clientId:c.id});
  }
  state.ui.wizard=null;
  state.ui.activeClient=c.id;
  toast(w.editing?'Saved · broadcast':'Client onboarded · broadcast');
  render();
}

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { TOOLNAME };
export { VERSION };
