/* ==========================================================================
 * tools/check.js —— 开发用：求解器自检
 *
 * 跑法：node tools/check.js
 *
 * 检查三件事：
 *   1. 求解器给出的解，换一套独立代码核对，是否真的符合题目规则（防止规则写错）
 *   2. 明显填错的题目，是否会被拦住并给出中文提示
 *   3. 20×20 时跑得动吗，要多少毫秒
 * ========================================================================== */

const { loadTT, checkSolution } = require('./load-tt');
const { randomPuzzle } = require('./generate');

const TT = loadTT();

let pass = 0;
let fail = 0;

function report(name, ok, detail) {
    if (ok) {
        pass++;
    } else {
        fail++;
        console.log('  ✗ ' + name + (detail ? ' —— ' + detail : ''));
    }
}

/* --------------------------------------------------------------------------
 * 1. 随机题：解出来以后独立核对
 * ------------------------------------------------------------------------ */
console.log('1. 随机题正确性（4×4 ~ 9×9，共 240 题）');

for (let i = 0; i < 240; i++) {
    const rows = 4 + (i % 6);
    const cols = 4 + ((i * 3) % 6);
    const puzzle = randomPuzzle(rows, cols, Math.max(2, Math.floor(rows * cols * 0.12)));
    if (!puzzle) {
        continue;
    }

    const result = TT.solve(puzzle, { maxNodes: 30000, timeLimit: 3000 });
    if (result.status === 'failed' || result.status === 'invalid') {
        // 随机题可能有多个解，理论上不该失败；失败就记下来
        report('随机题 ' + rows + '×' + cols + ' 求解失败', false, result.message || result.status);
        continue;
    }

    const last = result.steps[result.steps.length - 1];
    if (!last || last.kind !== 'done') {
        report('随机题缺少完成步骤', false);
        continue;
    }

    const problems = checkSolution(TT, puzzle, last.cells);
    report('随机题 ' + rows + '×' + cols + ' 解不正确', problems.length === 0, problems.slice(0, 3).join('; '));
}

console.log('  完成：通过 ' + pass + '，失败 ' + fail);

/* --------------------------------------------------------------------------
 * 2. 题目检查：填错的提示要被拦住
 * ------------------------------------------------------------------------ */
console.log('2. 题目检查');

const badPuzzles = [
    {
        name: '提示合计不相等',
        puzzle: { rows: 4, cols: 4, trees: [[true, false, false, false], [false, false, false, false], [false, false, false, false], [false, false, false, false]], rowHints: [1, 0, 0, 0], colHints: [0, 0, 0, 0] }
    },
    {
        name: '树的数量和提示不符',
        puzzle: { rows: 4, cols: 4, trees: [[true, true, false, false], [false, false, false, false], [false, false, false, false], [false, false, false, false]], rowHints: [1, 0, 0, 0], colHints: [1, 0, 0, 0] }
    },
    {
        name: '提示超出范围',
        puzzle: { rows: 4, cols: 4, trees: [[true, false, false, false], [false, false, false, false], [false, false, false, false], [false, false, false, false]], rowHints: [9, 0, 0, 0], colHints: [1, 0, 0, 0] }
    }
];

for (const item of badPuzzles) {
    const message = TT.checkPuzzle(item.puzzle);
    report(item.name, typeof message === 'string' && message.length > 0);
}

// 树被围住、无处放帐篷的题，应该在求解阶段被判为矛盾
const blockedPuzzle = {
    rows: 4,
    cols: 4,
    // 左上角的树四周都被别的树挡住，只剩 (0,1) 和 (1,0) 两个方向，
    // 再把这两格也堵死，它就没地方放帐篷了
    trees: [
        [true, true, false, false],
        [true, false, false, false],
        [false, false, false, false],
        [false, false, false, false]
    ],
    rowHints: [1, 1, 0, 0],
    colHints: [1, 1, 0, 0]
};
const blocked = TT.solve(blockedPuzzle, { maxNodes: 5000, timeLimit: 1000 });
report('树无处放帐篷应判为矛盾或失败',
    blocked.status === 'invalid' || blocked.status === 'failed',
    blocked.status + ' ' + (blocked.message || ''));

/* --------------------------------------------------------------------------
 * 3. 大尺寸性能
 * ------------------------------------------------------------------------ */
console.log('3. 尺寸与耗时');

for (const size of [4, 8, 12, 16, 20]) {
    let puzzle = null;
    let tries = 0;
    while (!puzzle && tries < 60) {
        puzzle = randomPuzzle(size, size, Math.max(2, Math.floor(size * size * 0.12)));
        tries++;
    }
    if (!puzzle) {
        report(size + '×' + size + ' 造题失败', false);
        continue;
    }

    const t0 = Date.now();
    const result = TT.solve(puzzle, { maxNodes: 60000, timeLimit: 5000 });
    const ms = Date.now() - t0;
    const guesses = result.stats ? result.stats.guesses : 0;
    const solvedOk = result.status === 'solved' &&
        checkSolution(TT, puzzle, result.steps[result.steps.length - 1].cells).length === 0;

    console.log('  ' + size + '×' + size + '：' + result.status +
        '，步骤 ' + result.steps.length + '，试探 ' + guesses +
        '，' + ms + ' ms');

    report(size + '×' + size + ' 结果不正确', solvedOk, result.message || '');
}

/* --------------------------------------------------------------------------
 * 4. 缺失数字模式：提示允许是 null（界面上的「?」）
 * ------------------------------------------------------------------------ */
console.log('4. 缺失数字模式（null 提示）');

function clonePuzzle(p) {
    return {
        rows: p.rows,
        cols: p.cols,
        trees: p.trees.map(function (row) { return row.slice(); }),
        rowHints: p.rowHints.slice(),
        colHints: p.colHints.slice()
    };
}

function solveAndCheck(puzzle, label) {
    const result = TT.solve(puzzle, { maxNodes: 30000, timeLimit: 3000 });
    if (result.status !== 'solved') {
        report(label + ' 求解失败', false, result.status + ' ' + (result.message || ''));
        return;
    }
    const last = result.steps[result.steps.length - 1];
    const problems = checkSolution(TT, puzzle, last.cells);
    report(label + ' 解不正确', problems.length === 0, problems.slice(0, 3).join('; '));
}

for (let i = 0; i < 24; i++) {
    const rows = 4 + (i % 5);
    const cols = 4 + ((i * 3) % 5);
    const base = randomPuzzle(rows, cols, Math.max(2, Math.floor(rows * cols * 0.12)));
    if (!base) {
        continue;
    }

    // 4.1 部分提示置 null：开局核对应当放行
    const mixed = clonePuzzle(base);
    for (let r = 0; r < rows; r += 2) {
        mixed.rowHints[r] = null;
    }
    for (let c = 1; c < cols; c += 2) {
        mixed.colHints[c] = null;
    }
    report('部分「?」提示开局核对应放行', TT.checkPuzzle(mixed) === null);
    solveAndCheck(mixed, '部分「?」提示 ' + rows + '×' + cols);

    // 4.2 行提示全部未知，只留列提示
    const rowUnknown = clonePuzzle(base);
    rowUnknown.rowHints = rowUnknown.rowHints.map(function () { return null; });
    solveAndCheck(rowUnknown, '行提示全「?」 ' + rows + '×' + cols);

    // 4.3 所有提示都未知
    const allUnknown = clonePuzzle(base);
    allUnknown.rowHints = allUnknown.rowHints.map(function () { return null; });
    allUnknown.colHints = allUnknown.colHints.map(function () { return null; });
    report('全「?」提示开局核对应放行', TT.checkPuzzle(allUnknown) === null);
    solveAndCheck(allUnknown, '全「?」提示 ' + rows + '×' + cols);
}

// 4.4 null 提示不能混进非法值：越界数字仍要被拦住
const badNull = {
    rows: 4,
    cols: 4,
    trees: [[true, false, false, false], [false, false, false, false], [false, false, false, false], [false, false, false, false]],
    rowHints: [null, 0, 0, 0],
    colHints: [9, 0, 0, 0]
};
report('列提示越界仍应被拦住', typeof TT.checkPuzzle(badNull) === 'string');

console.log('\n总计：通过 ' + pass + '，失败 ' + fail);
process.exitCode = fail === 0 ? 0 : 1;