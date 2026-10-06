// 受信スキャン用の jsQR ワーカー。デコードをメインスレッドから外し、
// 複数立てて並列にフレームを解析させることで読み取り回数を稼ぐ。
'use strict';
importScripts('vendor/jsQR.js');

self.onmessage = (ev) => {
  const { id, buf, w, h, inversion } = ev.data;
  let data = null;
  try {
    const code = jsQR(new Uint8ClampedArray(buf), w, h, { inversionAttempts: inversion });
    if (code && code.data) data = code.data;
  } catch (_) { /* 壊れたフレームは読めなかった扱い */ }
  // バッファは返却して使い回す
  self.postMessage({ id, data, buf }, [buf]);
};
