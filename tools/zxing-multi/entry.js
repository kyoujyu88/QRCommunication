// 複数のQRを1枚の画像から読む、WebAssembly を使わない（純粋な JavaScript の）
// デコーダ。vendor/zxing-multi.js はこのファイルを esbuild でまとめたもの。
//
// ZXing の Java 版にある MultiFinderPatternFinder / MultiDetector
// （com.google.zxing.multi.qrcode, Apache-2.0）を、@zxing/library（ZXing の
// TypeScript 移植、Apache-2.0）の QR 部品の上に移植した。@zxing/library には
// 複数読み取りの実装が無く、jsQR は QR が2つ以上写っていると1つも読めない。
// WebAssembly が組織のポリシー等で禁止された環境で「同時表示」を読むために使う。
//
// 再生成: tools/zxing-multi/README.md を参照
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap';
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer';
import RGBLuminanceSource from '@zxing/library/esm/core/RGBLuminanceSource';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import ResultPoint from '@zxing/library/esm/core/ResultPoint';
import FinderPatternFinder from '@zxing/library/esm/core/qrcode/detector/FinderPatternFinder';
import FinderPatternInfo from '@zxing/library/esm/core/qrcode/detector/FinderPatternInfo';
import Detector from '@zxing/library/esm/core/qrcode/detector/Detector';
import Decoder from '@zxing/library/esm/core/qrcode/decoder/Decoder';

// QR の1辺のモジュール数として正当な範囲（規格は 21〜177）
const MAX_MODULE_COUNT_PER_EDGE = 180;
const MIN_MODULE_COUNT_PER_EDGE = 9;
// 2つのファインダーパターンが同じQRのものとみなせる、推定モジュール幅の差
const DIFF_MODSIZE_CUTOFF_PERCENT = 0.05;
const DIFF_MODSIZE_CUTOFF = 0.5;

class MultiFinderPatternFinder extends FinderPatternFinder {
  // 候補のファインダーパターンから、1つのQRを成しうる3つ組をすべて選ぶ
  // （大きさがそろい、辺の長さがほぼ等しく、直角三角形になっているもの）
  selectMultipleBestPatterns() {
    const possibleCenters = this.getPossibleCenters().filter((fp) => fp.getCount() >= 2);
    const size = possibleCenters.length;
    if (size < 3) return [];
    if (size === 3) return [possibleCenters.slice()];
    possibleCenters.sort((a, b) => b.getEstimatedModuleSize() - a.getEstimatedModuleSize());
    const results = [];
    for (let i1 = 0; i1 < size - 2; i1++) {
      const p1 = possibleCenters[i1];
      for (let i2 = i1 + 1; i2 < size - 1; i2++) {
        const p2 = possibleCenters[i2];
        const vModSize12 = (p1.getEstimatedModuleSize() - p2.getEstimatedModuleSize())
          / Math.min(p1.getEstimatedModuleSize(), p2.getEstimatedModuleSize());
        const vModSize12A = Math.abs(p1.getEstimatedModuleSize() - p2.getEstimatedModuleSize());
        if (vModSize12A > DIFF_MODSIZE_CUTOFF && vModSize12 >= DIFF_MODSIZE_CUTOFF_PERCENT) break;
        for (let i3 = i2 + 1; i3 < size; i3++) {
          const p3 = possibleCenters[i3];
          const vModSize23 = (p2.getEstimatedModuleSize() - p3.getEstimatedModuleSize())
            / Math.min(p2.getEstimatedModuleSize(), p3.getEstimatedModuleSize());
          const vModSize23A = Math.abs(p2.getEstimatedModuleSize() - p3.getEstimatedModuleSize());
          if (vModSize23A > DIFF_MODSIZE_CUTOFF && vModSize23 >= DIFF_MODSIZE_CUTOFF_PERCENT) break;
          const test = [p1, p2, p3];
          ResultPoint.orderBestPatterns(test);
          const info = new FinderPatternInfo(test);
          const dA = ResultPoint.distance(info.getTopLeft(), info.getBottomLeft());
          const dC = ResultPoint.distance(info.getTopRight(), info.getBottomLeft());
          const dB = ResultPoint.distance(info.getTopLeft(), info.getTopRight());
          const estimatedModuleCount = (dA + dB) / (p1.getEstimatedModuleSize() * 2.0);
          if (estimatedModuleCount > MAX_MODULE_COUNT_PER_EDGE
              || estimatedModuleCount < MIN_MODULE_COUNT_PER_EDGE) continue;
          const vABBC = Math.abs((dA - dB) / Math.min(dA, dB));
          if (vABBC >= 0.1) continue;
          const dCpy = Math.sqrt(dA * dA + dB * dB);
          const vPyC = Math.abs((dC - dCpy) / Math.min(dC, dCpy));
          if (vPyC >= 0.1) continue;
          results.push(test);
        }
      }
    }
    return results;
  }

  findMulti(tryHarder) {
    const image = this.getImage();
    const maxI = image.getHeight();
    const maxJ = image.getWidth();
    let iSkip = Math.floor((3 * maxI) / (4 * FinderPatternFinder.MAX_MODULES));
    if (iSkip < FinderPatternFinder.MIN_SKIP || tryHarder) iSkip = FinderPatternFinder.MIN_SKIP;
    const stateCount = new Int32Array(5);
    const shift2 = () => {
      stateCount[0] = stateCount[2];
      stateCount[1] = stateCount[3];
      stateCount[2] = stateCount[4];
      stateCount[3] = 1;
      stateCount[4] = 0;
    };
    for (let i = iSkip - 1; i < maxI; i += iSkip) {
      stateCount.fill(0);
      let currentState = 0;
      for (let j = 0; j < maxJ; j++) {
        if (image.get(j, i)) {
          if ((currentState & 1) === 1) currentState++;
          stateCount[currentState]++;
        } else if ((currentState & 1) === 0) {
          if (currentState === 4) {
            if (FinderPatternFinder.foundPatternCross(stateCount) && this.handlePossibleCenter(stateCount, i, j, false)) {
              currentState = 0;
              stateCount.fill(0);
            } else {
              shift2();
              currentState = 3;
            }
          } else {
            stateCount[++currentState]++;
          }
        } else {
          stateCount[currentState]++;
        }
      }
      if (FinderPatternFinder.foundPatternCross(stateCount)) this.handlePossibleCenter(stateCount, i, maxJ, false);
    }
    return this.selectMultipleBestPatterns().map((pattern) => {
      ResultPoint.orderBestPatterns(pattern);
      return new FinderPatternInfo(pattern);
    });
  }
}

const corners = (pts) => pts.map((p) => ({ x: p.getX(), y: p.getY() }));

// RGBA 画素から QR を読む。返り値:
//   texts    … 読めた文字列（重複なし）
//   detected … QR らしい位置の数（読めなかったものを含む。同じQRの重複は除く）
function decode(rgba, width, height, opts) {
  const tryHarder = !opts || opts.tryHarder !== false;
  const lum = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (rgba[p] + 2 * rgba[p + 1] + rgba[p + 2]) >> 2;
  }
  const bits = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, width, height))).getBlackMatrix();
  const hints = new Map();
  if (tryHarder) hints.set(DecodeHintType.TRY_HARDER, true);

  const decoder = new Decoder();
  const detector = new Detector(bits);
  const hits = [];   // { text|null, box }
  const tryDecode = (detectorResult) => {
    const pts = corners(detectorResult.getPoints()).slice(0, 3);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    let text = null;
    try { text = decoder.decodeBitMatrix(detectorResult.getBits(), hints).getText(); } catch (_) { /* 読めない */ }
    hits.push({ text, box });
  };

  let infos = [];
  try { infos = new MultiFinderPatternFinder(bits, null).findMulti(tryHarder); } catch (_) { infos = []; }
  for (const info of infos) {
    let dr;
    try { dr = detector.processFinderPatternInfo(info); } catch (_) { continue; }
    tryDecode(dr);
  }
  // 複数読み取りで何も読めなかったときは、通常の1枚読み取りも試す
  if (!hits.some((h) => h.text != null)) {
    try { tryDecode(detector.detect(hints)); } catch (_) { /* 見つからない */ }
  }

  // 並べたQRの間では、隣り合うQRのファインダーパターンどうしも「QRらしい
  // 三角形」になり、読めない候補として混ざる。読めたものを先に採り、読めな
  // かった候補は読めたQRと重ならないものだけを「写っているが読めないQR」として数える。
  const overlaps = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
  const texts = [];
  const okBoxes = [];
  for (const h of hits) {
    if (h.text == null) continue;
    okBoxes.push(h.box);
    if (!texts.includes(h.text)) texts.push(h.text);
  }
  const failBoxes = [];
  for (const h of hits) {
    if (h.text != null) continue;
    if (okBoxes.some((b) => overlaps(b, h.box)) || failBoxes.some((b) => overlaps(b, h.box))) continue;
    failBoxes.push(h.box);
  }
  return { texts, detected: texts.length + failBoxes.length };
}

self.ZXingMulti = { decode };
