// 受信スキャン用のワーカー。デコードをメインスレッドから外し、複数立てて
// 並列にフレームを解析させることで読み取り回数を稼ぐ。
//
// 既定は ZXing（WebAssembly）。jsQR より数倍速く、1枚の画像に写った複数の
// QR をまとめて読める（送信側の「同時表示」に必要。jsQR は QR が2つ以上
// 写っていると1つも読めない）。WebAssembly が使えない環境では jsQR に戻る。
// 戻った理由は画面に出せるよう engineError として返す。
'use strict';
importScripts('vendor/jsQR.js');

const MAX_CODES = 4;   // 同時表示の最大枚数（2×2）
let engine = null;     // 'zxing' | 'jsqr'
let engineError = '';  // ZXing を使えなかった理由
let ready = null;

function embeddedWasm() {
  const bin = atob(self.ZXING_WASM_DEFLATE_BASE64);
  const packed = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) packed[i] = bin.charCodeAt(i);
  return fflate.inflateSync(packed);
}

function init(decoder) {
  if (ready) return ready;
  ready = (async () => {
    if (decoder === 'jsqr') { engine = 'jsqr'; return; }
    try {
      // ブラウザの設定（Edge のセキュリティ強化モードなど）や組織のポリシーで
      // WebAssembly が無効にされていることがある
      if (typeof WebAssembly !== 'object') throw new Error('このブラウザでは WebAssembly が無効です');
      importScripts('vendor/fflate.min.js', 'vendor/zxing_reader.wasm.js', 'vendor/zxing-reader.js');
      // wasm は JS に埋め込んだもの（vendor/zxing_reader.wasm.js）を使い、ネットワーク
      // には一切出ない。locateFile も念のため差し替える（既定だと CDN を指している）。
      await ZXingWASM.prepareZXingModule({
        overrides: { wasmBinary: embeddedWasm(), locateFile: (path) => 'vendor/' + path },
        fireImmediately: true,
      });
      engine = 'zxing';
    } catch (err) {
      engine = 'jsqr';
      engineError = (err && err.message) || String(err);
    }
  })();
  return ready;
}

const corners = (p) => [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft];
function box(p) {
  const xs = corners(p).map((c) => c.x), ys = corners(p).map((c) => c.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function center(p) {
  const cs = corners(p);
  return { x: cs.reduce((n, c) => n + c.x, 0) / 4, y: cs.reduce((n, c) => n + c.y, 0) / 4 };
}

self.onmessage = async (ev) => {
  const { buf, w, h, inversion, decoder, probe } = ev.data;
  await init(decoder);
  if (probe) { self.postMessage({ engine, engineError }); return; }
  const datas = [];
  let detected = 0;   // 写っていると判定できたQRの数（読めなかったものを含む。ZXing のみ）
  try {
    if (engine === 'zxing') {
      const results = await ZXingWASM.readBarcodes(new ImageData(new Uint8ClampedArray(buf), w, h), {
        formats: ['QRCode'],
        maxNumberOfSymbols: MAX_CODES,
        tryHarder: true,
        tryInvert: inversion !== 'dontInvert',
        tryRotate: false,
        returnErrors: true,
      });
      const valid = results.filter((r) => r.isValid && r.text);
      for (const r of valid) datas.push(r.text);
      // 読めなかった検出は、読めたQRと同じ場所の重複（ZXing は同じQRを別の
      // 読み方で失敗した結果も返す）を除いて数える
      const boxes = valid.map((r) => box(r.position));
      const failed = results.filter((r) => !r.isValid && r.position).filter((r) => {
        const c = center(r.position);
        return !boxes.some((b) => c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1);
      });
      detected = valid.length + failed.length;
    } else {
      const code = jsQR(new Uint8ClampedArray(buf), w, h, { inversionAttempts: inversion });
      if (code && code.data) datas.push(code.data);
    }
  } catch (_) { /* 壊れたフレームは読めなかった扱い */ }
  self.postMessage({ datas, detected, engine, engineError });
};
