(function () {
  'use strict';

  // ----------------------------------------------------------------------
  // Constants
  // ----------------------------------------------------------------------

  const PROTOCOL_TAG = 'QRT2';
  const MISSING_QR_TAG = 'QRTM'; // missing-range side-channel, distinct from data frames
  const STORAGE_KEY = 'qrtt.settings.v1';
  const LARGE_TRANSFER_BYTES = 2 * 1024 * 1024; // 2 MB confirm threshold

  const DEFAULT_SETTINGS = {
    chunkSize: 800,
    fps: 5,
    ecc: 'M',
    typeNumber: 0,
    cellSize: 8,
    margin: 4,
    facing: 'environment',
    resolution: 640,
    inversion: 'dontInvert',
  };

  // ----------------------------------------------------------------------
  // DOM
  // ----------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  const tabs = {
    send: $('tabSend'),
    recv: $('tabRecv'),
    settings: $('tabSettings'),
  };
  const panes = {
    send: $('paneSend'),
    recv: $('paneRecv'),
    settings: $('paneSettings'),
  };

  const sendInput = $('sendInput');
  const sendFile = $('sendFile');
  const sendFileInfo = $('sendFileInfo');
  const sendRepoUrl = $('sendRepoUrl');
  const sendRepoParsed = $('sendRepoParsed');
  const btnSendStart = $('btnSendStart');
  const btnSendStop = $('btnSendStop');
  const sendStatus = $('sendStatus');
  const qrCanvas = $('qrCanvas');
  const sendRange = $('sendRange');
  const btnRangeApply = $('btnRangeApply');
  const modeButtons = document.querySelectorAll('.mode-opt');
  const modePanels = document.querySelectorAll('[data-mode-panel]');

  const btnRecvStart = $('btnRecvStart');
  const btnRecvStop = $('btnRecvStop');
  const btnRecvReset = $('btnRecvReset');
  const cam = $('cam');
  const scanCanvas = $('scanCanvas');
  const recvProgress = $('recvProgress');
  const recvStatus = $('recvStatus');
  const recvGrid = $('recvGrid');
  const recvOutput = $('recvOutput');
  const recvResult = $('recvResult');
  const recvResultInfo = $('recvResultInfo');
  const recvTextField = $('recvTextField');
  const btnCopy = $('btnCopy');
  const btnDownload = $('btnDownload');
  const httpsWarn = $('httpsWarn');
  const recvMissingRow = $('recvMissingRow');
  const recvMissingList = $('recvMissingList');
  const btnCopyMissing = $('btnCopyMissing');
  const btnSpeakMissing = $('btnSpeakMissing');
  const btnListenRange = $('btnListenRange');
  const btnShowMissingQr = $('btnShowMissingQr');
  const btnScanRange = $('btnScanRange');
  const qrBridgeModal = $('qrBridgeModal');
  const qrBridgeStatus = $('qrBridgeStatus');
  const qrBridgeShowWrap = $('qrBridgeShowWrap');
  const qrBridgeCanvas = $('qrBridgeCanvas');
  const qrBridgeScanWrap = $('qrBridgeScanWrap');
  const qrBridgeVideo = $('qrBridgeVideo');
  const qrBridgeScanCanvas = $('qrBridgeScanCanvas');
  const btnQrBridgeClose = $('btnQrBridgeClose');

  const cfg = {
    chunkSize: $('cfgChunkSize'),
    fps: $('cfgFps'),
    ecc: $('cfgEcc'),
    type: $('cfgType'),
    cell: $('cfgCell'),
    margin: $('cfgMargin'),
    facing: $('cfgFacing'),
    resolution: $('cfgResolution'),
    inversion: $('cfgInversion'),
  };
  const out = {
    chunkSize: $('outChunkSize'),
    fps: $('outFps'),
    cell: $('outCell'),
    margin: $('outMargin'),
  };
  const btnResetSettings = $('btnResetSettings');

  // ----------------------------------------------------------------------
  // Settings: load / save / bind
  // ----------------------------------------------------------------------

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch { /* private mode etc. */ }
  }

  function populateTypeOptions() {
    for (let i = 1; i <= 40; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `固定 type ${i}`;
      cfg.type.appendChild(opt);
    }
  }

  function settingsFromInputs() {
    return {
      chunkSize: +cfg.chunkSize.value,
      fps: +cfg.fps.value,
      ecc: cfg.ecc.value,
      typeNumber: +cfg.type.value,
      cellSize: +cfg.cell.value,
      margin: +cfg.margin.value,
      facing: cfg.facing.value,
      resolution: +cfg.resolution.value,
      inversion: cfg.inversion.value,
    };
  }

  function applySettingsToInputs(s) {
    cfg.chunkSize.value = s.chunkSize;
    cfg.fps.value = s.fps;
    cfg.ecc.value = s.ecc;
    cfg.type.value = s.typeNumber;
    cfg.cell.value = s.cellSize;
    cfg.margin.value = s.margin;
    cfg.facing.value = s.facing;
    cfg.resolution.value = s.resolution;
    cfg.inversion.value = s.inversion;
    updateOutputs();
  }

  function updateOutputs() {
    out.chunkSize.textContent = cfg.chunkSize.value;
    out.fps.textContent = cfg.fps.value;
    out.cell.textContent = cfg.cell.value;
    out.margin.textContent = cfg.margin.value;
  }

  function bindSettings() {
    Object.values(cfg).forEach((el) => {
      el.addEventListener('input', () => {
        updateOutputs();
        saveSettings(settingsFromInputs());
      });
    });
    btnResetSettings.addEventListener('click', () => {
      applySettingsToInputs(DEFAULT_SETTINGS);
      saveSettings(DEFAULT_SETTINGS);
    });
  }

  // ----------------------------------------------------------------------
  // Tabs
  // ----------------------------------------------------------------------

  function activateTab(name) {
    for (const k of Object.keys(tabs)) {
      const isActive = k === name;
      tabs[k].classList.toggle('is-active', isActive);
      tabs[k].setAttribute('aria-selected', isActive ? 'true' : 'false');
      panes[k].classList.toggle('is-active', isActive);
      panes[k].hidden = !isActive;
    }
  }

  tabs.send.addEventListener('click', () => activateTab('send'));
  tabs.recv.addEventListener('click', () => activateTab('recv'));
  tabs.settings.addEventListener('click', () => activateTab('settings'));

  // ----------------------------------------------------------------------
  // Send mode switching
  // ----------------------------------------------------------------------

  function currentSendMode() {
    for (const b of modeButtons) if (b.classList.contains('is-active')) return b.dataset.mode;
    return 'text';
  }

  function applySendMode(mode) {
    for (const b of modeButtons) {
      const active = b.dataset.mode === mode;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    for (const p of modePanels) p.hidden = p.dataset.modePanel !== mode;
  }

  for (const b of modeButtons) {
    b.addEventListener('click', () => applySendMode(b.dataset.mode));
  }

  sendFile.addEventListener('change', () => {
    const f = sendFile.files && sendFile.files[0];
    sendFileInfo.textContent = f
      ? `${f.name} (${formatBytes(f.size)}${f.type ? ', ' + f.type : ''})`
      : 'ファイル未選択';
  });

  // Accepts:
  //   https://github.com/owner/repo[.git][/tree/<ref>[/...]]
  //   git@github.com:owner/repo[.git]
  //   owner/repo[@ref]
  function parseRepoSpec(input) {
    const s = (input || '').trim();
    if (!s) return null;
    let m = s.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    if (m) return { owner: m[1], repo: m[2], ref: '' };
    if (/^https?:\/\//i.test(s)) {
      let u;
      try { u = new URL(s); } catch { return null; }
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      if (host !== 'github.com') return null;
      const parts = u.pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
      if (parts.length < 2 || !parts[0] || !parts[1]) return null;
      const owner = decodeURIComponent(parts[0]);
      const repo = decodeURIComponent(parts[1]).replace(/\.git$/, '');
      let ref = '';
      if (parts.length > 3 && /^(tree|commit|blob)$/.test(parts[2])) {
        ref = parts.slice(3).map(decodeURIComponent).join('/');
      }
      return { owner, repo, ref };
    }
    m = s.match(/^([^/\s@]+)\/([^@\s]+?)(?:@(.+))?$/);
    if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: m[3] || '' };
    return null;
  }

  function updateRepoPreview() {
    const spec = parseRepoSpec(sendRepoUrl.value);
    if (!spec) {
      sendRepoParsed.textContent = sendRepoUrl.value
        ? '⚠ 解釈できませんでした。URL または owner/repo[@ref] を入力してください'
        : 'URL またはショート形式を貼り付けてください';
      sendRepoParsed.classList.toggle('warn-inline', !!sendRepoUrl.value);
      return;
    }
    sendRepoParsed.classList.remove('warn-inline');
    sendRepoParsed.textContent =
      `→ ${spec.owner}/${spec.repo}${spec.ref ? ' @ ' + spec.ref : ' (デフォルトブランチ)'}`;
  }

  sendRepoUrl.addEventListener('input', updateRepoPreview);

  // ----------------------------------------------------------------------
  // Byte / base64 helpers
  // ----------------------------------------------------------------------

  function bytesToBase64(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function buildBlobBytes(manifest, body) {
    const json = new TextEncoder().encode(JSON.stringify(manifest));
    const buf = new Uint8Array(4 + json.length + body.length);
    new DataView(buf.buffer).setUint32(0, json.length, true);
    buf.set(json, 4);
    buf.set(body, 4 + json.length);
    return buf;
  }

  function parseBlobBytes(bytes) {
    if (bytes.length < 4) throw new Error('データが短すぎます');
    const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
    if (len > bytes.length - 4) throw new Error('manifest長が不正です');
    const json = new TextDecoder().decode(bytes.subarray(4, 4 + len));
    let manifest;
    try { manifest = JSON.parse(json); } catch { throw new Error('manifestのJSONが壊れています'); }
    const body = bytes.subarray(4 + len);
    return { manifest, body };
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  // Parse "5,12,18-25" → sorted unique 0-based indices. Empty → null (= all).
  // Throws Error on bad syntax or out-of-range values.
  function parseFrameRange(input, total) {
    const s = (input || '').trim();
    if (!s) return null;
    const out = new Set();
    for (const part of s.split(/[,\s]+/).filter(Boolean)) {
      const m = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) throw new Error(`不正な範囲: "${part}"`);
      const a = +m[1];
      const b = m[2] ? +m[2] : a;
      if (a < 1 || b < 1 || a > total || b > total) {
        throw new Error(`範囲外: "${part}" (1〜${total})`);
      }
      if (a > b) throw new Error(`範囲が逆順: "${part}"`);
      for (let i = a; i <= b; i++) out.add(i - 1);
    }
    return Array.from(out).sort((x, y) => x - y);
  }

  // Format 0-based indices into compact 1-based range string: [0,1,2,5,8,9] → "1-3,6,9-10"
  function formatIndexRanges(indices) {
    if (!indices.length) return '';
    const sorted = [...indices].sort((a, b) => a - b);
    const out = [];
    let s = sorted[0], p = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const v = sorted[i];
      if (v === p + 1) { p = v; continue; }
      out.push(s === p ? `${s + 1}` : `${s + 1}-${p + 1}`);
      s = v; p = v;
    }
    out.push(s === p ? `${s + 1}` : `${s + 1}-${p + 1}`);
    return out.join(',');
  }

  function sanitizeFilename(name, fallback) {
    let s = (name || fallback || 'received.bin').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_');
    s = s.replace(/^\.+/, '_');
    if (s.length > 200) s = s.slice(0, 200);
    return s || fallback || 'received.bin';
  }

  // ----------------------------------------------------------------------
  // Chunk protocol (QRT2)
  // ----------------------------------------------------------------------

  function newSessionId() {
    return Math.random().toString(36).slice(2, 8);
  }

  function encodeFramesFromBytes(blobBytes, chunkSize) {
    const b64 = bytesToBase64(blobBytes);
    const total = Math.max(1, Math.ceil(b64.length / chunkSize));
    const sessionId = newSessionId();
    const frames = [];
    for (let i = 0; i < total; i++) {
      const payload = b64.slice(i * chunkSize, (i + 1) * chunkSize);
      frames.push(`${PROTOCOL_TAG}|${sessionId}|${i}|${total}|${payload}`);
    }
    return { frames, sessionId, total };
  }

  function parseFrame(text) {
    if (typeof text !== 'string' || !text.startsWith(PROTOCOL_TAG + '|')) return null;
    const head = text.indexOf('|');
    const a = text.indexOf('|', head + 1);
    const b = text.indexOf('|', a + 1);
    const c = text.indexOf('|', b + 1);
    if (a < 0 || b < 0 || c < 0) return null;
    const sessionId = text.slice(head + 1, a);
    const index = +text.slice(a + 1, b);
    const total = +text.slice(b + 1, c);
    const payload = text.slice(c + 1);
    if (!sessionId || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) return null;
    if (index < 0 || index >= total) return null;
    return { sessionId, index, total, payload };
  }

  // ----------------------------------------------------------------------
  // QR rendering (qrcode-generator)
  // ----------------------------------------------------------------------

  function drawQrToCanvas(canvas, text, opts) {
    const { typeNumber, ecc, cellSize, margin } = opts;
    const qr = qrcode(typeNumber, ecc);
    qr.addData(text, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    const size = count * cellSize + margin * 2;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(margin + c * cellSize, margin + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // Pick a single typeNumber covering the longest frame so every chunk
  // renders at the same QR size.
  function resolveTypeNumber(frames, ecc) {
    let longest = frames[0];
    for (const f of frames) if (f.length > longest.length) longest = f;
    const qr = qrcode(0, ecc);
    qr.addData(longest, 'Byte');
    qr.make();
    return (qr.getModuleCount() - 17) / 4;
  }

  // ----------------------------------------------------------------------
  // GitHub repo → zip (client-side packaging, avoids codeload.github.com
  // CORS by walking the Git Data API + raw.githubusercontent.com which
  // both serve Access-Control-Allow-Origin: *)
  // ----------------------------------------------------------------------

  async function fetchRepoAsZip(spec, onProgress) {
    const onP = onProgress || (() => {});
    const { owner, repo } = spec;
    let ref = spec.ref;

    if (!ref) {
      onP(`デフォルトブランチを確認中: ${owner}/${repo}…`);
      const info = await ghJson(`repos/${owner}/${repo}`);
      ref = info.default_branch;
      if (!ref) throw new Error('default_branch を取得できませんでした');
    }

    onP(`ツリー取得中: ${owner}/${repo}@${ref}…`);
    const tree = await ghJson(`repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    if (!tree || !Array.isArray(tree.tree)) throw new Error('tree レスポンスが不正');
    const blobs = tree.tree.filter((e) => e.type === 'blob');
    if (tree.truncated) {
      onP(`⚠ ツリーが大きすぎて切り詰められました (${blobs.length}件)。一部のみ取得します`);
    }
    if (blobs.length === 0) throw new Error('対象ファイルが見つかりません');

    const fetched = new Array(blobs.length);
    let done = 0;
    const CONCURRENCY = 8;
    let next = 0;
    async function worker() {
      while (true) {
        const i = next++;
        if (i >= blobs.length) return;
        const entry = blobs[i];
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${entry.path}: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        fetched[i] = { path: entry.path, bytes: new Uint8Array(buf) };
        done++;
        if (done % 5 === 0 || done === blobs.length) {
          onP(`ファイル取得中: ${done} / ${blobs.length} (${owner}/${repo}@${ref})`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, blobs.length) }, worker));

    onP(`zip 生成中 (${blobs.length}件)…`);
    const refSafe = ref.replace(/[^\w.-]/g, '_');
    const rootDir = `${owner}-${repo}-${refSafe}/`;
    const files = {};
    for (const f of fetched) {
      files[rootDir + f.path] = f.bytes;
    }
    const zipBytes = fflate.zipSync(files, { level: 6 });

    return {
      body: zipBytes,
      manifest: {
        kind: 'repo',
        name: `${owner}-${repo}-${refSafe}.zip`,
        mime: 'application/zip',
        owner, repo, ref,
      },
    };
  }

  async function ghJson(path) {
    const url = `https://api.github.com/${path}`;
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) {
      if (res.status === 403) throw new Error('GitHub API rate limit に達しました（未認証は60req/hour）');
      if (res.status === 404) throw new Error(`見つかりません: ${path}`);
      throw new Error(`GitHub API HTTP ${res.status}`);
    }
    return res.json();
  }

  // ----------------------------------------------------------------------
  // Send data gathering (per mode)
  // ----------------------------------------------------------------------

  async function gatherSendData(mode) {
    if (mode === 'text') {
      const text = sendInput.value;
      if (!text) throw new Error('テキストを入力してください');
      return {
        manifest: { kind: 'text', name: 'message.txt' },
        body: new TextEncoder().encode(text),
      };
    }
    if (mode === 'file') {
      const f = sendFile.files && sendFile.files[0];
      if (!f) throw new Error('ファイルを選択してください');
      const buf = await f.arrayBuffer();
      return {
        manifest: {
          kind: 'file',
          name: f.name,
          mime: f.type || 'application/octet-stream',
        },
        body: new Uint8Array(buf),
      };
    }
    if (mode === 'repo') {
      const spec = parseRepoSpec(sendRepoUrl.value);
      if (!spec) throw new Error('GitHub URL または owner/repo[@ref] を入力してください');
      const { body, manifest } = await fetchRepoAsZip(spec, (msg) => {
        sendStatus.textContent = msg;
      });
      return { manifest, body };
    }
    throw new Error(`不明なモード: ${mode}`);
  }

  function estimateSeconds(blobBytes, chunkSize, fps) {
    const b64Len = Math.ceil(blobBytes / 3) * 4;
    const totalFrames = Math.ceil(b64Len / chunkSize);
    return Math.max(1, Math.ceil(totalFrames / fps));
  }

  function formatDuration(sec) {
    if (sec < 60) return `${sec}秒`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}分${s}秒`;
  }

  // ----------------------------------------------------------------------
  // Send loop
  // ----------------------------------------------------------------------

  let sendTimer = null;
  let sendAllFrames = [];   // full frame string array (immutable per transfer)
  let sendActive = [];      // 0-based indices into sendAllFrames currently looping
  let sendIndex = 0;        // cursor within sendActive
  let sendRenderOpts = null;
  let sendTickMs = 500;
  let sendMeta = null;      // { kind, sizeLabel }
  let sendBusy = false;
  let wakeLock = null;

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) { /* 権限拒否やサポート外は黙って無視 */ }
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && sendBusy) {
      await acquireWakeLock();
    }
  });

  function clearSendTimer() {
    if (sendTimer) { clearInterval(sendTimer); sendTimer = null; }
  }

  function startSendLoop() {
    clearSendTimer();
    sendIndex = 0;
    if (!sendActive.length) {
      sendStatus.textContent = '送信対象がありません';
      return;
    }
    const tick = () => {
      const realIdx = sendActive[sendIndex];
      const frame = sendAllFrames[realIdx];
      try {
        drawQrToCanvas(qrCanvas, frame, sendRenderOpts);
      } catch (err) {
        sendStatus.textContent = `QR生成エラー: ${err.message}（typeNumber を上げるかチャンクサイズを下げてください）`;
        stopSend();
        return;
      }
      const total = sendAllFrames.length;
      const subsetLabel = sendActive.length === total
        ? ''
        : ` ｜ 範囲 ${sendActive.length}枚`;
      sendStatus.textContent =
        `[${sendMeta.kind}] ${realIdx + 1} / ${total}${subsetLabel} ｜ ${sendMeta.sizeLabel} ｜ loop`;
      sendIndex = (sendIndex + 1) % sendActive.length;
    };
    tick();
    sendTimer = setInterval(tick, sendTickMs);
  }

  // Read the user's range input, validate against sendAllFrames, update sendActive.
  // Returns true on success (caller should restart the loop).
  function applyRangeFromInput() {
    if (!sendAllFrames.length) return false;
    let indices;
    try {
      const parsed = parseFrameRange(sendRange.value, sendAllFrames.length);
      indices = parsed === null
        ? Array.from({ length: sendAllFrames.length }, (_, i) => i)
        : parsed;
    } catch (err) {
      sendStatus.textContent = `範囲指定エラー: ${err.message}`;
      return false;
    }
    sendActive = indices;
    return true;
  }

  async function startSend() {
    if (sendBusy) return;
    sendBusy = true;
    btnSendStart.disabled = true;
    const mode = currentSendMode();

    let gathered;
    try {
      gathered = await gatherSendData(mode);
    } catch (err) {
      sendStatus.textContent = `エラー: ${err.message}`;
      btnSendStart.disabled = false;
      sendBusy = false;
      return;
    }

    const s = settingsFromInputs();
    const blob = buildBlobBytes(gathered.manifest, gathered.body);
    const eta = estimateSeconds(blob.length, s.chunkSize, s.fps);
    const sizeLabel = formatBytes(blob.length);
    const proceed = blob.length > LARGE_TRANSFER_BYTES
      ? confirm(
          `送信予定: ${sizeLabel}\n` +
          `現在の設定での推定転送時間は ${formatDuration(eta)} です。\n` +
          `（途中で受信が始まる必要があり、実際にはこれを複数周する場合があります）\n\n` +
          `送信を開始しますか？`
        )
      : true;
    if (!proceed) {
      sendStatus.textContent = 'キャンセルしました';
      btnSendStart.disabled = false;
      sendBusy = false;
      return;
    }

    let frames;
    try {
      frames = encodeFramesFromBytes(blob, s.chunkSize).frames;
    } catch (err) {
      sendStatus.textContent = `フレーム生成エラー: ${err.message}`;
      btnSendStart.disabled = false;
      sendBusy = false;
      return;
    }
    sendAllFrames = frames;

    let typeNumber = s.typeNumber;
    if (typeNumber === 0) {
      try {
        typeNumber = resolveTypeNumber(frames, s.ecc);
      } catch (err) {
        sendStatus.textContent = `QR生成エラー: ${err.message}（チャンクサイズを下げてください）`;
        btnSendStart.disabled = false;
        sendBusy = false;
        sendAllFrames = [];
        return;
      }
    }

    sendRenderOpts = { typeNumber, ecc: s.ecc, cellSize: s.cellSize, margin: s.margin };
    sendTickMs = Math.max(50, Math.round(1000 / s.fps));
    sendMeta = { kind: gathered.manifest.kind, sizeLabel };

    // Honor any pre-filled range; fall back to all on parse error
    if (!applyRangeFromInput()) {
      sendActive = Array.from({ length: sendAllFrames.length }, (_, i) => i);
    }

    btnSendStop.disabled = false;
    setSendInputsDisabled(true);
    acquireWakeLock();
    startSendLoop();
  }

  function stopSend() {
    clearSendTimer();
    releaseWakeLock();
    btnSendStart.disabled = false;
    btnSendStop.disabled = true;
    setSendInputsDisabled(false);
    sendBusy = false;
    if (sendAllFrames.length) {
      sendStatus.textContent = `停止（${sendAllFrames.length}枚生成済み）`;
    } else {
      sendStatus.textContent = '待機中';
    }
    sendAllFrames = [];
    sendActive = [];
  }

  btnRangeApply.addEventListener('click', () => {
    if (sendAllFrames.length) {
      // Active transfer: swap the looping subset without re-gathering data.
      if (applyRangeFromInput()) startSendLoop();
    } else {
      // Nothing started yet: begin a transfer honoring the range field.
      startSend();
    }
  });

  function setSendInputsDisabled(disabled) {
    sendInput.disabled = disabled;
    sendFile.disabled = disabled;
    sendRepoUrl.disabled = disabled;
    for (const b of modeButtons) b.disabled = disabled;
  }

  btnSendStart.addEventListener('click', startSend);
  btnSendStop.addEventListener('click', stopSend);

  // ----------------------------------------------------------------------
  // Receive
  // ----------------------------------------------------------------------

  let stream = null;
  let scanRaf = null;
  let recvState = null;
  let recvBlobUrl = null;
  let recvFilename = null;

  function clearRecvBlobUrl() {
    if (recvBlobUrl) {
      URL.revokeObjectURL(recvBlobUrl);
      recvBlobUrl = null;
    }
  }

  function resetRecvState() {
    recvState = null;
    recvProgress.value = 0;
    recvProgress.max = 1;
    recvStatus.textContent = '未開始';
    recvGrid.innerHTML = '';
    recvOutput.value = '';
    recvResult.hidden = true;
    recvResultInfo.innerHTML = '';
    recvTextField.hidden = true;
    btnCopy.disabled = true;
    btnDownload.disabled = true;
    clearRecvBlobUrl();
    recvFilename = null;
    recvMissingRow.hidden = true;
    recvMissingRow.classList.remove('is-complete');
    recvMissingList.textContent = '—';
    btnCopyMissing.disabled = true;
    btnSpeakMissing.disabled = true;
    btnShowMissingQr.disabled = true;
  }

  function updateMissingDisplay() {
    if (!recvState) return;
    const missing = [];
    for (let i = 0; i < recvState.total; i++) {
      if (recvState.chunks[i] == null) missing.push(i);
    }
    if (missing.length === 0) {
      recvMissingList.textContent = '（全て受信済み）';
      recvMissingRow.classList.add('is-complete');
      btnCopyMissing.disabled = true;
      btnSpeakMissing.disabled = true;
      btnShowMissingQr.disabled = true;
    } else {
      recvMissingList.textContent = formatIndexRanges(missing);
      recvMissingRow.classList.remove('is-complete');
      btnCopyMissing.disabled = false;
      btnSpeakMissing.disabled = false;
      btnShowMissingQr.disabled = false;
    }
    recvMissingRow.hidden = false;
  }

  function initRecvSession(sessionId, total) {
    recvState = {
      sessionId,
      total,
      chunks: new Array(total),
      gotCount: 0,
    };
    recvProgress.max = total;
    recvProgress.value = 0;
    recvGrid.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.title = `#${i + 1}`;
      recvGrid.appendChild(c);
    }
    recvOutput.value = '';
    recvResult.hidden = true;
    recvResultInfo.innerHTML = '';
    recvTextField.hidden = true;
    btnCopy.disabled = true;
    btnDownload.disabled = true;
    clearRecvBlobUrl();
    recvFilename = null;
    updateMissingDisplay();
  }

  function ingestFrame(frame) {
    if (!recvState || recvState.sessionId !== frame.sessionId || recvState.total !== frame.total) {
      initRecvSession(frame.sessionId, frame.total);
    }
    if (recvState.chunks[frame.index] != null) return;
    recvState.chunks[frame.index] = frame.payload;
    recvState.gotCount += 1;
    recvProgress.value = recvState.gotCount;
    recvStatus.textContent =
      `セッション ${recvState.sessionId} : ${recvState.gotCount} / ${recvState.total} 受信`;
    const cell = recvGrid.children[frame.index];
    if (cell) cell.classList.add('got');
    updateMissingDisplay();

    if (recvState.gotCount === recvState.total) {
      try {
        const b64 = recvState.chunks.join('');
        const composite = base64ToBytes(b64);
        const { manifest, body } = parseBlobBytes(composite);
        presentResult(manifest, body);
        recvStatus.textContent =
          `完了 ${recvState.total} 枚（セッション ${recvState.sessionId}）`;
      } catch (err) {
        recvStatus.textContent = `復号エラー: ${err.message}`;
      }
    }
  }

  function presentResult(manifest, body) {
    const kind = manifest.kind || 'file';
    const safeName = sanitizeFilename(manifest.name, kind === 'text' ? 'message.txt' : 'received.bin');
    recvFilename = safeName;

    const mime = manifest.mime
      || (kind === 'text' ? 'text/plain;charset=utf-8'
          : kind === 'repo' ? 'application/zip'
          : 'application/octet-stream');
    const blob = new Blob([body], { type: mime });
    clearRecvBlobUrl();
    recvBlobUrl = URL.createObjectURL(blob);

    let metaText = `名前: ${safeName}　サイズ: ${formatBytes(body.length)}`;
    if (kind === 'repo' && manifest.owner && manifest.repo) {
      metaText += `\nリポジトリ: ${manifest.owner}/${manifest.repo}${manifest.ref ? '@' + manifest.ref : ''}`;
    }
    if (mime) metaText += `\nMIME: ${mime}`;

    recvResultInfo.innerHTML = '';
    const badge = document.createElement('span');
    badge.className = 'kind-badge';
    badge.textContent = kind;
    recvResultInfo.appendChild(badge);
    const title = document.createElement('span');
    title.textContent = safeName;
    recvResultInfo.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = metaText;
    recvResultInfo.appendChild(meta);

    recvResult.hidden = false;
    btnDownload.disabled = false;

    if (kind === 'text') {
      try {
        recvOutput.value = new TextDecoder().decode(body);
        recvTextField.hidden = false;
        btnCopy.disabled = false;
      } catch {
        recvTextField.hidden = true;
        btnCopy.disabled = true;
      }
    } else {
      recvTextField.hidden = true;
      btnCopy.disabled = true;
    }
  }

  async function startRecv() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      recvStatus.textContent = 'このブラウザはカメラAPIに対応していません';
      httpsWarn.hidden = false;
      return;
    }
    const s = settingsFromInputs();
    const desiredWidth = s.resolution;
    const desiredHeight = Math.round((desiredWidth * 3) / 4);
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: s.facing },
          width: { ideal: desiredWidth },
          height: { ideal: desiredHeight },
        },
      });
    } catch (err) {
      recvStatus.textContent = `カメラ起動失敗: ${err.name} ${err.message}`;
      if (!isSecureCameraContext()) httpsWarn.hidden = false;
      return;
    }

    cam.srcObject = stream;
    await cam.play().catch(() => {});

    btnRecvStart.disabled = true;
    btnRecvStop.disabled = false;
    recvStatus.textContent = 'スキャン中…';

    const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
    const scan = () => {
      if (!stream) return;
      if (cam.readyState >= cam.HAVE_CURRENT_DATA && cam.videoWidth > 0) {
        const w = cam.videoWidth;
        const h = cam.videoHeight;
        if (scanCanvas.width !== w) scanCanvas.width = w;
        if (scanCanvas.height !== h) scanCanvas.height = h;
        ctx.drawImage(cam, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, w, h, { inversionAttempts: s.inversion });
        if (code && code.data) {
          const frame = parseFrame(code.data);
          if (frame) ingestFrame(frame);
        }
      }
      scanRaf = requestAnimationFrame(scan);
    };
    scanRaf = requestAnimationFrame(scan);
  }

  function stopRecv() {
    if (scanRaf) cancelAnimationFrame(scanRaf);
    scanRaf = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    cam.srcObject = null;
    btnRecvStart.disabled = false;
    btnRecvStop.disabled = true;
    if (recvState && recvState.gotCount < recvState.total) {
      recvStatus.textContent =
        `停止（${recvState.gotCount} / ${recvState.total}）`;
    } else if (!recvState) {
      recvStatus.textContent = '未開始';
    }
  }

  function isSecureCameraContext() {
    if (window.isSecureContext) return true;
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  }

  btnRecvStart.addEventListener('click', startRecv);
  btnRecvStop.addEventListener('click', stopRecv);
  btnRecvReset.addEventListener('click', resetRecvState);

  btnDownload.addEventListener('click', () => {
    if (!recvBlobUrl || !recvFilename) return;
    const a = document.createElement('a');
    a.href = recvBlobUrl;
    a.download = recvFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  btnCopyMissing.addEventListener('click', async () => {
    const txt = recvMissingList.textContent;
    if (!txt || txt.startsWith('（')) return;
    try {
      await navigator.clipboard.writeText(txt);
      const old = btnCopyMissing.textContent;
      btnCopyMissing.textContent = 'コピー済み';
      setTimeout(() => { btnCopyMissing.textContent = old; }, 1200);
    } catch { /* ignore */ }
  });

  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(recvOutput.value);
      const old = btnCopy.textContent;
      btnCopy.textContent = 'コピー済み';
      setTimeout(() => { btnCopy.textContent = old; }, 1200);
    } catch {
      recvOutput.select();
      document.execCommand && document.execCommand('copy');
    }
  });

  // ----------------------------------------------------------------------
  // DTMF audio bridge — convey the missing-list between two devices over
  // the air using touch-tone style dual frequencies. Receiver-of-QR plays
  // a short tone burst, sender-of-QR listens with the mic and auto-fills
  // its range field. Fully offline; only the Web Audio API is used.
  // ----------------------------------------------------------------------

  const DTMF_LOW = [697, 770, 852, 941];
  const DTMF_HIGH = [1209, 1336, 1477];
  const DTMF_KEYS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
  ];
  const DTMF_KEY_TO_FREQS = (() => {
    const m = {};
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      m[DTMF_KEYS[r][c]] = [DTMF_LOW[r], DTMF_HIGH[c]];
    }
    return m;
  })();
  const DTMF_TONE_MS = 120;
  const DTMF_GAP_MS = 80;
  const DTMF_LISTEN_TIMEOUT_MS = 15000;

  // Range text (e.g. "5,12,18-25") → DTMF key string (e.g. "*105*12*18#25#")
  function buildDtmfMessage(rangeText) {
    const payload = String(rangeText).replace(/,/g, '*').replace(/-/g, '#');
    if (payload.length > 99) throw new Error('番号が多すぎます');
    const len = String(payload.length).padStart(2, '0');
    return '*' + len + payload + '#';
  }

  // Pull the first complete frame out of a rolling key stream.
  // Returns the decoded range text (e.g. "5,12,18-25") or null if not yet
  // complete. Caller is expected to keep appending keys and re-call.
  function parseDtmfFrame(stream) {
    const start = stream.indexOf('*');
    if (start < 0) return { ready: false, consumed: 0 };
    if (stream.length < start + 3) return { ready: false, consumed: 0 };
    const lenStr = stream.substr(start + 1, 2);
    if (!/^\d{2}$/.test(lenStr)) return { ready: false, consumed: start + 1 };
    const len = +lenStr;
    const payloadStart = start + 3;
    const payloadEnd = payloadStart + len;
    if (stream.length < payloadEnd + 1) return { ready: false, consumed: 0 };
    const end = stream[payloadEnd];
    if (end !== '#') return { ready: false, consumed: payloadEnd + 1 };
    const payload = stream.substr(payloadStart, len);
    const range = payload.replace(/\*/g, ',').replace(/#/g, '-');
    return { ready: true, range, consumed: payloadEnd + 1 };
  }

  let dtmfPlayCtx = null;

  async function playDtmfSequence(keys, onProgress) {
    if (dtmfPlayCtx) return; // already playing
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio API 非対応');
    const ctx = new AC();
    dtmfPlayCtx = ctx;
    try {
      const gain = ctx.createGain();
      gain.gain.value = 0.25;
      gain.connect(ctx.destination);
      let t = ctx.currentTime + 0.1;
      for (let i = 0; i < keys.length; i++) {
        const freqs = DTMF_KEY_TO_FREQS[keys[i]];
        if (!freqs) continue;
        const [low, high] = freqs;
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        o1.frequency.value = low;
        o2.frequency.value = high;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(1, t + 0.005);
        env.gain.setValueAtTime(1, t + DTMF_TONE_MS / 1000 - 0.005);
        env.gain.linearRampToValueAtTime(0, t + DTMF_TONE_MS / 1000);
        o1.connect(env); o2.connect(env); env.connect(gain);
        o1.start(t); o2.start(t);
        o1.stop(t + DTMF_TONE_MS / 1000 + 0.01);
        o2.stop(t + DTMF_TONE_MS / 1000 + 0.01);
        t += (DTMF_TONE_MS + DTMF_GAP_MS) / 1000;
        if (onProgress) onProgress(i + 1, keys.length);
      }
      const totalMs = (t - ctx.currentTime) * 1000 + 100;
      await new Promise((r) => setTimeout(r, totalMs));
    } finally {
      try { await ctx.close(); } catch {}
      dtmfPlayCtx = null;
    }
  }

  // Goertzel single-frequency power estimate.
  function goertzelPower(samples, freq, sampleRate) {
    const N = samples.length;
    const k = Math.round(N * freq / sampleRate);
    const omega = (2 * Math.PI * k) / N;
    const coeff = 2 * Math.cos(omega);
    let q1 = 0, q2 = 0;
    for (let i = 0; i < N; i++) {
      const q0 = coeff * q1 - q2 + samples[i];
      q2 = q1;
      q1 = q0;
    }
    return q1 * q1 + q2 * q2 - q1 * q2 * coeff;
  }

  // Start mic-driven DTMF listener. Returns a stop() function.
  // onMessage is invoked with the decoded range text when a full frame
  // arrives; onTimeout fires after no frame in DTMF_LISTEN_TIMEOUT_MS.
  async function startDtmfListen({ onMessage, onTimeout, onKey, onError }) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { onError && onError(new Error('Web Audio API 非対応')); return null; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onError && onError(new Error('マイクAPI非対応')); return null;
    }

    let stream, ctx, source, processor;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } catch (err) {
      onError && onError(err);
      return null;
    }

    ctx = new AC();
    source = ctx.createMediaStreamSource(stream);
    const FRAME = 1024;
    processor = ctx.createScriptProcessor(FRAME, 1, 1);

    const sampleRate = ctx.sampleRate;
    let lastKey = null;
    let stableCount = 0;
    let silenceCount = 0;
    let keyStream = '';
    const REQUIRED_STABLE = 2;     // ~50 ms at 44.1kHz/1024
    const REQUIRED_SILENCE = 1;
    const POWER_THRESHOLD = 4e3;   // empirically OK at gain 0.25 / 30cm distance
    const PAIR_DOMINANCE = 2.0;    // winning freq must beat next-in-group by this ratio

    let stopped = false;
    let timeoutId = setTimeout(() => {
      if (!stopped) { stop(); onTimeout && onTimeout(); }
    }, DTMF_LISTEN_TIMEOUT_MS);

    function detectKey(samples) {
      const lowPow = DTMF_LOW.map((f) => goertzelPower(samples, f, sampleRate));
      const highPow = DTMF_HIGH.map((f) => goertzelPower(samples, f, sampleRate));
      const lowMax = Math.max(...lowPow);
      const highMax = Math.max(...highPow);
      if (lowMax < POWER_THRESHOLD || highMax < POWER_THRESHOLD) return null;
      const lowIdx = lowPow.indexOf(lowMax);
      const highIdx = highPow.indexOf(highMax);
      const lowRunner = Math.max(...lowPow.filter((_, i) => i !== lowIdx));
      const highRunner = Math.max(...highPow.filter((_, i) => i !== highIdx));
      if (lowMax < lowRunner * PAIR_DOMINANCE) return null;
      if (highMax < highRunner * PAIR_DOMINANCE) return null;
      return DTMF_KEYS[lowIdx][highIdx];
    }

    processor.onaudioprocess = (ev) => {
      if (stopped) return;
      const samples = ev.inputBuffer.getChannelData(0);
      const key = detectKey(samples);
      if (key) {
        if (key === lastKey) {
          stableCount++;
        } else {
          lastKey = key;
          stableCount = 1;
        }
        silenceCount = 0;
        if (stableCount === REQUIRED_STABLE) {
          // Commit a single keypress, then suppress repeats until a gap.
          keyStream += key;
          onKey && onKey(key, keyStream);
          // Try to parse a complete frame; if found, succeed and stop.
          const parsed = parseDtmfFrame(keyStream);
          if (parsed.ready) {
            stop();
            onMessage && onMessage(parsed.range);
            return;
          }
          // Cap stream so we don't accumulate forever
          if (keyStream.length > 200) keyStream = keyStream.slice(-200);
        }
      } else {
        silenceCount++;
        if (silenceCount >= REQUIRED_SILENCE) {
          lastKey = null;
          stableCount = 0;
        }
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    // iOS/Safari hands back a suspended context; without resume the
    // ScriptProcessor never fires and detection silently never starts.
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {}
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timeoutId);
      try { processor.disconnect(); } catch {}
      try { source.disconnect(); } catch {}
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
      try { ctx.close(); } catch {}
    }
    return stop;
  }

  // ---------- DTMF UI wiring -------------------------------------------

  let listenStop = null;
  let listenTimer = null;
  let listening = false;
  const LISTEN_LABEL = btnListenRange.textContent;

  // Tear down a listen session and restore the button, whether it ends via
  // success, timeout, error, or a manual cancel tap.
  function endListen(statusText) {
    if (listenTimer) { clearInterval(listenTimer); listenTimer = null; }
    if (listenStop) { try { listenStop(); } catch {} listenStop = null; }
    listening = false;
    btnListenRange.classList.remove('is-busy');
    btnListenRange.textContent = LISTEN_LABEL;
    if (statusText != null) sendStatus.textContent = statusText;
  }

  btnSpeakMissing.addEventListener('click', async () => {
    const txt = recvMissingList.textContent;
    if (!txt || txt.startsWith('（')) return;
    let keys;
    try { keys = buildDtmfMessage(txt); }
    catch (err) { recvStatus.textContent = `DTMFエラー: ${err.message}`; return; }
    btnSpeakMissing.disabled = true;
    btnSpeakMissing.classList.add('is-busy');
    const oldText = btnSpeakMissing.textContent;
    btnSpeakMissing.textContent = '再生中…';
    try {
      await playDtmfSequence(keys);
    } catch (err) {
      recvStatus.textContent = `再生エラー: ${err.message}`;
    } finally {
      btnSpeakMissing.classList.remove('is-busy');
      btnSpeakMissing.textContent = oldText;
      btnSpeakMissing.disabled = !!(recvState && recvState.gotCount >= recvState.total);
    }
  });

  btnListenRange.addEventListener('click', async () => {
    // A tap while already listening means "stop now".
    if (listening) { endListen('聞き取りを停止しました'); return; }

    // Mark active synchronously so a second tap during the getUserMedia
    // await cancels instead of spawning a second listener.
    listening = true;
    btnListenRange.classList.add('is-busy');
    btnListenRange.textContent = '聞き取り中… (タップで停止)';
    sendStatus.textContent = 'マイクで DTMF を待っています…';
    let elapsed = 0;
    listenTimer = setInterval(() => {
      elapsed++;
      const remain = Math.max(0, Math.ceil(DTMF_LISTEN_TIMEOUT_MS / 1000) - elapsed);
      sendStatus.textContent = `マイクで DTMF を待っています… (残り ${remain}s)`;
    }, 1000);

    const stop = await startDtmfListen({
      onMessage: (range) => {
        sendRange.value = range;
        endListen(`受信成功: 範囲 ${range}（「反映」で適用）`);
      },
      onTimeout: () => endListen('タイムアウト: DTMF を検出できませんでした'),
      onError: (err) => endListen(`マイク失敗: ${err.message}`),
    });

    if (!listening) {
      // User canceled while the mic was still initializing — tear it down.
      if (stop) { try { stop(); } catch {} }
      return;
    }
    if (!stop) return;   // onError already restored the UI
    listenStop = stop;
  });

  // ---------- QR bridge (missing-range side-channel) --------------------
  // Visual alternative to the DTMF bridge above: the receiver shows its
  // missing-range as a small QR, the sender does a one-shot scan of it.
  // Uses its own canvas/video/stream — never touches sendTimer, scanRaf,
  // or the module-level `stream` — so the main transfer loops on both
  // devices keep running underneath, same as the DTMF bridge already does.

  let qrBridgeStream = null;
  let qrBridgeRaf = null;

  function closeQrBridge() {
    if (qrBridgeRaf) { cancelAnimationFrame(qrBridgeRaf); qrBridgeRaf = null; }
    if (qrBridgeStream) {
      qrBridgeStream.getTracks().forEach((t) => t.stop());
      qrBridgeStream = null;
    }
    qrBridgeVideo.srcObject = null;
    qrBridgeModal.hidden = true;
    qrBridgeShowWrap.hidden = true;
    qrBridgeScanWrap.hidden = true;
  }

  btnQrBridgeClose.addEventListener('click', () => closeQrBridge());

  btnShowMissingQr.addEventListener('click', () => {
    const txt = recvMissingList.textContent;
    if (!txt || txt.startsWith('（')) return;
    qrBridgeModal.hidden = false;
    qrBridgeShowWrap.hidden = false;
    qrBridgeScanWrap.hidden = true;
    qrBridgeStatus.textContent = '送信端末にこのQRを読み取ってもらってください';
    try {
      drawQrToCanvas(qrBridgeCanvas, `${MISSING_QR_TAG}|${txt}`, {
        typeNumber: 0, ecc: 'M', cellSize: 8, margin: 4,
      });
    } catch (err) {
      qrBridgeStatus.textContent = `QR生成エラー: ${err.message}`;
    }
  });

  btnScanRange.addEventListener('click', async () => {
    if (!qrBridgeModal.hidden) return; // 連打による多重起動を防止
    // 受信中（メインカメラ使用中）は別カメラを二重に開かない
    if (stream) {
      sendStatus.textContent = '受信中はQR読み取りを使えません';
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      sendStatus.textContent = 'このブラウザはカメラAPIに対応していません';
      return;
    }
    qrBridgeModal.hidden = false;
    qrBridgeScanWrap.hidden = false;
    qrBridgeShowWrap.hidden = true;
    qrBridgeStatus.textContent = 'カメラを起動しています…';
    try {
      qrBridgeStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
    } catch (err) {
      qrBridgeStatus.textContent = `カメラ起動失敗: ${err.name} ${err.message}`;
      closeQrBridge();
      return;
    }
    qrBridgeVideo.srcObject = qrBridgeStream;
    await qrBridgeVideo.play().catch(() => {});
    qrBridgeStatus.textContent = '相手が表示しているQRを読み取ってください';

    const ctx = qrBridgeScanCanvas.getContext('2d', { willReadFrequently: true });
    const scanOnce = () => {
      if (!qrBridgeStream) return; // closed while awaiting a frame
      if (qrBridgeVideo.readyState >= qrBridgeVideo.HAVE_CURRENT_DATA && qrBridgeVideo.videoWidth > 0) {
        const w = qrBridgeVideo.videoWidth;
        const h = qrBridgeVideo.videoHeight;
        if (qrBridgeScanCanvas.width !== w) qrBridgeScanCanvas.width = w;
        if (qrBridgeScanCanvas.height !== h) qrBridgeScanCanvas.height = h;
        ctx.drawImage(qrBridgeVideo, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code && code.data && code.data.startsWith(MISSING_QR_TAG + '|')) {
          const range = code.data.slice(MISSING_QR_TAG.length + 1);
          closeQrBridge();
          sendRange.value = range;
          sendStatus.textContent = `受信成功: 範囲 ${range}（「反映」で適用）`;
          return;
        }
      }
      qrBridgeRaf = requestAnimationFrame(scanOnce);
    };
    qrBridgeRaf = requestAnimationFrame(scanOnce);
  });

  // ----------------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------------

  function init() {
    populateTypeOptions();
    applySettingsToInputs(loadSettings());
    bindSettings();
    applySendMode(currentSendMode());
    resetRecvState();
    if (!isSecureCameraContext()) httpsWarn.hidden = false;
  }

  init();
})();
