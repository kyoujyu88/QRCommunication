// vendor/zxing_reader.wasm を deflate → base64 にして vendor/zxing_reader.wasm.js に埋め込む。
//
// file:// で開いたページ（デスクトップに置いた index.html を直接開く使い方）では
// .wasm を fetch できず、Web Worker も起動できない。<script> なら読めるので、
// wasm を JS の文字列として持たせ、ページ側・ワーカー側のどちらからも
// ネットワークに出ずに ZXing を初期化できるようにしている。
//
// zxing-wasm を更新したら、新しい zxing_reader.wasm を引数に渡して再生成する:
//   node tools/embed-zxing-wasm.js path/to/zxing_reader.wasm
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/embed-zxing-wasm.js path/to/zxing_reader.wasm');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'vendor/fflate.min.js'), 'utf8'), ctx);

const wasm = fs.readFileSync(src);
const packed = ctx.fflate.deflateSync(new Uint8Array(wasm), { level: 9 });
const b64 = Buffer.from(packed).toString('base64');
const out = '// 自動生成（tools/embed-zxing-wasm.js）。zxing-wasm の zxing_reader.wasm を\n'
  + '// deflate → base64 にしたもの。手で編集しないこと。\n'
  + `// 元サイズ ${wasm.length} バイト\n`
  + `self.ZXING_WASM_DEFLATE_BASE64 = '${b64}';\n`;
fs.writeFileSync(path.join(root, 'vendor/zxing_reader.wasm.js'), out);
console.log(`wasm ${wasm.length} B → deflate ${packed.length} B → vendor/zxing_reader.wasm.js ${out.length} B`);
