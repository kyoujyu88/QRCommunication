(function () {
  'use strict';

  // ----------------------------------------------------------------------
  // Constants
  // ----------------------------------------------------------------------

  const PROTOCOL_TAG = 'QRT2';    // 旧形式（base64・バイトモード）。受信のみ対応
  const PROTOCOL_V3_TAG = 'Q3';   // 現行形式（base45・英数字モード・圧縮）
  const MISSING_QR_TAG = 'QRTM'; // missing-range side-channel, distinct from data frames
  const MISSING_QR_MULTI_TAG = 'QRTN'; // same, split across several cycling QRs
  const STORAGE_KEY = 'qrtt.settings.v1';
  // フッタに出す最終更新日。ビルド工程が無い（index.html を直接開ける）ので
  // 自動埋め込みができない。内容を変更したらここも更新すること。
  const LAST_UPDATED = '2026-10-06';
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
    decoder: 'auto',
    imgCompress: '50',
    protocol: 'v3',
    multi: '1',
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
  const sendFileList = $('sendFileList');
  const sendFileTools = $('sendFileTools');
  const btnSendFilesClear = $('btnSendFilesClear');
  const sendRepoUrl = $('sendRepoUrl');
  const sendRepoParsed = $('sendRepoParsed');
  const btnSendStart = $('btnSendStart');
  const btnSendStop = $('btnSendStop');
  const btnSendPrev = $('btnSendPrev');
  const btnSendNext = $('btnSendNext');
  const sendFrameNo = $('sendFrameNo');
  const sendSetup = $('sendSetup');
  const sendSummary = $('sendSummary');
  const sendStage = $('sendStage');
  const btnSendFocus = $('btnSendFocus');
  const sendTextInfo = $('sendTextInfo');
  const sendStatus = $('sendStatus');
  const qrCanvas = $('qrCanvas');
  const qrWrap = qrCanvas.parentElement;
  const sendRange = $('sendRange');
  const btnRangeApply = $('btnRangeApply');
  const btnRepoLoad = $('btnRepoLoad');
  const repoTreeStatus = $('repoTreeStatus');
  const repoPicker = $('repoPicker');
  const repoFilter = $('repoFilter');
  const repoSort = $('repoSort');
  const btnRepoAll = $('btnRepoAll');
  const btnRepoNone = $('btnRepoNone');
  const repoFileList = $('repoFileList');
  const repoSelSummary = $('repoSelSummary');
  const modeButtons = document.querySelectorAll('.mode-opt');
  const modePanels = document.querySelectorAll('[data-mode-panel]');

  const btnRecvStart = $('btnRecvStart');
  const btnRecvStop = $('btnRecvStop');
  const btnRecvReset = $('btnRecvReset');
  const cam = $('cam');
  const recvFrameNo = $('recvFrameNo');
  const recvScanRate = $('recvScanRate');
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
  const wakeLockWarn = $('wakeLockWarn');
  const recvMissingRow = $('recvMissingRow');
  const recvMissingList = $('recvMissingList');
  const recvMissingCount = $('recvMissingCount');
  const btnCopyMissing = $('btnCopyMissing');
  const btnShowMissingQr = $('btnShowMissingQr');
  const btnScanRange = $('btnScanRange');
  const qrBridgeModal = $('qrBridgeModal');
  const qrBridgeStatus = $('qrBridgeStatus');
  const qrBridgeShowWrap = $('qrBridgeShowWrap');
  const qrBridgeCanvas = $('qrBridgeCanvas');
  const qrBridgePart = $('qrBridgePart');
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
    decoder: $('cfgDecoder'),
    imgCompress: $('cfgImgCompress'),
    protocol: $('cfgProtocol'),
    multi: $('cfgMulti'),
  };
  const imgCompressField = $('imgCompressField');
  const out = {
    chunkSize: $('outChunkSize'),
    fps: $('outFps'),
    cell: $('outCell'),
    margin: $('outMargin'),
  };
  const btnResetSettings = $('btnResetSettings');
  const lastUpdated = $('lastUpdated');

  // ----------------------------------------------------------------------
  // Settings: load / save / bind
  // ----------------------------------------------------------------------

  // 画像設定は「大/中/小」の絶対px指定から縮小率に変わった。保存済みの
  // 旧値をそのまま <select> に入れると選択なしになってしまうので読み替える。
  const LEGACY_IMG_COMPRESS = { high: '25', medium: '50', low: '75' };

  function normalizeSettings(s) {
    const v = s.imgCompress;
    if (LEGACY_IMG_COMPRESS[v]) s.imgCompress = LEGACY_IMG_COMPRESS[v];
    else if (v !== 'none' && !IMG_SCALES[v]) s.imgCompress = DEFAULT_SETTINGS.imgCompress;
    if (s.protocol !== 'v3' && s.protocol !== 'v2') s.protocol = DEFAULT_SETTINGS.protocol;
    if (!['1', '2', '4'].includes(s.multi)) s.multi = DEFAULT_SETTINGS.multi;
    if (!['auto', 'zxing', 'jsqr'].includes(s.decoder)) s.decoder = DEFAULT_SETTINGS.decoder;
    return s;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
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
      decoder: cfg.decoder.value,
      imgCompress: cfg.imgCompress.value,
      protocol: cfg.protocol.value,
      multi: cfg.multi.value,
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
    cfg.decoder.value = s.decoder;
    cfg.imgCompress.value = s.imgCompress;
    cfg.protocol.value = s.protocol;
    cfg.multi.value = s.multi;
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
        refreshSendFileInfo();
        updateRepoSummary();
        scheduleTextInfo();
      });
    });
    btnResetSettings.addEventListener('click', () => {
      applySettingsToInputs(DEFAULT_SETTINGS);
      saveSettings(DEFAULT_SETTINGS);
      refreshSendFileInfo();
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

  sendRepoUrl.addEventListener('input', () => {
    if (repoTree && !repoTreeMatches(parseRepoSpec(sendRepoUrl.value))) {
      clearRepoTree('リポジトリが変わりました。もう一度「ファイル一覧を取得」してください');
    }
  });

  sendFile.addEventListener('change', () => {
    addSendFiles(sendFile.files || []);
    sendFile.value = '';   // 同じファイルを外して選び直せるようにする
    refreshSendFileInfo();
  });
  btnSendFilesClear.addEventListener('click', () => {
    sendFiles = [];
    imgPrepCache.clear();
    refreshSendFileInfo();
  });
  cfg.imgCompress.addEventListener('change', refreshSendFileInfo);

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

  // ---------- 転送形式 v3 ----------
  // QR の英数字モードは1文字5.5ビットで符号化される。base64 をバイトモードで
  // 送ると1文字8ビットの枠に6ビットしか載らないので、英数字モードで使える
  // 45文字だけでバイト列を表す base45（RFC 9285）に替えると、同じ大きさの
  // QR に約3割多くのデータが載る。ヘッダも同じ45文字の範囲で組む。
  //   Q3:<セッションID>:<番号>:<総数>:<base45>
  const B45_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const B45_VALUE = (() => {
    const m = new Int8Array(128).fill(-1);
    for (let i = 0; i < B45_CHARS.length; i++) m[B45_CHARS.charCodeAt(i)] = i;
    return m;
  })();

  function bytesToBase45(bytes) {
    let s = '';
    let i = 0;
    for (; i + 1 < bytes.length; i += 2) {
      let n = bytes[i] * 256 + bytes[i + 1];
      const c = n % 45;
      n = (n - c) / 45;
      const d = n % 45;
      s += B45_CHARS[c] + B45_CHARS[d] + B45_CHARS[(n - d) / 45];
    }
    if (i < bytes.length) {
      const n = bytes[i];
      s += B45_CHARS[n % 45] + B45_CHARS[(n - (n % 45)) / 45];
    }
    return s;
  }

  // 不正な文字や桁あふれがあれば null（読み違いのフレームとして捨てる）
  function base45ToBytes(s) {
    const rem = s.length % 3;
    if (rem === 1) return null;
    const out = new Uint8Array(((s.length - rem) / 3) * 2 + (rem ? 1 : 0));
    const val = (k) => {
      const ch = s.charCodeAt(k);
      return ch < 128 ? B45_VALUE[ch] : -1;
    };
    let o = 0;
    let i = 0;
    for (; i + 2 < s.length; i += 3) {
      const c = val(i), d = val(i + 1), e = val(i + 2);
      if (c < 0 || d < 0 || e < 0) return null;
      const n = c + d * 45 + e * 2025;
      if (n > 0xffff) return null;
      out[o++] = n >> 8;
      out[o++] = n & 0xff;
    }
    if (rem) {
      const c = val(i), d = val(i + 1);
      if (c < 0 || d < 0) return null;
      const n = c + d * 45;
      if (n > 0xff) return null;
      out[o++] = n;
    }
    return out;
  }

  // 設定の「1枚あたりのデータ量」は QR のバイトモード換算の容量。旧形式と
  // 同じ値なら QR の大きさ（読み取りやすさ）はほぼ同じまま、載る実データが
  // 約3割増える。base45 は2バイト→3文字なので偶数バイトに揃える。
  function rawBytesPerFrame(chunkSize) {
    return Math.max(2, Math.floor((chunkSize * 16) / 11 / 3) * 2);
  }

  // FNV-1a。セッションIDを中身から決めるのに使う（暗号用途ではない）。
  function fnv1a(bytes, seed) {
    let h = (0x811c9dc5 ^ seed) >>> 0;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // セッションIDを送るデータとチャンクの切り方から決める。送信側を止めて
  // 設定（FPSなど）を変えて再開しても、中身と1枚あたりの量が同じなら同じ
  // セッションとして扱われ、受信側の途中経過が消えない。受信側は全部
  // そろった時点で同じ計算をし、別の送信が混ざっていないかを検証する。
  function sessionIdFor(wire, rawPerFrame, total) {
    return fnv1a(wire, total > 1 ? rawPerFrame : 0).toString(36).toUpperCase();
  }

  // 送る直前のデータの先頭1バイトが形式を表す（0 = そのまま、1 = deflate）。
  // テキストや未圧縮のファイルは 1/2〜1/3 程度になり、その分だけ早く終わる。
  const WIRE_RAW = 0;
  const WIRE_DEFLATE = 1;
  const PRECOMPRESSED_MIME = /^(image|video|audio)\/|zip|gzip|x-7z|x-rar|x-xz|x-bzip/i;

  function shouldCompress(manifest) {
    return !(manifest.mime && PRECOMPRESSED_MIME.test(manifest.mime));
  }

  function buildWireBytes(blob, tryCompress) {
    let packed = null;
    if (tryCompress) {
      try { packed = fflate.deflateSync(blob, { level: 6 }); } catch { packed = null; }
    }
    const useDeflate = !!packed && packed.length < blob.length * 0.95;
    const body = useDeflate ? packed : blob;
    const wire = new Uint8Array(body.length + 1);
    wire[0] = useDeflate ? WIRE_DEFLATE : WIRE_RAW;
    wire.set(body, 1);
    return { wire, compressed: useDeflate };
  }

  function unwrapWireBytes(wire) {
    if (!wire.length) throw new Error('データが空です');
    if (wire[0] === WIRE_RAW) return wire.subarray(1);
    if (wire[0] === WIRE_DEFLATE) return fflate.inflateSync(wire.subarray(1));
    throw new Error('未対応のデータ形式です（送信側のほうが新しいバージョンの可能性があります）');
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

  function encodeFrames(wire, chunkSize) {
    const raw = rawBytesPerFrame(chunkSize);
    const total = Math.max(1, Math.ceil(wire.length / raw));
    const sessionId = sessionIdFor(wire, raw, total);
    const frames = [];
    for (let i = 0; i < total; i++) {
      const payload = bytesToBase45(wire.subarray(i * raw, (i + 1) * raw));
      frames.push(`${PROTOCOL_V3_TAG}:${sessionId}:${i}:${total}:${payload}`);
    }
    return { frames, sessionId, total };
  }

  // 旧形式（QRT2）。旧バージョンの受信側はこれしか読めないので互換用に残す。
  // 圧縮せず、送るデータ全体を base64 にしてバイトモードで送る。chunkSize は
  // そのまま1枚あたりの base64 文字数（= QR のバイト数）になる。
  // セッションIDは新形式と同じく中身から決める（旧受信側は任意の文字列を
  // 受け付ける）ので、最新の受信側なら送信を再開しても途中経過を引き継げる。
  function encodeFramesLegacy(blob, chunkSize) {
    const b64 = bytesToBase64(blob);
    const total = Math.max(1, Math.ceil(b64.length / chunkSize));
    const sessionId = fnv1a(blob, chunkSize).toString(36);
    const frames = [];
    for (let i = 0; i < total; i++) {
      const payload = b64.slice(i * chunkSize, (i + 1) * chunkSize);
      frames.push(`${PROTOCOL_TAG}|${sessionId}|${i}|${total}|${payload}`);
    }
    return { frames, sessionId, total };
  }

  // 送信形式に応じて、実際に送るバイト列を用意する。旧形式は圧縮しない
  // （旧受信側は先頭の形式バイトも deflate も知らない）。
  function prepareWire(blob, manifest, protocol) {
    if (protocol === 'v2') return { wire: blob, compressed: false };
    return buildWireBytes(blob, shouldCompress(manifest));
  }

  // 読み取った文字列を { version, sessionId, index, total, payload } にする。
  // payload は v3 ならバイト列、旧形式(v2)なら base64 文字列。
  function parseFrame(text) {
    if (typeof text !== 'string') return null;
    if (text.startsWith(PROTOCOL_V3_TAG + ':')) return parseFrameV3(text);
    if (!text.startsWith(PROTOCOL_TAG + '|')) return null;
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
    return { version: 2, sessionId, index, total, payload };
  }

  function parseFrameV3(text) {
    const a = PROTOCOL_V3_TAG.length + 1;
    const b = text.indexOf(':', a);
    const c = b < 0 ? -1 : text.indexOf(':', b + 1);
    const d = c < 0 ? -1 : text.indexOf(':', c + 1);
    if (d < 0) return null;
    const sessionId = text.slice(a, b);
    const indexStr = text.slice(b + 1, c);
    const totalStr = text.slice(c + 1, d);
    if (!/^[0-9A-Z]+$/.test(sessionId) || !/^\d+$/.test(indexStr) || !/^\d+$/.test(totalStr)) return null;
    const index = +indexStr;
    const total = +totalStr;
    if (total <= 0 || index >= total) return null;
    const payload = base45ToBytes(text.slice(d + 1));
    if (!payload) return null;
    return { version: 3, sessionId, index, total, payload };
  }

  // ----------------------------------------------------------------------
  // QR rendering (qrcode-generator)
  // ----------------------------------------------------------------------

  function drawQrToCanvas(canvas, text, opts) {
    const { typeNumber, ecc, cellSize, margin } = opts;
    const qr = qrcode(typeNumber, ecc);
    qr.addData(text, opts.mode || 'Byte');
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

  // 同時表示：複数のQRを1枚のキャンバスに並べる（2 = 縦2枚、4 = 2×2）。
  // 型番は全フレーム共通なので同じ大きさになる。読み取り側が別々のQRと
  // 見分けられるよう、QRどうしの間は 4 モジュール（QRの規格の余白）あける。
  // texts が枠より少ないとき（残り1枚など）は空いた枠を白のままにする。
  function drawQrGrid(canvas, texts, opts, layout) {
    const { typeNumber, ecc, cellSize, margin } = opts;
    const qrs = texts.map((t) => {
      const q = qrcode(typeNumber, ecc);
      q.addData(t, opts.mode || 'Byte');
      q.make();
      return q;
    });
    const count = qrs[0].getModuleCount();
    const cols = layout === 4 ? 2 : 1;
    const rows = 2;
    const tile = count * cellSize;
    const gap = 4 * cellSize;
    canvas.width = margin * 2 + cols * tile + (cols - 1) * gap;
    canvas.height = margin * 2 + rows * tile + (rows - 1) * gap;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    qrs.forEach((qr, i) => {
      const ox = margin + (i % cols) * (tile + gap);
      const oy = margin + Math.floor(i / cols) * (tile + gap);
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) ctx.fillRect(ox + c * cellSize, oy + r * cellSize, cellSize, cellSize);
        }
      }
    });
  }

  // Pick a single typeNumber covering the longest frame so every chunk
  // renders at the same QR size.
  function resolveTypeNumber(frames, ecc, mode) {
    let longest = frames[0];
    for (const f of frames) if (f.length > longest.length) longest = f;
    const qr = qrcode(0, ecc);
    qr.addData(longest, mode || 'Byte');
    qr.make();
    return (qr.getModuleCount() - 17) / 4;
  }

  // ----------------------------------------------------------------------
  // GitHub repo → zip (client-side packaging, avoids codeload.github.com
  // CORS by walking the Git Data API + raw.githubusercontent.com which
  // both serve Access-Control-Allow-Origin: *)
  // ----------------------------------------------------------------------

  async function resolveRepoRef(spec, onP) {
    if (spec.ref) return spec.ref;
    onP(`デフォルトブランチを確認中: ${spec.owner}/${spec.repo}…`);
    const info = await ghJson(`repos/${spec.owner}/${spec.repo}`);
    if (!info.default_branch) throw new Error('default_branch を取得できませんでした');
    return info.default_branch;
  }

  // ツリーだけ取る。blob には size が入っているので、ダウンロード前に
  // 「どれを送るとどれくらいかかるか」を出せる。
  async function fetchRepoTree(spec, onProgress) {
    const onP = onProgress || (() => {});
    const { owner, repo } = spec;
    const ref = await resolveRepoRef(spec, onP);

    onP(`ツリー取得中: ${owner}/${repo}@${ref}…`);
    const tree = await ghJson(`repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    if (!tree || !Array.isArray(tree.tree)) throw new Error('tree レスポンスが不正');
    const entries = tree.tree
      .filter((e) => e.type === 'blob')
      .map((e) => ({ path: e.path, size: typeof e.size === 'number' ? e.size : 0 }));
    if (entries.length === 0) throw new Error('対象ファイルが見つかりません');
    return { owner, repo, ref, entries, truncated: !!tree.truncated };
  }

  async function downloadRepoFiles(owner, repo, ref, entries, onP) {
    const fetched = new Array(entries.length);
    let done = 0;
    const CONCURRENCY = 8;
    let next = 0;
    async function worker() {
      while (true) {
        const i = next++;
        if (i >= entries.length) return;
        const entry = entries[i];
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${entry.path}: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        fetched[i] = { path: entry.path, bytes: new Uint8Array(buf) };
        done++;
        if (done % 5 === 0 || done === entries.length) {
          onP(`ファイル取得中: ${done} / ${entries.length} (${owner}/${repo}@${ref})`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
    return fetched;
  }

  // entries は送る対象だけに絞り込んだもの。未指定ならツリー全件を送る。
  async function fetchRepoAsZip(spec, onProgress, entries) {
    const onP = onProgress || (() => {});
    let owner, repo, ref, list;
    if (entries) {
      ({ owner, repo, ref } = spec);
      list = entries;
    } else {
      const tree = await fetchRepoTree(spec, onP);
      ({ owner, repo, ref } = tree);
      list = tree.entries;
      if (tree.truncated) {
        onP(`⚠ ツリーが大きすぎて切り詰められました (${list.length}件)。一部のみ取得します`);
      }
    }
    if (list.length === 0) throw new Error('送信するファイルが選択されていません');

    const fetched = await downloadRepoFiles(owner, repo, ref, list, onP);

    onP(`zip 生成中 (${list.length}件)…`);
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
  // Repo file picker
  // ----------------------------------------------------------------------
  // リポジトリ全体を送ると転送が現実的な時間で終わらないことが多い。ツリー
  // だけ先に取れば各 blob の size が分かるので、ダウンロード前に「何を送ると
  // 何分かかるか」を見ながら選べるようにする。一覧未取得のまま開始した場合は従来どおり
  // 全ファイルを送る。

  const REPO_ROW_CAP = 1000;   // DOM が重くなるので描画は打ち切る（絞り込みで対応）

  let repoTree = null;              // fetchRepoTree の結果
  let repoSelected = new Set();     // 選択中のパス

  function repoTreeMatches(spec) {
    return !!repoTree && !!spec
      && repoTree.owner === spec.owner && repoTree.repo === spec.repo
      && (!spec.ref || repoTree.ref === spec.ref);
  }

  function clearRepoTree(reason) {
    repoTree = null;
    repoSelected = new Set();
    repoPicker.hidden = true;
    repoFileList.textContent = '';
    repoTreeStatus.textContent = reason || '未取得（そのまま開始すると全ファイルを送ります）';
  }

  function filteredRepoEntries() {
    const q = repoFilter.value.trim().toLowerCase();
    const all = repoTree ? repoTree.entries : [];
    const rows = q ? all.filter((e) => e.path.toLowerCase().includes(q)) : all.slice();
    const order = repoSort.value;
    if (order === 'path' || !repoTree || !repoTree.dates) return rows;
    // 日付不明は並び順によらず末尾に置き、同日時どうしはパス順
    const dir = order === 'newest' ? -1 : 1;
    return rows.sort((a, b) => {
      const da = repoTree.dates.get(a.path), db = repoTree.dates.get(b.path);
      if (da && db && da !== db) return da < db ? -dir : dir;
      if (!da !== !db) return da ? -1 : 1;
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });
  }

  // ----------------------------------------------------------------------
  // Repo file dates
  // ----------------------------------------------------------------------
  // Git Trees API には日時が無いので、ブランチの first-parent 履歴を新しい順に
  // 辿り、各コミットの変更ファイルから「最後に変わった日時」を割り当てる。
  // first-parent に限るのは、PR の個々のコミットではなくマージ（ブランチに
  // 入った時点）の日時にするため。未認証 API は 60req/hour なので上限を設け、
  // 届かなかった古いファイルは日付不明のままにする。

  const REPO_DATE_REQ_BUDGET = 40;

  async function fetchRepoDates(tree, onP) {
    const { owner, repo, ref } = tree;
    const pending = new Set(tree.entries.map((e) => e.path));
    const dates = new Map();
    const known = new Map();   // sha → commit list entry
    let reqs = 0;
    let sha = null;

    async function loadPage(from) {
      reqs++;
      const list = await ghJson(`repos/${owner}/${repo}/commits?sha=${encodeURIComponent(from)}&per_page=100`);
      for (const c of list) known.set(c.sha, c);
      return list;
    }

    const head = await loadPage(ref);
    if (!head.length) return dates;
    sha = head[0].sha;
    while (pending.size && reqs < REPO_DATE_REQ_BUDGET) {
      if (!known.has(sha)) {
        await loadPage(sha);
        if (!known.has(sha) || reqs >= REPO_DATE_REQ_BUDGET) break;
      }
      const c = known.get(sha);
      reqs++;
      const detail = await ghJson(`repos/${owner}/${repo}/commits/${sha}`);
      const when = detail.commit && detail.commit.committer && detail.commit.committer.date;
      for (const f of detail.files || []) {
        for (const p of [f.filename, f.previous_filename]) {
          if (p && pending.has(p) && when) { dates.set(p, when); pending.delete(p); }
        }
      }
      onP(`更新日時を取得中: ${dates.size} / ${tree.entries.length} 件（${reqs} req）`);
      if (!c.parents || !c.parents.length) break;   // ルートコミット
      sha = c.parents[0].sha;
    }
    return dates;
  }

  async function ensureRepoDates() {
    const tree = repoTree;
    if (!tree || tree.dates || tree.datesLoading) return;
    tree.datesLoading = true;
    repoSort.disabled = true;
    const base = repoTreeStatus.textContent;
    const setStatus = (msg) => { if (repoTree === tree) repoTreeStatus.textContent = `${base} ｜ ${msg}`; };
    let dates = null;
    let error = null;
    try {
      dates = await fetchRepoDates(tree, setStatus);
    } catch (err) {
      error = err;
    } finally {
      tree.datesLoading = false;
      if (repoTree === tree) repoSort.disabled = false;
    }
    if (repoTree !== tree) return;   // 取得中に一覧が差し替わった
    if (error) {
      setStatus(`更新日時の取得失敗: ${error.message}`);
      repoSort.value = 'path';
      return;
    }
    tree.dates = dates;
    const missing = tree.entries.length - dates.size;
    setStatus(missing > 0
      ? `更新日時: ${dates.size} 件取得、${missing} 件は日付不明（取得上限を超える古い履歴など。末尾に表示）`
      : '更新日時: 全件取得');
    renderRepoFileList();
  }

  function formatRepoDate(iso) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function selectedRepoEntries() {
    if (!repoTree) return [];
    return repoTree.entries.filter((e) => repoSelected.has(e.path));
  }

  function updateRepoSummary() {
    if (!repoTree) return;
    const sel = selectedRepoEntries();
    const bytes = sel.reduce((n, e) => n + e.size, 0);
    if (sel.length === 0) {
      repoSelSummary.textContent = '選択なし（このままでは送信できません）';
      return;
    }
    const s = settingsFromInputs();
    const eta = formatDuration(estimateSeconds(bytes, s.chunkSize, s.fps));
    // zip 前の合計なので実際の転送量はこれより小さくなる。上限として示す。
    repoSelSummary.textContent =
      `選択 ${sel.length} / ${repoTree.entries.length} 件 ｜ 圧縮前 ${formatBytes(bytes)}`
      + ` ｜ 推定 最大 ${eta}（zip 後は縮むため実際はこれより短くなります）`;
  }

  function renderRepoFileList() {
    if (!repoTree) return;
    const rows = filteredRepoEntries();
    const frag = document.createDocumentFragment();
    for (const e of rows.slice(0, REPO_ROW_CAP)) {
      const row = document.createElement('label');
      row.className = 'repo-file-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = repoSelected.has(e.path);
      cb.addEventListener('change', () => {
        if (cb.checked) repoSelected.add(e.path);
        else repoSelected.delete(e.path);
        updateRepoSummary();
      });
      const path = document.createElement('span');
      path.className = 'repo-file-path';
      path.textContent = e.path;
      const size = document.createElement('span');
      size.className = 'repo-file-size';
      size.textContent = formatBytes(e.size);
      row.append(cb, path);
      if (repoTree.dates) {
        const iso = repoTree.dates.get(e.path);
        const date = document.createElement('span');
        date.className = 'repo-file-date';
        date.textContent = iso ? formatRepoDate(iso) : '日付不明';
        row.appendChild(date);
      }
      row.appendChild(size);
      frag.appendChild(row);
    }
    repoFileList.textContent = '';
    repoFileList.appendChild(frag);
    if (rows.length > REPO_ROW_CAP) {
      const more = document.createElement('div');
      more.className = 'hint';
      more.textContent = `他 ${rows.length - REPO_ROW_CAP} 件は表示していません（絞り込んでください）`;
      repoFileList.appendChild(more);
    }
    updateRepoSummary();
  }

  async function loadRepoTree() {
    const spec = parseRepoSpec(sendRepoUrl.value);
    if (!spec) {
      repoTreeStatus.textContent = 'GitHub URL または owner/repo[@ref] を入力してください';
      return;
    }
    btnRepoLoad.disabled = true;
    repoTreeStatus.textContent = '取得中…';
    try {
      repoTree = await fetchRepoTree(spec, (msg) => { repoTreeStatus.textContent = msg; });
    } catch (err) {
      clearRepoTree(`取得失敗: ${err.message}`);
      return;
    } finally {
      btnRepoLoad.disabled = false;
    }
    repoSelected = new Set(repoTree.entries.map((e) => e.path));   // 既定は全選択
    repoFilter.value = '';
    repoSort.value = 'path';
    repoSort.disabled = false;
    repoPicker.hidden = false;
    repoTreeStatus.textContent = repoTree.truncated
      ? `⚠ ${repoTree.owner}/${repoTree.repo}@${repoTree.ref}: ツリーが大きすぎて切り詰められています（一部のみ）`
      : `${repoTree.owner}/${repoTree.repo}@${repoTree.ref}`;
    renderRepoFileList();
  }

  btnRepoLoad.addEventListener('click', loadRepoTree);
  repoFilter.addEventListener('input', renderRepoFileList);
  repoSort.addEventListener('change', () => {
    renderRepoFileList();
    if (repoSort.value !== 'path') ensureRepoDates();
  });
  btnRepoAll.addEventListener('click', () => {
    for (const e of filteredRepoEntries()) repoSelected.add(e.path);
    renderRepoFileList();
  });
  btnRepoNone.addEventListener('click', () => {
    for (const e of filteredRepoEntries()) repoSelected.delete(e.path);
    renderRepoFileList();
  });

  // ----------------------------------------------------------------------
  // Image compression (send side)
  // ----------------------------------------------------------------------
  // QR転送は容量がそのまま所要時間になる（スマホの写真は数MBあり、既定設定
  // では数十分かかって現実的でない）。画像を選んだときだけ、縮小して再
  // エンコードしてから送れるようにする。

  // 縦横それぞれに掛ける倍率。画素数はこの2乗（50% なら 1/4）になる。
  // 画質は倍率と独立に固定する（比率だけを選ばせるための単純化）。
  const IMG_SCALES = { '75': 0.75, '50': 0.5, '25': 0.25 };
  const IMG_QUALITY = 0.8;

  // WebP は透過を保てて JPEG より小さいが、canvas から書き出せない環境が
  // ある。1x1 を実際にエンコードして一度だけ判定する。
  let webpEncodable = null;
  function canEncodeWebp() {
    if (webpEncodable === null) {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      webpEncodable = c.toDataURL('image/webp').startsWith('data:image/webp');
    }
    return webpEncodable;
  }

  function isImageFile(f) {
    return !!f && /^image\//i.test(f.type || '');
  }

  function replaceExt(name, ext) {
    const base = String(name || '').replace(/\.[^./\\]+$/, '');
    return `${base || 'image'}.${ext}`;
  }

  // EXIF の向きは createImageBitmap / <img> のどちらでも反映される。
  async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (_) { /* オプション非対応などは <img> に落とす */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('エンコードに失敗しました'))),
        mime,
        quality,
      );
    });
  }

  async function compressImage(file, level) {
    const scale = IMG_SCALES[level];
    if (!scale) return null;

    const src = await decodeImage(file);
    // close() 後は ImageBitmap の width/height が 0 になるので先に控える
    const srcWidth = src.width;
    const srcHeight = src.height;
    const w = Math.max(1, Math.round(srcWidth * scale));
    const h = Math.max(1, Math.round(srcHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const mime = canEncodeWebp() ? 'image/webp' : 'image/jpeg';
    // JPEG は透過を持てないので、抜けが黒くならないよう白で敷いておく
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    if (typeof src.close === 'function') src.close();

    const blob = await canvasToBlob(canvas, mime, IMG_QUALITY);
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime,
      name: replaceExt(file.name, mime === 'image/webp' ? 'webp' : 'jpg'),
      width: w,
      height: h,
      srcWidth,
      srcHeight,
    };
  }

  // 圧縮結果を File ごとに覚えておく。プレビュー表示と実送信、さらに複数
  // ファイル選択時の各行の描画で、同じ画像を何度もエンコードしないため。
  // result が null なら「元のまま送る」（縮まらなかった・失敗した場合）。
  const imgPrepCache = new Map();   // File -> { level, result }
  let imgPrepSeq = 0;

  function imgPrepCached(file, level) {
    const hit = imgPrepCache.get(file);
    return !!hit && hit.level === level;
  }

  // sendFiles から外れた File のキャッシュは捨てる（File を掴み続けない）
  function pruneImgPrepCache(keep) {
    for (const f of imgPrepCache.keys()) if (!keep.has(f)) imgPrepCache.delete(f);
  }

  async function prepareSendFile(file, level) {
    if (!isImageFile(file) || !IMG_SCALES[level]) return null;
    if (imgPrepCached(file, level)) return imgPrepCache.get(file).result;
    const result = await compressImage(file, level);
    // 元がすでに最適化済みだと逆に膨らむことがある。その場合は元を送る。
    const usable = result && result.bytes.length < file.size ? result : null;
    imgPrepCache.set(file, { level, result: usable });
    return usable;
  }

  function describeEta(bytes) {
    const s = settingsFromInputs();
    return `推定 ${formatDuration(estimateSeconds(bytes, s.chunkSize, s.fps))}`;
  }

  // ------------------------------------------------------------------
  // 送信ファイルの選択（複数可）
  // ------------------------------------------------------------------
  // input.files は読み取り専用で1件だけ外すことができないため、選択状態は
  // こちらの配列を正とし、input は「追加する」ためだけに使う。2件以上に
  // なったら zip にまとめて1つのデータとして送る。

  let sendFiles = [];

  const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;

  function addSendFiles(list) {
    const seen = new Set(sendFiles.map(fileKey));
    for (const f of list) {
      if (seen.has(fileKey(f))) continue;   // 同じファイルの二重追加を防ぐ
      seen.add(fileKey(f));
      sendFiles.push(f);
    }
    pruneImgPrepCache(new Set(sendFiles));
  }

  // zip 内でファイル名が衝突しないようにする（別フォルダの同名ファイルなど）
  function uniqueZipName(name, used) {
    if (!used.has(name)) { used.add(name); return name; }
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 2; ; i++) {
      const cand = `${stem} (${i})${ext}`;
      if (!used.has(cand)) { used.add(cand); return cand; }
    }
  }

  function zipBundleName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `files-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
      + `-${p(d.getHours())}${p(d.getMinutes())}.zip`;
  }

  // 各ファイルについて「実際に送る形」を用意する。画像は縮小後、それ以外と
  // 縮小できなかった画像は compressed = null（元のまま送る）。
  async function prepareAllSendFiles(level) {
    const out = [];
    for (const file of sendFiles) {
      let compressed = null;
      try {
        compressed = await prepareSendFile(file, level);
      } catch (_) { /* 圧縮できなければ元のまま送る */ }
      out.push({ file, compressed });
    }
    return out;
  }

  const sentBytesOf = (p) => (p.compressed ? p.compressed.bytes.length : p.file.size);

  function renderSendFileRows(prepared) {
    sendFileList.textContent = '';
    const frag = document.createDocumentFragment();
    sendFiles.forEach((file, i) => {
      const row = document.createElement('div');
      row.className = 'send-file-row';

      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'send-file-remove';
      rm.textContent = '✕';
      rm.title = 'この1件を外す';
      rm.disabled = sendFile.disabled;
      rm.addEventListener('click', () => {
        sendFiles.splice(i, 1);
        pruneImgPrepCache(new Set(sendFiles));
        refreshSendFileInfo();
      });

      const name = document.createElement('span');
      name.className = 'send-file-path';
      name.textContent = file.name;

      const size = document.createElement('span');
      size.className = 'send-file-size';
      const p = prepared && prepared[i];
      size.textContent = p && p.compressed
        ? `${formatBytes(file.size)} → ${formatBytes(p.compressed.bytes.length)}`
        : formatBytes(file.size);

      row.append(rm, name, size);
      frag.appendChild(row);
    });
    sendFileList.appendChild(frag);
    sendFileList.hidden = sendFiles.length === 0;
    sendFileTools.hidden = sendFiles.length === 0;
  }

  // 送信サイズと推定転送時間まで出すことで、「送り始めてから終わらないことに
  // 気づく」のを防ぐ。
  async function refreshSendFileInfo() {
    const level = cfg.imgCompress.value;
    imgCompressField.hidden = !sendFiles.some(isImageFile);

    if (sendFiles.length === 0) {
      renderSendFileRows(null);
      sendFileInfo.textContent = 'ファイル未選択';
      return;
    }

    const seq = ++imgPrepSeq;
    const pending = sendFiles.some((f) => isImageFile(f) && IMG_SCALES[level] && !imgPrepCached(f, level));
    renderSendFileRows(null);
    if (pending) sendFileInfo.textContent = '圧縮中…';

    const prepared = await prepareAllSendFiles(level);
    if (seq !== imgPrepSeq) return;   // 待っている間に選択が変わった
    renderSendFileRows(prepared);

    const total = prepared.reduce((n, p) => n + sentBytesOf(p), 0);

    if (prepared.length === 1) {
      const { file, compressed } = prepared[0];
      const head = `${file.name}（${formatBytes(file.size)}${file.type ? ', ' + file.type : ''}）`;
      if (!compressed) {
        sendFileInfo.textContent = `${head}\n${describeEta(total)}`;
        return;
      }
      const saved = Math.round((1 - compressed.bytes.length / file.size) * 100);
      sendFileInfo.textContent =
        `${head}\n${compressed.srcWidth}×${compressed.srcHeight} → ${compressed.width}×${compressed.height}（${level}%）`
        + `\n→ ${formatBytes(compressed.bytes.length)}（-${saved}%, ${compressed.mime}）｜ ${describeEta(total)}`;
      return;
    }

    // 複数選択時は zip にまとめる。zip 後は縮むので推定は上限として示す。
    const cfgNow = settingsFromInputs();
    const eta = formatDuration(estimateSeconds(total, cfgNow.chunkSize, cfgNow.fps));
    sendFileInfo.textContent =
      `${prepared.length} 件を zip にまとめて送信します`
      + `\n圧縮前 計 ${formatBytes(total)} ｜ 推定 最大 ${eta}`
      + `（zip 後は縮むため実際はこれより短くなります）`;
  }

  // ---------- テキストの送信量と推定時間 ----------
  // ファイルと同じく、送る前に「何枚・何秒か」を出す。テキストは圧縮が
  // よく効くので、実際に送る形（圧縮後）で数える。入力のたびに圧縮すると
  // 重いので少し待ってからまとめて計算する。
  let textInfoTimer = null;
  function scheduleTextInfo() {
    clearTimeout(textInfoTimer);
    textInfoTimer = setTimeout(refreshTextInfo, 250);
  }

  function refreshTextInfo() {
    const text = sendInput.value;
    if (!text) { sendTextInfo.textContent = ''; return; }
    const body = new TextEncoder().encode(text);
    const blob = buildBlobBytes({ kind: 'text', name: 'message.txt' }, body);
    const s = settingsFromInputs();
    const { wire, compressed } = prepareWire(blob, { kind: 'text' }, s.protocol);
    const frames = estimateFrames(wire.length, s.chunkSize);
    sendTextInfo.textContent =
      `${formatBytes(body.length)}${compressed ? ` → 圧縮後 ${formatBytes(wire.length)}` : ''}`
      + ` ｜ ${frames}枚 ｜ 推定 ${formatDuration(estimateSeconds(wire.length, s.chunkSize, s.fps))}`
      + (s.protocol === 'v2' ? ' ｜ 旧形式' : '');
  }

  sendInput.addEventListener('input', scheduleTextInfo);

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
      if (sendFiles.length === 0) throw new Error('ファイルを選択してください');
      const prepared = await prepareAllSendFiles(cfg.imgCompress.value);

      // 1件だけなら zip で包まず、そのファイルとして送る
      if (prepared.length === 1) {
        const { file, compressed } = prepared[0];
        if (compressed) {
          return {
            manifest: { kind: 'file', name: compressed.name, mime: compressed.mime },
            body: compressed.bytes,
          };
        }
        return {
          manifest: {
            kind: 'file',
            name: file.name,
            mime: file.type || 'application/octet-stream',
          },
          body: new Uint8Array(await file.arrayBuffer()),
        };
      }

      const used = new Set();
      const entries = {};
      for (const { file, compressed } of prepared) {
        const name = uniqueZipName(compressed ? compressed.name : file.name, used);
        entries[name] = compressed
          ? compressed.bytes
          : new Uint8Array(await file.arrayBuffer());
      }
      return {
        manifest: { kind: 'file', name: zipBundleName(), mime: 'application/zip' },
        body: fflate.zipSync(entries, { level: 6 }),
      };
    }
    if (mode === 'repo') {
      const spec = parseRepoSpec(sendRepoUrl.value);
      if (!spec) throw new Error('GitHub URL または owner/repo[@ref] を入力してください');
      // 一覧を取得済みで、それが今のURLと一致していれば選択分だけを送る。
      // 未取得なら従来どおり全ファイル（fetchRepoAsZip が自分でツリーを取る）。
      let picked;
      if (repoTreeMatches(spec)) {
        picked = selectedRepoEntries();
        if (picked.length === 0) throw new Error('送信するファイルが選択されていません');
      }
      const { body, manifest } = await fetchRepoAsZip(
        picked ? { owner: repoTree.owner, repo: repoTree.repo, ref: repoTree.ref } : spec,
        (msg) => { sendStatus.textContent = msg; },
        picked,
      );
      return { manifest, body };
    }
    throw new Error(`不明なモード: ${mode}`);
  }

  function estimateFrames(bytes, chunkSize, protocol = cfg.protocol.value) {
    if (protocol === 'v2') return Math.max(1, Math.ceil((Math.ceil(bytes / 3) * 4) / chunkSize));
    return Math.max(1, Math.ceil(bytes / rawBytesPerFrame(chunkSize)));
  }

  // 一度に表示する枚数。旧形式は旧受信側（jsQR・1枚ずつ）向けなので常に1枚
  function multiPerTick(s = settingsFromInputs()) {
    return s.protocol === 'v2' ? 1 : +s.multi;
  }

  function estimateSeconds(bytes, chunkSize, fps) {
    return Math.max(1, Math.ceil(estimateFrames(bytes, chunkSize) / (fps * multiPerTick())));
  }

  function formatDuration(sec) {
    if (sec < 60) return `${sec}秒`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}分${s}秒`;
  }

  // ----------------------------------------------------------------------
  // Screen wake lock
  // ----------------------------------------------------------------------
  // QRを表示している間も、カメラでスキャンしている間も、画面が消えると転送が
  // 途切れる。要求元は複数（送信ループ・受信スキャン・QRブリッジ）あって同時に
  // 走りうるので、理由の集合で参照カウントし、1つでも残っていれば保持する。
  //
  // ロックはOS都合（タブ非表示・低電力モード・低バッテリー）でいつでも解放
  // されるため、release イベントと復帰系イベントの両方から取り直す。
  // なお Safari は iOS 16.4 未満では非対応、ホーム画面に追加したアプリでは
  // iOS 18.4 未満で取得できず、HTTPS 以外(secure context 外)ではそもそも API が
  // 生えない。黙って失敗すると「なぜか画面が消える」だけが残るので警告を出す。

  const WAKE_LOCK_UNSUPPORTED_MSG =
    'この環境では画面スリープを抑止できません（Screen Wake Lock 非対応）。'
    + 'HTTPS でない場合は HTTPS 経由で、iOS の場合は 16.4 以降の Safari で開いてください。'
    + '転送中は端末の自動ロックを一時的にオフにすることをおすすめします。';
  const WAKE_LOCK_FAILED_MSG =
    '画面スリープの抑止が解除されました（低電力モードや電池残量が原因の場合があります）。'
    + '転送中は端末の自動ロックを一時的にオフにすることをおすすめします。';

  let wakeLock = null;
  const wakeLockReasons = new Set();

  async function acquireWakeLock() {
    if (!wakeLockReasons.size) return;
    if (wakeLock && !wakeLock.released) return;
    if (!('wakeLock' in navigator)) {
      wakeLockWarn.textContent = WAKE_LOCK_UNSUPPORTED_MSG;
      wakeLockWarn.hidden = false;
      return;
    }
    // 非表示中の request は必ず失敗するので、復帰イベント側で拾い直す
    if (document.visibilityState !== 'visible') return;

    let sentinel;
    try {
      sentinel = await navigator.wakeLock.request('screen');
    } catch (_) {
      wakeLock = null;
      wakeLockWarn.textContent = WAKE_LOCK_FAILED_MSG;
      wakeLockWarn.hidden = false;
      return;
    }
    // await 中に全ての要求元が停止していたら、取得したものはそのまま返す
    if (!wakeLockReasons.size) {
      sentinel.release().catch(() => {});
      return;
    }
    wakeLock = sentinel;
    wakeLockWarn.hidden = true;

    const acquiredAt = Date.now();
    sentinel.addEventListener('release', () => {
      if (wakeLock === sentinel) wakeLock = null;
      if (!wakeLockReasons.size) return;          // 自前の解放
      if (Date.now() - acquiredAt < 1000) {
        // 取得直後に落とされる＝OSが拒否している。取り直すと無限ループになる。
        wakeLockWarn.textContent = WAKE_LOCK_FAILED_MSG;
        wakeLockWarn.hidden = false;
        return;
      }
      if (document.visibilityState === 'visible') acquireWakeLock();
    });
  }

  function requestWakeLock(reason) {
    wakeLockReasons.add(reason);
    acquireWakeLock();
  }

  function releaseWakeLock(reason) {
    wakeLockReasons.delete(reason);
    if (wakeLockReasons.size) return;   // 別の用途がまだ画面を必要としている
    wakeLockWarn.hidden = true;
    const sentinel = wakeLock;
    wakeLock = null;
    if (sentinel) sentinel.release().catch(() => {});
  }

  // iOS では画面ロックからの復帰で visibilitychange が発火しないことがあるため
  // focus / pageshow からも取り直す。acquireWakeLock は冪等なので重複してよい。
  const reacquireWakeLock = () => {
    if (document.visibilityState === 'visible') acquireWakeLock();
  };
  document.addEventListener('visibilitychange', reacquireWakeLock);
  window.addEventListener('focus', reacquireWakeLock);
  window.addEventListener('pageshow', reacquireWakeLock);

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
  let sendLoops = 0;        // 何周目か（受信側が何周待てばよいかの目安）
  let sendMulti = 1;        // 1回の切り替えで並べる枚数（1 / 2 / 4）

  function clearSendTimer() {
    if (sendTimer) { clearInterval(sendTimer); sendTimer = null; }
  }

  // Draws the frame at the current sendIndex, then advances sendIndex to
  // the next one. Shared by the auto-loop timer and the manual step
  // buttons below, so a manual step and an auto-tick behave identically.
  function sendTick() {
    const len = sendActive.length;
    const n = Math.min(sendMulti, len);
    const shown = [];
    for (let j = 0; j < n; j++) shown.push(sendActive[(sendIndex + j) % len]);
    try {
      if (sendMulti === 1) drawQrToCanvas(qrCanvas, sendAllFrames[shown[0]], sendRenderOpts);
      else drawQrGrid(qrCanvas, shown.map((i) => sendAllFrames[i]), sendRenderOpts, sendMulti);
    } catch (err) {
      sendStatus.textContent = `QR生成エラー: ${err.message}（typeNumber を上げるかチャンクサイズを下げてください）`;
      stopSend();
      return;
    }
    const total = sendAllFrames.length;
    const subsetLabel = sendActive.length === total
      ? ''
      : ` ｜ 範囲 ${sendActive.length}枚`;
    sendStatus.textContent = `送信中 ${sendLoops}周目${subsetLabel}`;
    const first = shown[0] + 1;
    const last = shown[shown.length - 1] + 1;
    sendFrameNo.textContent = n === 1 ? `${first} / ${total}`
      : n === 2 ? `${first}・${last} / ${total}`
      : `${first}〜${last} / ${total}`;
    const next = sendIndex + n;
    if (next >= len) sendLoops++;
    sendIndex = next % len;
  }

  function startSendLoop() {
    clearSendTimer();
    sendIndex = 0;
    sendLoops = 1;
    if (!sendActive.length) {
      sendStatus.textContent = '送信対象がありません';
      return;
    }
    sendTick();
    sendTimer = setInterval(sendTick, sendTickMs);
  }

  // ---------- Manual step (早送り / 巻き戻し) ----------------------------
  // sendIndex always points at the frame that will be drawn on the *next*
  // tick (sendTick draws-then-advances), so stepping forward is just an
  // extra tick; stepping back needs to rewind past both the frame already
  // shown and the one sendTick would show next.
  function stepSendForward() {
    if (!sendTimer || !sendActive.length) return;
    clearSendTimer();
    sendTick();
    sendTimer = setInterval(sendTick, sendTickMs);
  }

  function stepSendBackward() {
    if (!sendTimer || !sendActive.length) return;
    const len = sendActive.length;
    const n = Math.min(sendMulti, len);
    sendIndex = ((sendIndex - 2 * n) % len + len) % len;
    clearSendTimer();
    sendTick();
    sendTimer = setInterval(sendTick, sendTickMs);
  }

  // Runs `stepFn` once immediately on press, then repeatedly while the
  // button stays pressed (pointer held down), so 早送り/巻き戻し keep
  // moving for as long as the user holds them, not just a single step.
  function bindHoldToStep(button, stepFn) {
    const HOLD_DELAY_MS = 400;
    const HOLD_REPEAT_MS = 65;
    let holdTimeout = null;
    let holdInterval = null;

    function stopHold() {
      if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null; }
      if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
    }

    button.addEventListener('pointerdown', (ev) => {
      if (button.disabled) return;
      button.setPointerCapture(ev.pointerId);
      stepFn();
      holdTimeout = setTimeout(() => {
        holdInterval = setInterval(stepFn, HOLD_REPEAT_MS);
      }, HOLD_DELAY_MS);
    });
    button.addEventListener('pointerup', stopHold);
    button.addEventListener('pointercancel', stopHold);
    button.addEventListener('pointerleave', stopHold);
  }

  bindHoldToStep(btnSendPrev, stepSendBackward);
  bindHoldToStep(btnSendNext, stepSendForward);

  // ---------- 全画面表示 ----------
  // QRが大きいほど遠くから・斜めからでも読めて、取りこぼしが減る。iPhone の
  // Safari は要素の Fullscreen API に対応しないので、CSS の固定配置で画面を
  // 覆い、使える環境ではブラウザのUIも消すために Fullscreen API も併用する。
  function setSendFocus(on) {
    const isOn = sendStage.classList.contains('is-focus');
    if (on === isOn) return;
    sendStage.classList.toggle('is-focus', on);
    document.body.classList.toggle('no-scroll', on);
    btnSendFocus.textContent = on ? '✕' : '⛶';
    btnSendFocus.setAttribute('aria-label', on ? '全画面表示を終了' : '全画面表示');
    if (on) {
      if (sendStage.requestFullscreen && !document.fullscreenElement) {
        sendStage.requestFullscreen().catch(() => {});
      }
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  btnSendFocus.addEventListener('click', () => {
    setSendFocus(!sendStage.classList.contains('is-focus'));
  });
  // 戻るジェスチャや Esc でブラウザ側の全画面だけが解除された場合も合わせる
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) setSendFocus(false);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') setSendFocus(false);
  });

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
    sendStatus.textContent = '準備中…';
    // 大きいファイルの圧縮は同期処理で数百msかかるので、先に表示を更新させる
    await new Promise((r) => setTimeout(r, 0));
    const legacy = s.protocol === 'v2';
    const { wire, compressed } = prepareWire(blob, gathered.manifest, s.protocol);
    const eta = estimateSeconds(wire.length, s.chunkSize, s.fps);
    const sizeLabel = compressed
      ? `${formatBytes(wire.length)}（圧縮前 ${formatBytes(blob.length)}）`
      : formatBytes(wire.length);
    const proceed = wire.length > LARGE_TRANSFER_BYTES
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
      frames = legacy
        ? encodeFramesLegacy(wire, s.chunkSize).frames
        : encodeFrames(wire, s.chunkSize).frames;
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
        typeNumber = resolveTypeNumber(frames, s.ecc, legacy ? 'Byte' : 'Alphanumeric');
      } catch (err) {
        sendStatus.textContent = `QR生成エラー: ${err.message}（チャンクサイズを下げてください）`;
        btnSendStart.disabled = false;
        sendBusy = false;
        sendAllFrames = [];
        return;
      }
    }

    sendRenderOpts = {
      typeNumber, ecc: s.ecc, cellSize: s.cellSize, margin: s.margin,
      mode: legacy ? 'Byte' : 'Alphanumeric',
    };
    sendTickMs = Math.max(50, Math.round(1000 / s.fps));
    sendMeta = { kind: gathered.manifest.kind, sizeLabel };
    sendMulti = multiPerTick(s);
    qrWrap.classList.toggle('layout-2', sendMulti === 2);
    qrWrap.classList.toggle('layout-4', sendMulti === 4);

    const KIND_LABEL = { text: 'テキスト', file: 'ファイル', repo: 'リポジトリ' };
    sendSummary.textContent =
      `${KIND_LABEL[gathered.manifest.kind] || gathered.manifest.kind}：${gathered.manifest.name}`
      + ` ｜ ${sizeLabel} ｜ ${frames.length}枚 ｜ 1周 約${formatDuration(Math.max(1, Math.ceil(frames.length / (s.fps * sendMulti))))}`
      + (sendMulti > 1 ? ` ｜ 同時${sendMulti}枚` : '')
      + (legacy ? ' ｜ 旧形式（互換）' : '');

    // Honor any pre-filled range; fall back to all on parse error
    if (!applyRangeFromInput()) {
      sendActive = Array.from({ length: sendAllFrames.length }, (_, i) => i);
    }

    btnSendStop.disabled = false;
    btnSendPrev.disabled = false;
    btnSendNext.disabled = false;
    btnSendFocus.disabled = false;
    setSendInputsDisabled(true);
    // 入力欄を畳んで要約に置き換え、QRが1画面に収まるようにする
    sendSetup.hidden = true;
    sendSummary.hidden = false;
    requestWakeLock('send');
    startSendLoop();
    sendStage.scrollIntoView({ block: 'nearest' });
  }

  function stopSend() {
    clearSendTimer();
    releaseWakeLock('send');
    btnSendStart.disabled = false;
    btnSendStop.disabled = true;
    btnSendPrev.disabled = true;
    btnSendNext.disabled = true;
    btnSendFocus.disabled = true;
    setSendFocus(false);
    setSendInputsDisabled(false);
    sendSetup.hidden = false;
    sendSummary.hidden = true;
    sendBusy = false;
    if (sendAllFrames.length) {
      sendStatus.textContent = `停止（${sendAllFrames.length}枚生成済み）`;
    } else {
      sendStatus.textContent = '待機中';
    }
    sendAllFrames = [];
    sendActive = [];
    sendFrameNo.textContent = '— / —';
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
    cfg.imgCompress.disabled = disabled;
    btnSendFilesClear.disabled = disabled;
    for (const b of sendFileList.querySelectorAll('.send-file-remove')) b.disabled = disabled;
    sendRepoUrl.disabled = disabled;
    btnRepoLoad.disabled = disabled;
    repoFilter.disabled = disabled;
    btnRepoAll.disabled = disabled;
    btnRepoNone.disabled = disabled;
    for (const cb of repoFileList.querySelectorAll('input')) cb.disabled = disabled;
    for (const b of modeButtons) b.disabled = disabled;
  }

  btnSendStart.addEventListener('click', startSend);
  btnSendStop.addEventListener('click', stopSend);

  // ----------------------------------------------------------------------
  // Receive
  // ----------------------------------------------------------------------

  let stream = null;
  let scanEngine = null;
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
    recvMissingCount.textContent = '';
    recvMissingText = '';
    recvGrid.classList.remove('is-dense');
    btnCopyMissing.disabled = true;
    btnShowMissingQr.disabled = true;
    hideRecvFrameNo();
  }

  // ---------- 読み取り中のQR番号（カメラ映像に重ねて表示） ----------
  // 重複フレームも含め、読めた瞬間の番号を出す。新規受信のときだけ一瞬
  // 色を変えて「今のは取れた」が分かるようにする。
  let recvFrameNoFlash = null;

  function showRecvFrameNo(frame, isNew) {
    recvFrameNo.textContent = `#${frame.index + 1} / ${frame.total}`;
    recvFrameNo.hidden = false;
    if (isNew) {
      recvFrameNo.classList.add('is-new');
      clearTimeout(recvFrameNoFlash);
      recvFrameNoFlash = setTimeout(() => recvFrameNo.classList.remove('is-new'), 300);
    }
  }

  function hideRecvFrameNo() {
    clearTimeout(recvFrameNoFlash);
    recvFrameNoFlash = null;
    recvFrameNo.classList.remove('is-new');
    recvFrameNo.hidden = true;
    recvFrameNo.textContent = '';
  }

  // 未受信リストの再計算は総数に比例するので、読み取りのたびではなく
  // 描画1回につき1度にまとめる（スキャン処理の邪魔をしない）。
  let missingDisplayRaf = null;
  function scheduleMissingDisplay() {
    if (missingDisplayRaf) return;
    missingDisplayRaf = requestAnimationFrame(() => {
      missingDisplayRaf = null;
      updateMissingDisplay();
    });
  }

  // 未受信番号の全文。画面には長すぎる分を省いて出すので、コピーと
  // 「QRで送る」はこちらを使う。
  let recvMissingText = '';
  const MISSING_DISPLAY_MAX = 160;

  function updateMissingDisplay() {
    if (!recvState) return;
    const missing = [];
    for (let i = 0; i < recvState.total; i++) {
      if (recvState.chunks[i] == null) missing.push(i);
    }
    if (missing.length === 0) {
      recvMissingText = '';
      recvMissingList.textContent = '（全て受信済み）';
      recvMissingCount.textContent = '';
      recvMissingRow.classList.add('is-complete');
      btnCopyMissing.disabled = true;
      btnShowMissingQr.disabled = true;
    } else {
      recvMissingText = formatIndexRanges(missing);
      // 飛び飛びの欠けが多いと数万文字になり画面が埋まるので先頭だけ出す
      recvMissingList.textContent = recvMissingText.length > MISSING_DISPLAY_MAX
        ? recvMissingText.slice(0, Math.max(1, recvMissingText.lastIndexOf(',', MISSING_DISPLAY_MAX))) + ', …'
        : recvMissingText;
      recvMissingCount.textContent = `（${missing.length}件）`;
      recvMissingRow.classList.remove('is-complete');
      btnCopyMissing.disabled = false;
      btnShowMissingQr.disabled = false;
    }
    recvMissingRow.hidden = false;
  }

  function initRecvSession(version, sessionId, total) {
    recvState = {
      version,
      sessionId,
      total,
      chunks: new Array(total),
      gotCount: 0,
      firstAt: 0,
    };
    recvProgress.max = total;
    recvProgress.value = 0;
    recvGrid.innerHTML = '';
    recvGrid.classList.toggle('is-dense', total > 300);
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
    if (!recvState || recvState.version !== frame.version
        || recvState.sessionId !== frame.sessionId || recvState.total !== frame.total) {
      // 受信し終えた結果は、カメラに別のQRが映っても消さない（「クリア」で消す）
      if (recvState && recvState.done) return;
      initRecvSession(frame.version, frame.sessionId, frame.total);
    }
    if (recvState.done) return;
    const isNew = recvState.chunks[frame.index] == null;
    showRecvFrameNo(frame, isNew);
    if (!isNew) return;
    const now = performance.now();
    if (!recvState.firstAt) recvState.firstAt = now;
    recvState.chunks[frame.index] = frame.payload;
    recvState.gotCount += 1;
    recvProgress.value = recvState.gotCount;
    const elapsed = (now - recvState.firstAt) / 1000;
    const pace = elapsed >= 1 ? ` ｜ ${(recvState.gotCount / elapsed).toFixed(1)}枚/秒` : '';
    recvStatus.textContent = `受信 ${recvState.gotCount} / ${recvState.total}${pace}`;
    const cell = recvGrid.children[frame.index];
    if (cell) cell.classList.add('got');
    scheduleMissingDisplay();

    if (recvState.gotCount === recvState.total) finishRecv(elapsed);
  }

  // 全チャンクがそろったら復元し、カメラを止めて結果を見せる
  function finishRecv(elapsed) {
    recvState.done = true;
    let result;
    try {
      result = assembleRecv(recvState);
    } catch (err) {
      // 壊れた状態を残すと同じセッションのQRを読んでも先に進めないので捨てる
      stopRecv();
      resetRecvState();
      recvStatus.textContent = `復号エラー: ${err.message}`;
      return;
    }
    presentResult(result.manifest, result.body);
    updateMissingDisplay();
    stopRecv();
    recvStatus.textContent =
      `完了 ${recvState.total}枚 ｜ ${formatBytes(result.body.length)} ｜ ${formatDuration(Math.max(1, Math.round(elapsed)))}`;
    if (navigator.vibrate) navigator.vibrate(200);
    recvResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function assembleRecv(st) {
    if (st.version === 2) {
      return parseBlobBytes(base64ToBytes(st.chunks.join('')));
    }
    let len = 0;
    for (const c of st.chunks) len += c.length;
    const wire = new Uint8Array(len);
    let o = 0;
    for (const c of st.chunks) { wire.set(c, o); o += c.length; }
    const raw = st.total > 1 ? st.chunks[0].length : 0;
    if (sessionIdFor(wire, raw, st.total) !== st.sessionId) {
      throw new Error('検証に失敗しました（別の送信のQRが混ざった可能性があります。もう一度カメラを開始してください）');
    }
    return parseBlobBytes(unwrapWireBytes(wire));
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
    if (stream || btnRecvStart.disabled) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      recvStatus.textContent = 'このブラウザはカメラAPIに対応していません';
      httpsWarn.hidden = false;
      return;
    }
    // 権限ダイアログ待ちの間の連打で、カメラを二重に開かないようにする
    btnRecvStart.disabled = true;
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
      btnRecvStart.disabled = false;
      return;
    }

    cam.srcObject = stream;
    await cam.play().catch(() => {});
    cam.parentElement.classList.add('is-live');

    btnRecvStop.disabled = false;
    // 受信済みの結果は残したまま、次の送信も受け付けられるようにする
    // （新しいセッションのQRが映った時点で前の結果は置き換わる）
    if (recvState && recvState.done) recvState.done = false;
    recvStatus.textContent = 'スキャン中…';
    // カメラプレビュー中に画面が保たれる保証はどのOSにも無く、受信側が寝ると
    // 転送そのものが止まるので、送信側と同じくロックを取る。
    requestWakeLock('recv');

    const engine = await startScanEngine({
      video: cam,
      canvas: scanCanvas,
      inversion: s.inversion,
      decoder: s.decoder,
      onData: (text) => {
        const frame = parseFrame(text);
        if (frame) ingestFrame(frame);
      },
    });
    // エンジン準備中に停止された場合は即破棄
    if (!stream) { engine.stop(); return; }
    scanEngine = engine;
  }

  // ---------- 受信スキャンエンジン ----------
  // 送信側は一定間隔でQRを切り替えるので、受信側の解析回数が送信FPSを
  // 十分に上回らないと取りこぼす。jsQR は1枚あたり数十〜数百ms掛かり、
  // しかもメインスレッドを塞ぐため、以下の順で速いものを使う。
  //   1. BarcodeDetector（端末内蔵。Android Chrome 等で高速・別スレッド）
  //   2. Web Worker を複数並列（CPUコア数に応じて解析回数が伸びる）。
  //      各ワーカーは ZXing（WebAssembly）で読み、使えなければ jsQR に戻る
  //   3. jsQR をメインスレッドで（Worker が使えない環境向けの最終手段）
  // 1 と ZXing は1枚の映像に写った複数のQRを読めるので、送信側の同時表示
  // （縦2枚・2×2）に対応する。jsQR は1枚しか読めず、複数写っていると
  // 1枚も読めない。jsQR には映像中央の正方形だけを渡す（約3割速くなる）。

  async function createBarcodeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (!formats.includes('qr_code')) return null;
      return new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      return null;
    }
  }

  async function startScanEngine({ video, canvas, inversion, decoder, onData }) {
    let stopped = false;
    let raf = null;
    let analyzed = 0;
    let mode = 'main';
    let detector = null;
    let workers = [];
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function terminateWorkers() {
      for (const slot of workers) { try { slot.w.terminate(); } catch {} }
      workers = [];
    }

    function startWorkers() {
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
      try {
        for (let i = 0; i < n; i++) {
          const w = new Worker('scan-worker.js');
          const slot = { w, busy: false, dead: false, engine: null };
          w.onmessage = (ev) => {
            slot.busy = false;
            slot.engine = ev.data.engine;
            analyzed++;
            if (!stopped) for (const text of ev.data.datas) onData(text);
          };
          w.onerror = () => {
            // 読み込み失敗など。全滅したらメインスレッドに切り替える
            slot.dead = true;
            slot.busy = false;
            if (workers.every((x) => x.dead)) { terminateWorkers(); mode = 'main'; }
          };
          workers.push(slot);
        }
        mode = 'worker';
      } catch {
        terminateWorkers();
        mode = 'main';
      }
    }

    if (decoder === 'auto') detector = await createBarcodeDetector();
    if (detector) mode = 'native';
    else startWorkers();

    // 映像の画素を取る。full でなければ中央の正方形だけを切り出す
    function grabFrame(full) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const S = Math.min(w, h);
      const cw = full ? w : S;
      const ch = full ? h : S;
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      if (full) ctx.drawImage(video, 0, 0, w, h);
      else ctx.drawImage(video, (w - S) >> 1, (h - S) >> 1, S, S, 0, 0, S, S);
      return ctx.getImageData(0, 0, cw, ch);
    }

    let nativeBusy = false;
    let lastVideoTime = -1;

    const tick = () => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) return;
      // 同じ映像フレームを二重に解析しない
      if (video.currentTime === lastVideoTime) return;

      if (mode === 'native') {
        if (nativeBusy) return;
        nativeBusy = true;
        lastVideoTime = video.currentTime;
        detector.detect(video).then((codes) => {
          nativeBusy = false;
          analyzed++;
          if (stopped) return;
          for (const c of codes) if (c.rawValue) onData(c.rawValue);
        }).catch(() => {
          // 内蔵デコーダが動かない端末だった。jsQR に切り替える
          nativeBusy = false;
          if (mode === 'native' && !stopped) { detector = null; startWorkers(); }
        });
        return;
      }

      if (mode === 'worker') {
        const slot = workers.find((x) => !x.busy && !x.dead);
        if (!slot) return;
        lastVideoTime = video.currentTime;
        // ZXing は速く、同時表示のQRが中央からはみ出しても読めるよう全体を渡す
        const img = grabFrame(slot.engine === 'zxing');
        slot.busy = true;
        slot.w.postMessage(
          { buf: img.data.buffer, w: img.width, h: img.height, inversion, decoder },
          [img.data.buffer]
        );
        return;
      }

      lastVideoTime = video.currentTime;
      const img = grabFrame(false);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: inversion });
      analyzed++;
      if (code && code.data) onData(code.data);
    };
    raf = requestAnimationFrame(tick);

    // 1秒ごとに解析回数を表示（送信側FPSをこれより十分低くすると取りこぼしにくい）
    const label = () => (mode === 'native' ? '内蔵'
      : mode === 'worker'
        ? `${(workers.find((x) => x.engine) || {}).engine === 'zxing' ? 'ZXing' : 'jsQR'}×${workers.filter((x) => !x.dead).length}`
        : 'jsQR');
    recvScanRate.textContent = `解析 —回/秒（${label()}）`;
    recvScanRate.hidden = false;
    const rateTimer = setInterval(() => {
      recvScanRate.textContent = `解析 ${analyzed}回/秒（${label()}）`;
      analyzed = 0;
    }, 1000);

    return {
      stop() {
        if (stopped) return;
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        clearInterval(rateTimer);
        terminateWorkers();
        recvScanRate.hidden = true;
        recvScanRate.textContent = '';
      },
    };
  }

  function stopRecv() {
    if (scanEngine) { scanEngine.stop(); scanEngine = null; }

    releaseWakeLock('recv');
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    cam.srcObject = null;
    cam.parentElement.classList.remove('is-live');
    hideRecvFrameNo();
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
    const txt = recvMissingText;
    if (!txt) return;
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

  // ---------- QR bridge (missing-range side-channel) --------------------
  // The receiver shows its missing-range as a small QR, the sender does a
  // one-shot scan of it. Uses its own canvas/video/stream — never touches
  // sendTimer, scanEngine, or the module-level `stream` — so the main
  // send/receive loops on both devices keep running underneath.

  let qrBridgeStream = null;
  let qrBridgeRaf = null;
  let qrBridgeShowTimer = null;

  // 1枚のQRに収めるメッセージ長。これを超える未受信リストは複数枚に分けて
  // 順に切り替えて表示する（1枚に詰めると容量超過で生成できないか、
  // 密度が高すぎて小さなモーダルでは読めなくなる）。
  const QR_BRIDGE_PART_LEN = 300;
  const QR_BRIDGE_PART_MS = 400;

  // 未受信番号を短い文字列にする。範囲表記（"r..."）と、未受信ビットマップを
  // deflate して base64 にしたもの（"b<total>:..."）の短い方を使う。
  // 飛び飛びの欠落が大量にあると範囲表記は数万文字になるが、ビットマップは
  // 総数/8 バイト以下に収まる。
  function encodeMissingMessage(missing, total) {
    const rangeMsg = 'r' + formatIndexRanges(missing);
    const bits = new Uint8Array(Math.ceil(total / 8));
    for (const i of missing) bits[i >> 3] |= 1 << (i & 7);
    const bitmapMsg = `b${total}:` + bytesToBase64(fflate.deflateSync(bits, { level: 9 }));
    return bitmapMsg.length < rangeMsg.length ? bitmapMsg : rangeMsg;
  }

  function decodeMissingMessage(msg) {
    if (msg[0] === 'r') return msg.slice(1);
    const m = msg.match(/^b(\d+):(.*)$/);
    if (!m) throw new Error('未知の形式です');
    const total = +m[1];
    const bits = fflate.inflateSync(base64ToBytes(m[2]));
    const missing = [];
    for (let i = 0; i < total; i++) {
      if (bits[i >> 3] & (1 << (i & 7))) missing.push(i);
    }
    return formatIndexRanges(missing);
  }

  function closeQrBridge() {
    releaseWakeLock('qrbridge');
    if (qrBridgeShowTimer) { clearInterval(qrBridgeShowTimer); qrBridgeShowTimer = null; }
    qrBridgePart.hidden = true;
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
    const txt = recvMissingText;
    if (!txt) return;
    qrBridgeModal.hidden = false;
    qrBridgeShowWrap.hidden = false;
    qrBridgeScanWrap.hidden = true;
    // 相手が読み取るまでこのQRを出しっぱなしにするので、その間も寝かせない
    requestWakeLock('qrbridge');
    qrBridgeStatus.textContent = '送信端末にこのQRを読み取ってもらってください';

    // 短ければ従来どおり1枚（旧バージョンの送信端末でも読める形式）
    if (txt.length <= QR_BRIDGE_PART_LEN) {
      try {
        drawQrToCanvas(qrBridgeCanvas, `${MISSING_QR_TAG}|${txt}`, {
          typeNumber: 0, ecc: 'M', cellSize: 8, margin: 4,
        });
      } catch (err) {
        qrBridgeStatus.textContent = `QR生成エラー: ${err.message}`;
      }
      return;
    }

    const missing = [];
    for (let i = 0; i < recvState.total; i++) {
      if (recvState.chunks[i] == null) missing.push(i);
    }
    const msg = encodeMissingMessage(missing, recvState.total);
    const n = Math.ceil(msg.length / QR_BRIDGE_PART_LEN);
    const id = newSessionId().slice(0, 4);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const body = msg.slice(i * QR_BRIDGE_PART_LEN, (i + 1) * QR_BRIDGE_PART_LEN);
      parts.push(`${MISSING_QR_MULTI_TAG}|${id}|${i}|${n}|${body}`);
    }
    // 全パートを同じ大きさで描くため、最長のものに合わせて型番を固定する
    let typeNumber;
    try {
      typeNumber = resolveTypeNumber(parts, 'M');
    } catch (err) {
      qrBridgeStatus.textContent = `QR生成エラー: ${err.message}`;
      return;
    }
    const opts = { typeNumber, ecc: 'M', cellSize: 8, margin: 4 };
    let cur = 0;
    const showPart = () => {
      try {
        drawQrToCanvas(qrBridgeCanvas, parts[cur], opts);
      } catch (err) {
        qrBridgeStatus.textContent = `QR生成エラー: ${err.message}`;
        clearInterval(qrBridgeShowTimer);
        qrBridgeShowTimer = null;
        return;
      }
      qrBridgePart.textContent = n > 1 ? `${cur + 1} / ${n}` : '';
      cur = (cur + 1) % n;
    };
    qrBridgePart.hidden = n <= 1;
    if (n > 1) {
      qrBridgeStatus.textContent =
        `送信端末にこのQRを読み取ってもらってください（${n}枚を自動で切り替え表示）`;
    }
    showPart();
    if (n > 1) qrBridgeShowTimer = setInterval(showPart, QR_BRIDGE_PART_MS);
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
    // カメラAPIはセキュアコンテキスト(HTTPS/localhost)でのみ動作する。
    // http://<LAN IP> 等で開いていると getUserMedia が権限プロンプトすら
    // 出さずに即座に失敗するため、既存の受信タブと同じ判定で先に警告する。
    if (!isSecureCameraContext()) {
      qrBridgeModal.hidden = false;
      qrBridgeScanWrap.hidden = false;
      qrBridgeShowWrap.hidden = true;
      qrBridgeStatus.textContent =
        'カメラ起動には HTTPS または http://localhost が必要です。現在のURLでは使用できません。';
      return;
    }
    qrBridgeModal.hidden = false;
    qrBridgeScanWrap.hidden = false;
    qrBridgeShowWrap.hidden = true;
    requestWakeLock('qrbridge');
    qrBridgeStatus.textContent = 'カメラを起動しています…';
    try {
      qrBridgeStream = await requestQrBridgeCamera();
    } catch (err) {
      // モーダルは開いたままエラーを表示する（即座に閉じると一瞬で見えなくなる）
      qrBridgeStatus.textContent = `カメラ起動失敗: ${err.name} ${err.message}`;
      return;
    }
    qrBridgeVideo.srcObject = qrBridgeStream;
    await qrBridgeVideo.play().catch(() => {});
    qrBridgeStatus.textContent = '相手が表示しているQRを読み取ってください';

    const ctx = qrBridgeScanCanvas.getContext('2d', { willReadFrequently: true });
    // 複数枚に分かれた未受信リストの収集状態（表示し直されたら id が変わる）
    let multi = null;
    const finish = (range) => {
      closeQrBridge();
      sendRange.value = range;
      sendStatus.textContent = `受信成功: 範囲 ${range.length > 80 ? range.slice(0, 80) + '…' : range}（「反映」で適用）`;
    };
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
          finish(code.data.slice(MISSING_QR_TAG.length + 1));
          return;
        }
        const m = code && code.data
          && code.data.match(/^QRTN\|([^|]+)\|(\d+)\|(\d+)\|(.*)$/s);
        if (m) {
          const [, id, iStr, nStr, body] = m;
          const i = +iStr, n = +nStr;
          if (n > 0 && i < n) {
            if (!multi || multi.id !== id || multi.n !== n) {
              multi = { id, n, parts: new Array(n), got: 0 };
            }
            if (multi.parts[i] == null) {
              multi.parts[i] = body;
              multi.got++;
              qrBridgeStatus.textContent = `読み取り中… ${multi.got} / ${n} 枚`;
            }
            if (multi.got === n) {
              let range;
              try {
                range = decodeMissingMessage(multi.parts.join(''));
              } catch (err) {
                qrBridgeStatus.textContent = `復号エラー: ${err.message}（もう一度読み取ってください）`;
                multi = null;
                qrBridgeRaf = requestAnimationFrame(scanOnce);
                return;
              }
              finish(range);
              return;
            }
          }
        }
      }
      qrBridgeRaf = requestAnimationFrame(scanOnce);
    };
    qrBridgeRaf = requestAnimationFrame(scanOnce);
  });

  // Ask for the back camera first; some Android devices throw
  // OverconstrainedError on a strict facingMode request (e.g. no camera
  // reports exactly "environment", or only one camera is present), so
  // fall back to an unconstrained video request rather than failing outright.
  async function requestQrBridgeCamera() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
    } catch (err) {
      if (err.name !== 'OverconstrainedError') throw err;
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
  }

  // ----------------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------------

  function init() {
    populateTypeOptions();
    applySettingsToInputs(loadSettings());
    bindSettings();
    applySendMode(currentSendMode());
    lastUpdated.textContent = LAST_UPDATED;
    refreshSendFileInfo();
    refreshTextInfo();
    resetRecvState();
    if (!isSecureCameraContext()) httpsWarn.hidden = false;
  }

  init();
})();
