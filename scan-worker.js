// 受信スキャン用のワーカー。デコードをメインスレッドから外し、複数立てて
// 並列にフレームを解析させることで読み取り回数を稼ぐ。
//
// 既定は ZXing（WebAssembly）。jsQR より数倍速く、1枚の画像に写った複数の
// QR をまとめて読める（送信側の「同時表示」に必要。jsQR は QR が2つ以上
// 写っていると1つも読めない）。WebAssembly が使えない環境では jsQR に戻る。
'use strict';
importScripts('vendor/jsQR.js', 'vendor/zxing-reader.js');

const MAX_CODES = 4;   // 同時表示の最大枚数（2×2）
let engine = null;     // 'zxing' | 'jsqr'
let ready = null;

function init(decoder) {
  if (ready) return ready;
  ready = (async () => {
    if (decoder !== 'jsqr') {
      try {
        // wasm は同じサーバーの vendor/ から読む（既定のままだと CDN に取りに行く）
        await ZXingWASM.prepareZXingModule({
          overrides: { locateFile: (path) => 'vendor/' + path },
          fireImmediately: true,
        });
        engine = 'zxing';
        return;
      } catch (_) { /* 読み込めなければ jsQR で続ける */ }
    }
    engine = 'jsqr';
  })();
  return ready;
}

self.onmessage = async (ev) => {
  const { buf, w, h, inversion, decoder } = ev.data;
  await init(decoder);
  const datas = [];
  try {
    if (engine === 'zxing') {
      const results = await ZXingWASM.readBarcodes(new ImageData(new Uint8ClampedArray(buf), w, h), {
        formats: ['QRCode'],
        maxNumberOfSymbols: MAX_CODES,
        tryHarder: true,
        tryInvert: inversion !== 'dontInvert',
        tryRotate: false,
      });
      for (const r of results) if (r.isValid && r.text) datas.push(r.text);
    } else {
      const code = jsQR(new Uint8ClampedArray(buf), w, h, { inversionAttempts: inversion });
      if (code && code.data) datas.push(code.data);
    }
  } catch (_) { /* 壊れたフレームは読めなかった扱い */ }
  self.postMessage({ datas, engine });
};
