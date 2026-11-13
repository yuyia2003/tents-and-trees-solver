/* ==========================================================================
 * tools/make-demos.js —— 开发用：生成 js/demos.js
 *
 * 跑法：node tools/make-demos.js
 *
 * 做两件事：
 *   1. 从原版 index.html 里把原来的 5 道示例题（6×6 / 8×8 / 16×16 / 17×17 / 18×18）
 *      原样搬过来 —— 它们在"树和帐篷一一配对"的正确规则下是完全合法的；
 *   2. 再随机造一道 20×20，用来展示更大尺寸。
 *
 * 每一道题都会验证三件事，不合格就换掉：
 *   · 题目本身过关（尺寸、提示、树的数量都对得上）
 *   · 求解器能解出来，而且解能被另一套独立代码核对通过
 *   · 答案唯一（解的数量正好是 1）
 * ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { loadTT, checkSolution } = require('./load-tt');
const { randomPuzzle } = require('./generate');

const TT = loadTT();
const root = path.join(__dirname, '..', '..');
const htmlPath = path.join(root, 'index.html');
const outPath = path.join(__dirname, '..', 'js', 'demos.js');

/* --------------------------------------------------------------------------
 * 1. 从原版 index.html 里抠出示例题
 * ------------------------------------------------------------------------ */

function extractFunction(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) {
        return null;
    }
    const bodyStart = src.indexOf('{', start);
    let depth = 0;
    let i = bodyStart;
    for (; i < src.length; i++) {
        if (src[i] === '{') {
            depth++;
        } else if (src[i] === '}') {
            depth--;
            if (depth === 0) {
                i++;
                break;
            }
        }
    }
    return src.slice(start, i);
}

function readOriginalDemos() {
    if (!fs.existsSync(htmlPath)) {
        return [];
    }
    const src = fs.readFileSync(htmlPath, 'utf8');
    const names = ['demo6_6', 'demo8_8', 'demo16_16', 'demo17_17', 'demo18_18'];
    const out = [];

    for (const name of names) {
        const block = extractFunction(src, name);
        if (!block) {
            continue;
        }
        const captured = [];
        vm.runInNewContext(block + '\n' + name + '();', {
            setupDemo: function (trees, top, left) {
                captured.push({ trees: trees, top: top, left: left });
            }
        });
        if (captured.length !== 1) {
            continue;
        }
        const d = captured[0];
        out.push({
            trees: d.trees,
            rowHints: d.left.slice(),
            colHints: d.top.slice()
        });
    }

    return out;
}

/* --------------------------------------------------------------------------
 * 2. 验证一道题
 * ------------------------------------------------------------------------ */

function toPuzzle(item) {
    return {
        rows: item.trees.length,
        cols: item.trees[0].length,
        trees: item.trees.map(function (line) {
            return line.map(function (v) {
                return v === 1;
            });
        }),
        rowHints: item.rowHints,
        colHints: item.colHints
    };
}

function verify(item, opts) {
    const puzzle = toPuzzle(item);

    const puzzleError = TT.checkPuzzle(puzzle);
    if (puzzleError) {
        return { ok: false, why: '题目不合格：' + puzzleError };
    }

    const result = TT.solve(puzzle, { maxNodes: 60000, timeLimit: 6000 });
    if (result.status !== 'solved') {
        return { ok: false, why: '解不出来：' + (result.message || result.status) };
    }

    const problems = checkSolution(TT, puzzle, result.steps[result.steps.length - 1].cells);
    if (problems.length > 0) {
        return { ok: false, why: '解不合法：' + problems.slice(0, 2).join('; ') };
    }

    const uniq = TT.countSolutions(TT.createState(puzzle), 2, {
        maxNodes: (opts && opts.countNodes) || 400000,
        timeLimit: (opts && opts.countTime) || 8000
    });
    if (uniq.timeout) {
        return { ok: false, why: '数解的时候超时了，不敢确定唯一' };
    }
    if (uniq.count !== 1) {
        return { ok: false, why: '解不唯一，有 ' + uniq.count + ' 个解' };
    }

    return {
        ok: true,
        steps: result.steps.length,
        guesses: result.stats ? result.stats.guesses : 0,
        tents: puzzle.rowHints.reduce(function (a, b) { return a + b; }, 0),
        byLogic: result.stats ? result.stats.byLogic : false
    };
}

/* --------------------------------------------------------------------------
 * 3. 造一道 20×20
 * ------------------------------------------------------------------------ */

function makeLargeDemo() {
    const size = 20;
    let best = null; // 先挑"纯推理解出"的；没有就挑试探次数最少的

    for (let attempt = 0; attempt < 36; attempt++) {
        const puzzle = randomPuzzle(size, size, 48);
        if (!puzzle) {
            continue;
        }

        const item = {
            trees: puzzle.trees.map(function (line) {
                return line.map(function (v) {
                    return v ? 1 : 0;
                });
            }),
            rowHints: puzzle.rowHints.slice(),
            colHints: puzzle.colHints.slice()
        };

        const check = verify(item, { countNodes: 200000, countTime: 3500 });
        if (!check.ok) {
            continue;
        }

        console.log('  20×20 第 ' + (attempt + 1) + ' 次尝试合格：步骤 ' + check.steps +
            '，试探 ' + check.guesses + '，帐篷 ' + check.tents);

        if (check.guesses === 0) {
            return item; // 纯逻辑就能解，最理想
        }
        if (!best || check.guesses < best.guesses) {
            best = { item: item, guesses: check.guesses, steps: check.steps };
        }
    }

    if (best) {
        console.log('  20×20 采用试探次数最少的一道：' + best.guesses + ' 次试探');
        return best.item;
    }

    return null;
}

/* --------------------------------------------------------------------------
 * 4. 组装并写出 demos.js
 * ------------------------------------------------------------------------ */

const LEVELS = {
    '6×6': '入门',
    '8×8': '练习',
    '16×16': '挑战',
    '17×17': '挑战',
    '18×18': '高难',
    '20×20': '高难'
};

const entries = [];

const originals = readOriginalDemos();
console.log('原版示例题：找到 ' + originals.length + ' 道');

for (const item of originals) {
    const rows = item.trees.length;
    const cols = item.trees[0].length;
    const label = rows + '×' + cols;
    const check = verify(item);
    console.log('  ' + label + '：' + (check.ok ? '通过（步骤 ' + check.steps + '，试探 ' + check.guesses +
        '，帐篷 ' + check.tents + '）' : '不合格 —— ' + check.why));
    if (!check.ok) {
        continue;
    }
    entries.push({
        id: 'demo-' + rows + 'x' + cols,
        name: label,
        level: LEVELS[label] || '练习',
        rows: rows,
        cols: cols,
        item: item
    });
}

const large = makeLargeDemo();
if (large) {
    entries.push({
        id: 'demo-20x20',
        name: '20×20',
        level: LEVELS['20×20'],
        rows: 20,
        cols: 20,
        item: large
    });
}

function treesToLines(trees) {
    return trees.map(function (line) {
        return "'" + line.map(function (v) {
            return v === 1 ? 'T' : '.';
        }).join('') + "'";
    }).join(',\n                ');
}

const body = entries.map(function (e) {
    return [
        '        {',
        "            id: '" + e.id + "',",
        "            name: '" + e.name + "',",
        "            level: '" + e.level + "',",
        '            rows: ' + e.rows + ',',
        '            cols: ' + e.cols + ',',
        '            trees: [',
        '                ' + treesToLines(e.item.trees),
        '            ],',
        '            rowHints: [' + e.item.rowHints.join(', ') + '],',
        '            colHints: [' + e.item.colHints.join(', ') + ']',
        '        }'
    ].join('\n');
}).join(',\n');

const file = [
    '/* ==========================================================================',
    ' * demos.js —— 示例题目数据',
    ' *',
    ' * 这一层只有数据，没有逻辑：界面上那几个"示例"按钮就靠它。',
    ' *',
    ' * trees 里 T 表示树，. 表示空格，一行一个字符串，看起来和题目一模一样。',
    ' * rowHints 是左边每行的提示（这一行要放几个帐篷），',
    ' * colHints 是上面每列的提示。',
    ' *',
    ' * 前 5 道是原版 index.html 里的示例题，原样搬过来的（它们在"树和帐篷',
    ' * 一一配对"的规则下是合法的）；最后一道 20×20 是新造的。',
    ' * 每一道都验证过：题目合格、能解出来、解合法、答案唯一。',
    ' * 想加自己的题：照抄一条，改 trees 和提示即可（改完最好跑一遍',
    ' * tools/check.js 看看还能不能解）。',
    ' * ========================================================================== */',
    '',
    '(function (TT) {',
    "    'use strict';",
    '',
    '    TT.DEMOS = [',
    body,
    '    ];',
    '',
    '})(window.TT);',
    ''
].join('\n');

fs.writeFileSync(outPath, file, 'utf8');
console.log('\n已写出 ' + outPath + '，共 ' + entries.length + ' 道示例题');

// 顺手跑一遍 check.js 里的核对思路：每道题都独立核对过，这里只汇报结果
console.log('示例题清单：' + entries.map(function (e) { return e.name; }).join('、'));
