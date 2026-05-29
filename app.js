(function () {
  'use strict';

  // ----------------------------------------------------------------------
  // Constants
  // ----------------------------------------------------------------------

  const PROTOCOL_TAG = 'QRT2';
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
      const { owner, repo, ref } = spec;
      const url = ref
        ? `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/${encodeURIComponent(ref)}`
        : `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball`;
      sendStatus.textContent = `GitHub から取得中: ${owner}/${repo}${ref ? '@' + ref : ''}…`;
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) {
        if (res.status === 403) throw new Error('rate limit または非公開リポジトリの可能性');
        if (res.status === 404) throw new Error('リポジトリ／ref が見つかりません');
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const refSafe = (ref || 'HEAD').replace(/[^\w.-]/g, '_');
      const name = `${owner}-${repo}-${refSafe}.zip`;
      return {
        manifest: { kind: 'repo', name, mime: 'application/zip', owner, repo, ref: ref || null },
        body: new Uint8Array(buf),
      };
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
  let sendFrames = [];
  let sendIndex = 0;
  let sendBusy = false;

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

    let frames, total;
    try {
      const r = encodeFramesFromBytes(blob, s.chunkSize);
      frames = r.frames; total = r.total;
    } catch (err) {
      sendStatus.textContent = `フレーム生成エラー: ${err.message}`;
      btnSendStart.disabled = false;
      sendBusy = false;
      return;
    }
    sendFrames = frames;
    sendIndex = 0;

    let typeNumber = s.typeNumber;
    if (typeNumber === 0) {
      try {
        typeNumber = resolveTypeNumber(frames, s.ecc);
      } catch (err) {
        sendStatus.textContent = `QR生成エラー: ${err.message}（チャンクサイズを下げてください）`;
        btnSendStart.disabled = false;
        sendBusy = false;
        return;
      }
    }

    const renderOpts = { typeNumber, ecc: s.ecc, cellSize: s.cellSize, margin: s.margin };
    const tickMs = Math.max(50, Math.round(1000 / s.fps));
    btnSendStop.disabled = false;
    setSendInputsDisabled(true);

    const tick = () => {
      const frame = sendFrames[sendIndex];
      try {
        drawQrToCanvas(qrCanvas, frame, renderOpts);
      } catch (err) {
        sendStatus.textContent = `QR生成エラー: ${err.message}（typeNumber を上げるかチャンクサイズを下げてください）`;
        stopSend();
        return;
      }
      sendStatus.textContent =
        `[${gathered.manifest.kind}] ${sendIndex + 1} / ${total}（${sizeLabel}, 1周 ${formatDuration(eta)}・loop）`;
      sendIndex = (sendIndex + 1) % sendFrames.length;
    };

    tick();
    sendTimer = setInterval(tick, tickMs);
  }

  function stopSend() {
    if (sendTimer) {
      clearInterval(sendTimer);
      sendTimer = null;
    }
    btnSendStart.disabled = false;
    btnSendStop.disabled = true;
    setSendInputsDisabled(false);
    sendBusy = false;
    if (sendFrames.length) {
      sendStatus.textContent = `停止（${sendFrames.length}枚生成済み）`;
    } else {
      sendStatus.textContent = '待機中';
    }
  }

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
