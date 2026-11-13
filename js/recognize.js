/* ==========================================================================
 * recognize.js —— 第 6 层：从游戏截图识别棋盘
 *
 * 纯本地、不联网。流程分三步：
 *   1. 按颜色投影找出棋盘格子的行列位置（深灰空格 + 浅绿树块）
 *   2. 逐格统计绿色像素占比，判断这一格是不是树
 *   3. 在棋盘上方 / 左侧色带里切出数字笔画，和 0-9 的模板比对，识别提示数字
 *
 * 识别不保证 100% 准确，载入后仍可在棋盘上手动改树、改数字。
 * 对外只暴露 TT.recognize.fromImage(image)。
 * ========================================================================== */

(function (TT) {
    'use strict';

    const SIZE = 16;            // 数字模板归一化后的边长
    const TREE_RATIO = 0.12;    // 一格内绿色像素占比超过这个值才算树
    let _templates = null;      // 0-9 数字模板，首次识别时懒生成

    /* ------------------------------------------------------------------
     * 颜色判断（阈值按附件两款示例截图标定）
     * ------------------------------------------------------------------ */

    // 深灰空格
    function darkish(r, g, b) {
        return r < 90 && g < 90 && b < 90;
    }

    // 浅黄绿的树块底色
    function tileGreen(r, g, b) {
        return r > 180 && g > 190 && b < 170;
    }

    // 树：底色或深色树叶任一命中
    function treeish(r, g, b) {
        return tileGreen(r, g, b) || (g > 80 && g > r + 30 && b < 90);
    }

    // 数字笔画：实心棕
    function solidDigit(r, g, b) {
        return r > 90 && r < 175 && g < 115 && b < 105 && r > g + 25;
    }

    // 褪色浅棕：游戏里这种浅色只用来显示 0
    function fadedDigit(r, g, b) {
        return r >= 195 && r < 232 && g >= 160 && g < 205 && b >= 145 && b < 190 &&
            (r - g) > 8 && (r - g) < 40;
    }

    function digitPixel(r, g, b) {
        return solidDigit(r, g, b) || fadedDigit(r, g, b);
    }

    /* ------------------------------------------------------------------
     * 基础工具
     * ------------------------------------------------------------------ */

    function canvasFromImage(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }

    // 投影分段：连续有格子像素的一段算一列 / 一行
    function segments(arr, lo, hi, threshold) {
        const segs = [];
        let inSeg = false;
        let start = 0;
        for (let i = lo; i <= hi; i++) {
            const has = arr[i] > threshold;
            if (has && !inSeg) {
                inSeg = true;
                start = i;
            } else if (!has && inSeg) {
                inSeg = false;
                segs.push([start, i - 1]);
            }
        }
        if (inSeg) {
            segs.push([start, hi]);
        }
        return segs;
    }

    // 投影偶尔会把边框 / 阴影切成一两像素的碎段，按中位格宽过滤掉
    function filterSegments(segs) {
        if (segs.length === 0) {
            return segs;
        }
        const lens = segs.map(function (s) { return s[1] - s[0] + 1; })
            .sort(function (a, b) { return a - b; });
        const med = lens[Math.floor(lens.length / 2)];
        const minLen = Math.max(15, med * 0.5);
        return segs.filter(function (s) { return (s[1] - s[0] + 1) >= minLen; });
    }

    function findGeometry(data, W, H) {
        const colCell = new Array(W).fill(0);
        const rowCell = new Array(H).fill(0);
        let minX = W, minY = H, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                if (darkish(r, g, b) || tileGreen(r, g, b)) {
                    colCell[x]++;
                    rowCell[y]++;
                    found = true;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (!found) {
            return null;
        }

        const cols = filterSegments(segments(colCell, minX, maxX, 3));
        const rows = filterSegments(segments(rowCell, minY, maxY, 3));
        if (cols.length < TT.MIN_SIZE || rows.length < TT.MIN_SIZE ||
            cols.length > TT.MAX_SIZE || rows.length > TT.MAX_SIZE) {
            return null;
        }
        return { cols: cols, rows: rows, minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    // 连通域：把色带里的数字笔画切成一个个候选块
    function findComponents(data, W, H, x0, x1, y0, y1) {
        const mask = new Uint8Array(W * H);
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const i = (y * W + x) * 4;
                if (digitPixel(data[i], data[i + 1], data[i + 2])) {
                    mask[y * W + x] = 1;
                }
            }
        }

        const seen = new Uint8Array(W * H);
        const comps = [];

        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const k = y * W + x;
                if (!mask[k] || seen[k]) {
                    continue;
                }
                const stack = [[x, y]];
                seen[k] = 1;
                const pts = [];
                while (stack.length) {
                    const p = stack.pop();
                    pts.push(p);
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = p[0] + dx;
                            const ny = p[1] + dy;
                            if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) {
                                continue;
                            }
                            const nk = ny * W + nx;
                            if (mask[nk] && !seen[nk]) {
                                seen[nk] = 1;
                                stack.push([nx, ny]);
                            }
                        }
                    }
                }
                // 过滤噪点和旁边的小装饰符号（窄的「1」要保留，所以宽度下限放宽）
                if (pts.length < 20) {
                    continue;
                }
                let cx0 = W, cx1 = 0, cy0 = H, cy1 = 0;
                pts.forEach(function (p) {
                    cx0 = Math.min(cx0, p[0]);
                    cx1 = Math.max(cx1, p[0]);
                    cy0 = Math.min(cy0, p[1]);
                    cy1 = Math.max(cy1, p[1]);
                });
                if ((cy1 - cy0) < 14 || (cx1 - cx0) < 5) {
                    continue;
                }
                comps.push({
                    x0: cx0, x1: cx1, y0: cy0, y1: cy1,
                    cx: (cx0 + cx1) / 2,
                    cy: (cy0 + cy1) / 2
                });
            }
        }
        return comps;
    }

    // 把候选块切成 0/1 掩码
    function compMask(comp, data, W, H) {
        const w = comp.x1 - comp.x0 + 1;
        const h = comp.y1 - comp.y0 + 1;
        const m = [];
        for (let y = comp.y0; y <= comp.y1; y++) {
            const row = [];
            for (let x = comp.x0; x <= comp.x1; x++) {
                const i = (y * W + x) * 4;
                row.push(digitPixel(data[i], data[i + 1], data[i + 2]) ? 1 : 0);
            }
            m.push(row);
        }
        return { m: m, w: w, h: h };
    }

    // 归一化到 SIZE×SIZE，方便和模板比对
    function normalize(m, w, h, size) {
        const out = [];
        const side = Math.max(w, h);
        for (let y = 0; y < size; y++) {
            const row = [];
            for (let x = 0; x < size; x++) {
                const sy = Math.floor(y * side / size);
                const sx = Math.floor(x * side / size);
                const yy = Math.floor(sy * h / side);
                const xx = Math.floor(sx * w / side);
                row.push(m[yy] && m[yy][xx] ? 1 : 0);
            }
            out.push(row);
        }
        return out;
    }

    function score(a, b) {
        let inter = 0, union = 0;
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                if (a[y][x] || b[y][x]) union++;
                if (a[y][x] && b[y][x]) inter++;
            }
        }
        return union ? inter / union : 0;
    }

    // 真实游戏字形模板：从同款游戏截图里切出的数字笔画，归一化成 16×16 掩码
    // （每行是 16 个 0/1；9 在样本里没出现，运行时用 canvas 模板兜底）
    const EMBEDDED_TPL = {
        0: ['0000000000000100','0000000000001100','0000000000001100','0000000000011111','0000000000011111','0011100000111111','1111100011111110','1111110011111100','1111111111111100','0111111111111000','0011111111110000','0001111111110000','0000111111000000','0000011111000000','0000011110000000','0000011100000000'],
        1: ['0000111111111111','0001111111111111','0000000001111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111','0000000000111111'],
        2: ['0000000001000000','0000111111111000','0001111000111110','0011100000001111','0111000000000111','0111000000000011','0000000000000111','0000000000001110','0000000000001100','0000000000111000','0000000011110000','0000000011100000','0000001110000000','0000111100000000','0001110000000000','0111111111111111'],
        3: ['0000000110000000','0000011111111000','0001111000111100','0011100000001110','0001100000001110','0000000000001110','0000000000111100','0000000111111000','0000000011111100','0000000000001111','0000000000000111','0000000000000011','0111000000000111','0011000000001111','0001111000111110','0000111111111000'],
        4: ['0000000000011100','0000000000111000','0000000001110000','0000000011100000','0000000111000000','0000001110000000','0000011100000000','0000111000010100','0001110000011100','0011100000011100','0111100000011100','1111111111111111','1111111111111111','0000000000011100','0000000000011100','0000000000011100'],
        5: ['0000001111111111','0000011111111111','0000011100000000','0000011000000000','0000011000000000','0000010000000000','0000111111110000','0000111111111110','0000000000001111','0000000000000111','0000000000000111','0000000000000111','1111000000000111','0111100000001110','0011111000111100','0000111111110000'],
        6: ['0000000000010000','0000000000011000','0000000001111000','0000000011100000','0000000111100000','0000001111000000','0000111100000000','0000111111111000','0001111100011100','0011100000001111','1111000000000011','0111000000000011','1111000000000011','0011100000001111','0001111100111110','0000011111111000'],
        7: ['1111111111111111','1111111111111111','0000000000001110','0000000000001100','0000000000111100','0000000000111000','0000000001110000','0000000011100000','0000000111000000','0000000111000000','0000001110000000','0000011100000000','0000111000000000','0001110000000000','0001100000000000','0011000000000000'],
        8: ['0000000111100000','0000011111111000','0001111100111100','0011110000001110','0011100000001111','0011100000000111','0001111000011110','0000011111111000','0001111011011110','0011100000001111','1111000000000111','1111000000000111','1111000000000111','0011100000001111','0011111000111110','0000011111111000']
    };

    // canvas 兜底模板：离屏画粗体无衬线，裁掉空白后归一化（用于样本里没出现过的数字）
    function canvasDigit(d) {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 48, 48);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 32px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(d), 24, 26);
        const im = ctx.getImageData(0, 0, 48, 48).data;

        let x0 = 48, x1 = 0, y0 = 48, y1 = 0;
        for (let y = 0; y < 48; y++) {
            for (let x = 0; x < 48; x++) {
                const i = (y * 48 + x) * 4;
                if (im[i] < 128) {
                    x0 = Math.min(x0, x);
                    x1 = Math.max(x1, x);
                    y0 = Math.min(y0, y);
                    y1 = Math.max(y1, y);
                }
            }
        }
        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        const m = [];
        for (let y = y0; y <= y1; y++) {
            const row = [];
            for (let x = x0; x <= x1; x++) {
                const i = (y * 48 + x) * 4;
                row.push(im[i] < 128 ? 1 : 0);
            }
            m.push(row);
        }
        return normalize(m, w, h, SIZE);
    }

    function buildTemplates() {
        if (_templates) {
            return _templates;
        }
        const tpl = {};
        for (let d = 0; d <= 9; d++) {
            if (EMBEDDED_TPL[d]) {
                tpl[d] = EMBEDDED_TPL[d].map(function (r) {
                    return r.split('').map(Number);
                });
            } else {
                tpl[d] = canvasDigit(d);
            }
        }
        _templates = tpl;
        return tpl;
    }

    // 识别一个候选块最像哪个数字；置信度太低返回 null（留空给人工补）
    function recognizeDigit(comp, data, W, H, tpl) {
        let solid = 0, faded = 0;
        for (let y = comp.y0; y <= comp.y1; y++) {
            for (let x = comp.x0; x <= comp.x1; x++) {
                const i = (y * W + x) * 4;
                if (solidDigit(data[i], data[i + 1], data[i + 2])) solid++;
                else if (fadedDigit(data[i], data[i + 1], data[i + 2])) faded++;
            }
        }
        // 浅色笔画在游戏里只表示 0，不再走模板比对
        if (faded > solid) {
            return 0;
        }
        const packed = compMask(comp, data, W, H);
        const mask = normalize(packed.m, packed.w, packed.h, SIZE);
        let best = null;
        let bestScore = -1;
        for (let d = 0; d <= 9; d++) {
            const s = score(mask, tpl[d]);
            if (s > bestScore) {
                bestScore = s;
                best = d;
            }
        }
        // 模板相似度低于 0.34 视为没把握，交给人工填
        return bestScore >= 0.34 ? best : null;
    }

    /* ------------------------------------------------------------------
     * 对外入口
     * ------------------------------------------------------------------ */

    /**
     * 从图片识别棋盘。
     * @param {HTMLImageElement|ImageBitmap} image 截图
     * @returns {{rows, cols, trees: boolean[][], rowHints: (number|null)[], colHints: (number|null)[]}}
     * @throws {Error} 找不到棋盘或画面无法识别时，给中文提示
     */
    TT.recognize = TT.recognize || {};
    TT.recognize.fromImage = function (image) {
        if (!image) {
            throw new Error(TT.i18n.t('recognize.noImage'));
        }
        const W = image.naturalWidth || image.width;
        const H = image.naturalHeight || image.height;
        if (!W || !H) {
            throw new Error(TT.i18n.t('recognize.loading'));
        }

        let data;
        try {
            data = canvasFromImage(image);
        } catch (e) {
            throw new Error(TT.i18n.t('recognize.readFail'));
        }

        const geo = findGeometry(data, W, H);
        if (!geo) {
            throw new Error(TT.i18n.t('recognize.noBoard'));
        }

        // ---- 逐格判断树 ----
        const trees = [];
        for (let r = 0; r < geo.rows.length; r++) {
            const row = [];
            const y0 = geo.rows[r][0], y1 = geo.rows[r][1];
            for (let c = 0; c < geo.cols.length; c++) {
                const x0 = geo.cols[c][0], x1 = geo.cols[c][1];
                let tree = 0, total = 0;
                for (let y = y0 + 5; y <= y1 - 5; y++) {
                    for (let x = x0 + 5; x <= x1 - 5; x++) {
                        const i = (y * W + x) * 4;
                        total++;
                        if (treeish(data[i], data[i + 1], data[i + 2])) {
                            tree++;
                        }
                    }
                }
                row.push(total > 0 && tree / total > TREE_RATIO);
            }
            trees.push(row);
        }

        // ---- 数字识别：顶部列提示，左侧行提示 ----
        const tpl = buildTemplates();

        const topComps = findComponents(data, W, H, geo.minX, geo.maxX, 0, geo.minY - 10);
        const colHints = geo.cols.map(function (col) {
            const cx = (col[0] + col[1]) / 2;
            let best = null;
            let bestDist = Infinity;
            topComps.forEach(function (comp) {
                const dist = Math.abs(comp.cx - cx);
                if (dist > (col[1] - col[0]) * 0.6) return;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = comp;
                }
            });
            return best ? recognizeDigit(best, data, W, H, tpl) : null;
        });

        const leftComps = findComponents(data, W, H, 0, geo.minX - 10, geo.minY, geo.maxY);
        const rowHints = geo.rows.map(function (row) {
            const cy = (row[0] + row[1]) / 2;
            let best = null;
            let bestDist = Infinity;
            leftComps.forEach(function (comp) {
                const dist = Math.abs(comp.cy - cy);
                if (dist > (row[1] - row[0]) * 0.6) return;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = comp;
                }
            });
            return best ? recognizeDigit(best, data, W, H, tpl) : null;
        });

        return {
            rows: geo.rows.length,
            cols: geo.cols.length,
            trees: trees,
            rowHints: rowHints,
            colHints: colHints,
            missingMode: rowHints.some(function (h) { return h === null; }) ||
                         colHints.some(function (h) { return h === null; })
        };
    };

})(window.TT);
