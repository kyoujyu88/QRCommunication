# vendor/zxing-multi.js の作り方

WebAssembly が使えない環境（Edge のセキュリティ強化モード、組織のポリシーで
JavaScript の JIT が無効など）でも、同時表示の複数のQRを読むための純粋な
JavaScript のデコーダです。`entry.js` が本体で、@zxing/library の QR 部品だけを
esbuild で1ファイルにまとめたものを `vendor/zxing-multi.js` として同梱しています。

```sh
mkdir /tmp/zxm && cd /tmp/zxm
npm install @zxing/library@0.23.0 esbuild@0.24
cp <repo>/tools/zxing-multi/entry.js .
npx esbuild entry.js --bundle --minify --format=iife --target=es2017 \
  --legal-comments=eof --outfile=<repo>/vendor/zxing-multi.js
```

ライセンス: @zxing/library・ZXing ともに Apache-2.0（`vendor/zxing-multi.LICENSE`）。
