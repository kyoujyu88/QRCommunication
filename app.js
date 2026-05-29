(function () {
  'use strict';

  // ----------------------------------------------------------------------
  // Constants
  // ----------------------------------------------------------------------

  const PROTOCOL_TAG = 'QRT1';
  const STORAGE_KEY = 'qrtt.settings.v1';

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
  const btnSendStart = $('btnSendStart');
  const btnSendStop = $('btnSendStop');
  const sendStatus = $('sendStatus');
  const qrCanvas = $('qrCanvas');

  const btnRecvStart = $('btnRecvStart');
  const btnRecvStop = $('btnRecvStop');
  const btnRecvReset = $('btnRecvReset');
  const cam = $('cam');
  const scanCanvas = $('scanCanvas');
  const recvProgress = $('recvProgress');
  const recvStatus = $('recvStatus');
  const recvGrid = $('recvGrid');
  const recvOutput = $('recvOutput');
  const btnCopy = $('btnCopy');
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
  // Chunk protocol
  // ----------------------------------------------------------------------

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function newSessionId() {
    return Math.random().toString(36).slice(2, 8);
  }

  function encodeFrames(text, chunkSize) {
    const b64 = utf8ToBase64(text);
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
    // split into at most 5 parts so payload can contain '|' safely (base64 won't, but be defensive)
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

  // ----------------------------------------------------------------------
  // Send loop
  // ----------------------------------------------------------------------

  let sendTimer = null;
  let sendFrames = [];
  let sendIndex = 0;

  // Auto-pick a single typeNumber covering the longest frame so every chunk
  // renders at the same QR size — keeps layout from re-flowing between
  // frames and helps the receiver's camera stay focused.
  function resolveTypeNumber(frames, ecc) {
    let longest = frames[0];
    for (const f of frames) if (f.length > longest.length) longest = f;
    const qr = qrcode(0, ecc);
    qr.addData(longest, 'Byte');
    qr.make();
    return (qr.getModuleCount() - 17) / 4;
  }

  function startSend() {
    const text = sendInput.value;
    if (!text) {
      sendStatus.textContent = '送信するテキストを入力してください';
      return;
    }
    const s = settingsFromInputs();
    const { frames, total } = encodeFrames(text, s.chunkSize);
    sendFrames = frames;
    sendIndex = 0;

    btnSendStart.disabled = true;
    btnSendStop.disabled = false;
    sendInput.disabled = true;

    const tickMs = Math.max(50, Math.round(1000 / s.fps));
    let typeNumber = s.typeNumber;
    if (typeNumber === 0) {
      try {
        typeNumber = resolveTypeNumber(frames, s.ecc);
      } catch (err) {
        sendStatus.textContent = `QR生成エラー: ${err.message}（チャンクサイズを下げてください）`;
        stopSend();
        return;
      }
    }
    const renderOpts = {
      typeNumber,
      ecc: s.ecc,
      cellSize: s.cellSize,
      margin: s.margin,
    };

    const tick = () => {
      const frame = sendFrames[sendIndex];
      try {
        drawQrToCanvas(qrCanvas, frame, renderOpts);
      } catch (err) {
        sendStatus.textContent = `QR生成エラー: ${err.message}（typeNumberを上げるかチャンクサイズを下げてください）`;
        stopSend();
        return;
      }
      sendStatus.textContent = `送信中 ${sendIndex + 1} / ${total}（loop）`;
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
    sendInput.disabled = false;
    if (sendFrames.length) {
      sendStatus.textContent = `停止（${sendFrames.length}枚生成済み）`;
    } else {
      sendStatus.textContent = '待機中';
    }
  }

  btnSendStart.addEventListener('click', startSend);
  btnSendStop.addEventListener('click', stopSend);

  // ----------------------------------------------------------------------
  // Receive
  // ----------------------------------------------------------------------

  let stream = null;
  let scanRaf = null;
  let recvState = null; // { sessionId, total, chunks: string[], gotCount }

  function resetRecvState() {
    recvState = null;
    recvProgress.value = 0;
    recvProgress.max = 1;
    recvStatus.textContent = '未開始';
    recvGrid.innerHTML = '';
    recvOutput.value = '';
    btnCopy.disabled = true;
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
    btnCopy.disabled = true;
  }

  function ingestFrame(frame) {
    if (!recvState || recvState.sessionId !== frame.sessionId || recvState.total !== frame.total) {
      initRecvSession(frame.sessionId, frame.total);
    }
    if (recvState.chunks[frame.index] != null) return; // already got
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
        recvOutput.value = base64ToUtf8(b64);
        btnCopy.disabled = false;
        recvStatus.textContent = `完了 ${recvState.total} 枚（セッション ${recvState.sessionId}）`;
      } catch (err) {
        recvStatus.textContent = `復号エラー: ${err.message}`;
      }
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
    await cam.play().catch(() => { /* autoplay may already be running */ });

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
    resetRecvState();
    if (!isSecureCameraContext()) httpsWarn.hidden = false;
  }

  init();
})();
