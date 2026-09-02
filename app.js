(function () {
  'use strict';

  // ----------------------------------------------------------------------
  // Constants
  // ----------------------------------------------------------------------

  const PROTOCOL_TAG = 'QRT2';
  const MISSING_QR_TAG = 'QRTM'; // missing-range side-channel, distinct from data frames
  const STORAGE_KEY = 'qrtt.settings.v1';
  // フッタに出す最終更新日。ビルド工程が無い（index.html を直接開ける）ので
  // 自動埋め込みができない。内容を変更したらここも更新すること。
  const LAST_UPDATED = '2026-09-02';
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
    imgCompress: '50',
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
  const sendStatus = $('sendStatus');
  const qrCanvas = $('qrCanvas');
  const sendRange = $('sendRange');
  const btnRangeApply = $('btnRangeApply');
  const btnRepoLoad = $('btnRepoLoad');
  const repoTreeStatus = $('repoTreeStatus');
  const repoPicker = $('repoPicker');
  const repoFilter = $('repoFilter');
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
  const btnCopyMissing = $('btnCopyMissing');
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
    imgCompress: $('cfgImgCompress'),
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
      imgCompress: cfg.imgCompress.value,
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
    cfg.imgCompress.value = s.imgCompress;
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
    return q ? all.filter((e) => e.path.toLowerCase().includes(q)) : all;
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
      row.append(cb, path, size);
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
    repoPicker.hidden = false;
    repoTreeStatus.textContent = repoTree.truncated
      ? `⚠ ${repoTree.owner}/${repoTree.repo}@${repoTree.ref}: ツリーが大きすぎて切り詰められています（一部のみ）`
      : `${repoTree.owner}/${repoTree.repo}@${repoTree.ref}`;
    renderRepoFileList();
  }

  btnRepoLoad.addEventListener('click', loadRepoTree);
  repoFilter.addEventListener('input', renderRepoFileList);
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

  function clearSendTimer() {
    if (sendTimer) { clearInterval(sendTimer); sendTimer = null; }
  }

  // Draws the frame at the current sendIndex, then advances sendIndex to
  // the next one. Shared by the auto-loop timer and the manual step
  // buttons below, so a manual step and an auto-tick behave identically.
  function sendTick() {
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
  }

  function startSendLoop() {
    clearSendTimer();
    sendIndex = 0;
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
    sendIndex = ((sendIndex - 2) % len + len) % len;
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
    btnSendPrev.disabled = false;
    btnSendNext.disabled = false;
    setSendInputsDisabled(true);
    requestWakeLock('send');
    startSendLoop();
  }

  function stopSend() {
    clearSendTimer();
    releaseWakeLock('send');
    btnSendStart.disabled = false;
    btnSendStop.disabled = true;
    btnSendPrev.disabled = true;
    btnSendNext.disabled = true;
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
      btnShowMissingQr.disabled = true;
    } else {
      recvMissingList.textContent = formatIndexRanges(missing);
      recvMissingRow.classList.remove('is-complete');
      btnCopyMissing.disabled = false;
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
    // カメラプレビュー中に画面が保たれる保証はどのOSにも無く、受信側が寝ると
    // 転送そのものが止まるので、送信側と同じくロックを取る。
    requestWakeLock('recv');

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
    releaseWakeLock('recv');
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

  // ---------- QR bridge (missing-range side-channel) --------------------
  // The receiver shows its missing-range as a small QR, the sender does a
  // one-shot scan of it. Uses its own canvas/video/stream — never touches
  // sendTimer, scanRaf, or the module-level `stream` — so the main
  // send/receive loops on both devices keep running underneath.

  let qrBridgeStream = null;
  let qrBridgeRaf = null;

  function closeQrBridge() {
    releaseWakeLock('qrbridge');
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
    // 相手が読み取るまでこのQRを出しっぱなしにするので、その間も寝かせない
    requestWakeLock('qrbridge');
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
    resetRecvState();
    if (!isSecureCameraContext()) httpsWarn.hidden = false;
  }

  init();
})();
