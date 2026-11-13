/* ==========================================================================
 * tools/load-tt.js —— 开发用：在 Node 里加载浏览器端的模块
 *
 * 浏览器里靠 <script> 标签顺序加载 js/*.js；Node 没有 window，所以这里
 * 造一个假的 window 当容器，用 vm 依次执行这几个文件。
 * 这样命令行也能直接跑求解器，方便批量做自检和生成示例题。
 * ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');

// 注意顺序必须和页面里的 <script> 顺序一致
const FILES = ['core.js', 'i18n.js', 'rules.js', 'solver.js', 'backtrack.js', 'demos.js'];

function loadTT() {
    const sandbox = { window: {}, console: console, Date: Date, Math: Math, JSON: JSON };
    vm.createContext(sandbox);

    for (const file of FILES) {
        const full = path.join(JS_DIR, file);
        if (!fs.existsSync(full)) {
            continue; // demos.js 还没生成时跳过
        }
        const code = fs.readFileSync(full, 'utf8');
        vm.runInContext(code, sandbox, { filename: file });
    }

    return sandbox.window.TT;
}

/** 把 '.T' 字符串棋盘转成题目需要的 boolean 二维数组 */
function parseTrees(strings) {
    return strings.map(function (line) {
        return line.split('').map(function (ch) {
            return ch === 'T' || ch === '1';
        });
    });
}

/** 用已知的树 + 提示拼一道题 */
function makePuzzle(strings, rowHints, colHints) {
    return {
        rows: strings.length,
        cols: strings[0].length,
        trees: parseTrees(strings),
        rowHints: rowHints,
        colHints: colHints
    };
}

/**
 * 独立于求解器的一套"人工核对"：拿到一个解，检查它是否真的符合题目。
 * 求解器自己说自己解对了不算数，必须用另一套代码验一遍。
 *
 * 规则口径（和用户确认过的版本一致）：
 *   · 每行每列的帐篷数等于提示；
 *   · 两顶帐篷不能相邻（上下左右、斜角都不行）；
 *   · 树和帐篷"一对一配对"：每棵树配一顶帐篷，每顶帐篷只属于一棵树；
 *   · 但一顶帐篷旁边可以同时挨着好几棵树 —— 多出来的那些树各自还有自己的帐篷。
 *     这就是为什么最后要用"二分图匹配"来验，而不是去数帐篷旁边有几棵树。
 */
function checkSolution(TT, puzzle, cells) {
    const CELL = TT.CELL;
    const problems = [];
    const rows = puzzle.rows;
    const cols = puzzle.cols;

    const rowTents = new Array(rows).fill(0);
    const colTents = new Array(cols).fill(0);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (cells[r][c] === CELL.UNKNOWN) {
                problems.push('(' + r + ',' + c + ') 未确定');
            }
            if (cells[r][c] === CELL.TENT) {
                rowTents[r]++;
                colTents[c]++;
            }
        }
    }

    for (let r = 0; r < rows; r++) {
        if (puzzle.rowHints[r] !== null && rowTents[r] !== puzzle.rowHints[r]) {
            problems.push('第 ' + (r + 1) + ' 行帐篷数 ' + rowTents[r] + '，提示是 ' + puzzle.rowHints[r]);
        }
    }
    for (let c = 0; c < cols; c++) {
        if (puzzle.colHints[c] !== null && colTents[c] !== puzzle.colHints[c]) {
            problems.push('第 ' + (c + 1) + ' 列帐篷数 ' + colTents[c] + '，提示是 ' + puzzle.colHints[c]);
        }
    }

    const dirs4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const dirs8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

    function at(r, c) {
        if (r < 0 || r >= rows || c < 0 || c >= cols) {
            return -1;
        }
        return cells[r][c];
    }

    // 帐篷之间不能相邻；帐篷必须至少挨着一棵树
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (cells[r][c] !== CELL.TENT) {
                continue;
            }
            let nearTrees = 0;
            for (const d of dirs4) {
                if (at(r + d[0], c + d[1]) === CELL.TREE) nearTrees++;
            }
            if (nearTrees === 0) {
                problems.push('帐篷(' + r + ',' + c + ') 旁边没有树，配不出去');
            }
            for (const d of dirs8) {
                if (at(r + d[0], c + d[1]) === CELL.TENT) {
                    problems.push('帐篷(' + r + ',' + c + ') 与另一个帐篷相邻');
                    break;
                }
            }
        }
    }

    // 树和帐篷能否一对一配上（独立写一遍匹配，不复用求解器的代码）
    const treePos = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (cells[r][c] === CELL.TREE) {
                treePos.push([r, c]);
            }
        }
    }

    const tentKeys = [];
    const tentIndex = {};
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (cells[r][c] === CELL.TENT) {
                tentIndex[r + ',' + c] = tentKeys.length;
                tentKeys.push([r, c]);
            }
        }
    }

    // 每棵树能配哪几顶帐篷
    const optionOfTree = treePos.map(function (pos) {
        const list = [];
        for (const d of dirs4) {
            const key = (pos[0] + d[0]) + ',' + (pos[1] + d[1]);
            if (tentIndex[key] !== undefined) {
                list.push(tentIndex[key]);
            }
        }
        return list;
    });

    // 暴力回溯找配对（树的数量不多，这样写最直白，也最容易看出对不对）
    const takenBy = new Array(tentKeys.length).fill(-1);

    function pairUp(treeIdx) {
        if (treeIdx >= treePos.length) {
            return true;
        }
        const options = optionOfTree[treeIdx];
        for (const tent of options) {
            if (takenBy[tent] >= 0) {
                continue;
            }
            takenBy[tent] = treeIdx;
            if (pairUp(treeIdx + 1)) {
                return true;
            }
            takenBy[tent] = -1;
        }
        return false;
    }

    if (!pairUp(0)) {
        problems.push('树和帐篷配不成一对一的关系（有树抢不到属于自己的帐篷）');
    }

    // 树的数量应该等于帐篷总数
    if (treePos.length !== rowTents.reduce((a, b) => a + b, 0)) {
        problems.push('树 ' + treePos.length + ' 棵，帐篷 ' + rowTents.reduce((a, b) => a + b, 0) + ' 个，数量不等');
    }

    return problems;
}

module.exports = { loadTT, makePuzzle, parseTrees, checkSolution };
