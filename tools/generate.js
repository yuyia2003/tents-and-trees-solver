/* ==========================================================================
 * tools/generate.js —— 开发用：随机造一道合法的树与帐篷题
 *
 * 做法：
 *   1. 随机撒帐篷，保证任意两顶帐篷都不相邻（含斜角）
 *   2. 每顶帐篷各挑一个上下左右的空格当"它的树"
 *   3. 每行每列的帐篷数量就是提示数字
 *
 * 这样造出来的题一定"有解"，因为答案就是我们撒的那套帐篷。
 * 但可能有多个解，所以还要另外做唯一性检查。
 * ========================================================================== */

function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
    }
    return list;
}

function isTouching(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
}

/**
 * @param {number} rows
 * @param {number} cols
 * @param {number} tentTarget 想要放多少顶帐篷
 * @returns {object|null} 题目对象，造不出来返回 null
 */
function randomPuzzle(rows, cols, tentTarget) {
    const cells = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            cells.push([r, c]);
        }
    }
    shuffle(cells);

    // 1. 撒帐篷
    const tents = [];
    for (let i = 0; i < cells.length && tents.length < tentTarget; i++) {
        const r = cells[i][0];
        const c = cells[i][1];
        let ok = true;
        for (const t of tents) {
            if (isTouching(r, c, t[0], t[1])) {
                ok = false;
                break;
            }
        }
        if (ok) {
            tents.push([r, c]);
        }
    }
    if (tents.length < tentTarget * 0.8) {
        return null; // 撒得太少，重新来
    }

    // 2. 给每顶帐篷配一棵树
    //    注意：树旁边可以挨着别的帐篷（那是别人的帐篷），所以不用排除，
    //    只要求这个格子本身还没被别的树占掉即可。
    const trees = []; // [[r, c], ...]
    const treeKeys = {};

    for (const tent of tents) {
        const options = [];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const d of dirs) {
            const r = tent[0] + d[0];
            const c = tent[1] + d[1];
            if (r < 0 || r >= rows || c < 0 || c >= cols) {
                continue;
            }
            if (treeKeys[r + ',' + c]) {
                continue; // 这个格子已经是别的树的
            }
            options.push([r, c]);
        }
        if (options.length === 0) {
            return null;
        }
        const pick = options[Math.floor(Math.random() * options.length)];
        trees.push(pick);
        treeKeys[pick[0] + ',' + pick[1]] = true;
    }

    // 3. 统计提示
    const treesGrid = [];
    for (let r = 0; r < rows; r++) {
        treesGrid.push(new Array(cols).fill(false));
    }
    for (const t of trees) {
        treesGrid[t[0]][t[1]] = true;
    }

    const rowHints = new Array(rows).fill(0);
    const colHints = new Array(cols).fill(0);
    for (const t of tents) {
        rowHints[t[0]]++;
        colHints[t[1]]++;
    }

    return {
        rows: rows,
        cols: cols,
        trees: treesGrid,
        rowHints: rowHints,
        colHints: colHints,
        // 顺手记下标准答案，测试时可以对照
        tents: tents
    };
}

module.exports = { randomPuzzle: randomPuzzle, isTouching: isTouching, shuffle: shuffle };
