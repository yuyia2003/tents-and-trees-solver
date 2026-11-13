/* ==========================================================================
 * core.js —— 第 1 层：基础数据
 *
 * 这个文件只做三件事：
 *   1. 说明"一个格子有哪几种状态"
 *   2. 把题目变成程序里能计算的"局面"
 *   3. 提供所有模块都会用到的通用小工具（取格子、改格子、找邻居…）
 *
 * 读代码的顺序就是文件编号的顺序：core → rules → solver → backtrack
 *                                        → demos → render → app
 * ========================================================================== */

// 所有模块都挂在这个全局对象上（window.TT 可以念作 "Tree & Tent"）。
// 这样做是为了不把几十个函数直接丢到全局变量里，互相不污染。
window.TT = window.TT || {};

(function (TT) {
    'use strict';

    /* ------------------------------------------------------------------
     * 1. 格子状态
     * ------------------------------------------------------------------ */

    // 一个格子只可能是下面四种状态之一。
    const CELL = {
        UNKNOWN: 0, // 还没确定：求解器接下来要处理的就是这些格子
        TENT: 1,    // 帐篷
        GRASS: 2,   // 草地：确定这里没有帐篷
        TREE: 3     // 树：题目给定，求解过程中永远不会变
    };

    TT.CELL = CELL;

    // 调试、测试、写日志时用到的中文名字
    TT.CELL_NAME = {
        0: '未定',
        1: '帐篷',
        2: '草地',
        3: '树'
    };

    // 题目尺寸的上下限（本次扩展到最大 20×20）
    TT.MIN_SIZE = 4;
    TT.MAX_SIZE = 20;

    /* ------------------------------------------------------------------
     * 2. 题目与局面
     *
     * 题目（puzzle）：玩家给的东西，只有树的位置和每行每列的提示数字。
     *   {
     *     rows: 6,
     *     cols: 6,
     *     trees: [[true, false, ...], ...],   // 每格是不是树
     *     rowHints: [2, 1, 1, 2, 1, 0],       // 左边每行的提示
     *     colHints: [2, 0, 2, 0, 2, 1]        // 上面每列的提示
     *   }
     *
     * 局面（state）：求解过程中不断变化的东西。
     *   {
     *     rows, cols,
     *     cells: [[0, 3, 2, ...], ...],  // 每格的当前状态
     *     rowLeft: [2, 1, ...],          // 这一行"还差几个帐篷没放"
     *     colLeft: [2, 0, ...]           // 这一列"还差几个帐篷没放"
     *   }
     *
     * 单独维护 rowLeft / colLeft，就不必每次去数一遍，规则写起来能短很多。
     * ------------------------------------------------------------------ */

    // 把题目复制成一份"原始局面"
    TT.createState = function (puzzle) {
        const state = {
            rows: puzzle.rows,
            cols: puzzle.cols,
            cells: [],
            rowLeft: [],
            colLeft: [],
            // 下面两个是"缓存用"的小账本，不参与推理本身：
            // version 每次改格子就 +1，maskCache 是算好的"能不能放帐篷"那张表
            version: 0,
            maskCache: null
        };

        for (let r = 0; r < state.rows; r++) {
            const line = [];
            for (let c = 0; c < state.cols; c++) {
                line.push(puzzle.trees[r][c] ? CELL.TREE : CELL.UNKNOWN);
            }
            state.cells.push(line);
            state.rowLeft.push(puzzle.rowHints[r]);
        }

        for (let c = 0; c < state.cols; c++) {
            state.colLeft.push(puzzle.colHints[c]);
        }

        return state;
    };

    // 完整复制一份局面。回溯搜索时每走一个分支都要复制，保证互不影响。
    TT.cloneState = function (state) {
        const copy = {
            rows: state.rows,
            cols: state.cols,
            cells: [],
            rowLeft: state.rowLeft.slice(),
            colLeft: state.colLeft.slice(),
            version: state.version,
            // 格子内容完全一样，那张表可以直接共用（只在读取，不会被改动）
            maskCache: state.maskCache,
            maskCacheVersion: state.maskCacheVersion
        };

        for (let r = 0; r < state.rows; r++) {
            copy.cells.push(state.cells[r].slice());
        }

        return copy;
    };

    TT.getCell = function (state, r, c) {
        return state.cells[r][c];
    };

    /**
     * 把一格改成指定状态。
     * 只允许"未定"改成别的状态——已经确定的状态不允许被覆盖，
     * 这样一旦两条规则得出互相矛盾的结论，会立刻暴露成错误，而不是被悄悄改掉。
     *
     * @returns {boolean} 真的改动了才返回 true
     */
    TT.setCell = function (state, r, c, type) {
        if (state.cells[r][c] !== CELL.UNKNOWN) {
            return false;
        }
        state.cells[r][c] = type;

        // 放下一个帐篷，对应的行、列"还差的数量"就少一个。
        // 注意：缺失数字模式下这一行/列的提示是 null（不知道要几个），
        // 没有"还差几个"这回事，就不减。
        if (type === CELL.TENT) {
            if (state.rowLeft[r] !== null) {
                state.rowLeft[r]--;
            }
            if (state.colLeft[c] !== null) {
                state.colLeft[c]--;
            }
        }

        // 局面变了：缓存作废（下一次问"能不能放帐篷"时重新算）
        state.version++;
        state.maskCache = null;

        return true;
    };

    TT.inBounds = function (state, r, c) {
        return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
    };

    /* ------------------------------------------------------------------
     * 3. 找邻居
     *
     * 树与帐篷里有两个不同的"邻近"：
     *   上下左右（4 邻）—— 帐篷只能和树这样相邻
     *   周围一圈（8 邻）—— 帐篷之间不能这样相邻（斜着也不行）
     * ------------------------------------------------------------------ */

    const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 上 下 左 右
    const DIRS8 = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    TT.DIRS4 = DIRS4;
    TT.DIRS8 = DIRS8;

    /** 遍历 4 邻格：callback(r, c, type) */
    TT.forEachNeighbor4 = function (state, r, c, callback) {
        for (let i = 0; i < DIRS4.length; i++) {
            const rr = r + DIRS4[i][0];
            const cc = c + DIRS4[i][1];
            if (TT.inBounds(state, rr, cc)) {
                callback(rr, cc, state.cells[rr][cc]);
            }
        }
    };

    /** 遍历 8 邻格：callback(r, c, type) */
    TT.forEachNeighbor8 = function (state, r, c, callback) {
        for (let i = 0; i < DIRS8.length; i++) {
            const rr = r + DIRS8[i][0];
            const cc = c + DIRS8[i][1];
            if (TT.inBounds(state, rr, cc)) {
                callback(rr, cc, state.cells[rr][cc]);
            }
        }
    };

    /* ------------------------------------------------------------------
     * 4. 数格子
     * ------------------------------------------------------------------ */

    /** 某一行里"未定"的格子有多少个 */
    TT.unknownInRow = function (state, r) {
        let count = 0;
        for (let c = 0; c < state.cols; c++) {
            if (state.cells[r][c] === CELL.UNKNOWN) {
                count++;
            }
        }
        return count;
    };

    /** 某一列里"未定"的格子有多少个 */
    TT.unknownInCol = function (state, c) {
        let count = 0;
        for (let r = 0; r < state.rows; r++) {
            if (state.cells[r][c] === CELL.UNKNOWN) {
                count++;
            }
        }
        return count;
    };

    /** 某一行里已经放好的帐篷有几个 */
    TT.tentsInRow = function (state, r) {
        let count = 0;
        for (let c = 0; c < state.cols; c++) {
            if (state.cells[r][c] === CELL.TENT) {
                count++;
            }
        }
        return count;
    };

    /** 某一列里已经放好的帐篷有几个 */
    TT.tentsInCol = function (state, c) {
        let count = 0;
        for (let r = 0; r < state.rows; r++) {
            if (state.cells[r][c] === CELL.TENT) {
                count++;
            }
        }
        return count;
    };

    /* ------------------------------------------------------------------
     * 5. "试一下再退回"的小工具
     *
     * 有些推理需要先假设某个格子是帐篷，看看会不会出错。
     * 试的时候要临时改局面，试完必须原样退回，否则后面的推理全乱。
     * tryCells 负责这个"改了又还原"的过程。
     * ------------------------------------------------------------------ */

    /**
     * @param {object} state   当前局面
     * @param {Array}  changes [[r, c, type], ...] 想临时做的改动
     * @param {Function} todo  在改动生效后执行，返回值会原样返回给调用者
     */
    TT.tryCells = function (state, changes, todo) {
        // 先把要改的格子和行列计数存起来
        const saved = [];        // [[r, c, 原来的状态], ...]
        const seen = {};         // 同一格被改了两次时，只存第一次的原样
        const savedRowLeft = state.rowLeft.slice();
        const savedColLeft = state.colLeft.slice();
        const savedVersion = state.version;

        for (let i = 0; i < changes.length; i++) {
            const r = changes[i][0];
            const c = changes[i][1];
            const type = changes[i][2];
            const key = r + ',' + c;

            if (!seen[key]) {
                seen[key] = true;
                saved.push([r, c, state.cells[r][c]]);
            }

            // 只覆盖"未定"的格子
            if (state.cells[r][c] === CELL.UNKNOWN) {
                state.cells[r][c] = type;
                if (type === CELL.TENT) {
                    if (state.rowLeft[r] !== null) {
                        state.rowLeft[r]--;
                    }
                    if (state.colLeft[c] !== null) {
                        state.colLeft[c]--;
                    }
                }
            }
        }

        // 局面变了，缓存的"能不能放帐篷"那张表要作废
        state.version++;
        state.maskCache = null;

        try {
            return todo();
        } finally {
            // 无论如何都要还原
            for (let i = 0; i < saved.length; i++) {
                state.cells[saved[i][0]][saved[i][1]] = saved[i][2];
            }
            state.rowLeft = savedRowLeft;
            state.colLeft = savedColLeft;
            state.version = savedVersion;
            state.maskCache = null;
        }
    };

    /* ------------------------------------------------------------------
     * 6. 给界面看的"快照"
     *
     * 求解过程要记录每一步的局面，界面才能逐步回放。
     * 快照只是一份朴素的二维数组，不参与计算，所以直接复制格子数字即可。
     * ------------------------------------------------------------------ */

    TT.snapshot = function (state) {
        const snap = [];
        for (let r = 0; r < state.rows; r++) {
            snap.push(state.cells[r].slice());
        }
        return snap;
    };

    /** 局面签名：内容完全相同的两个局面，签名也相同 */
    TT.signature = function (state) {
        let text = '';
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                text += state.cells[r][c];
            }
            text += '|';
        }
        return text;
    };

    /** 把局面变成一串字符，方便在控制台里看 / 做单元测试 */
    TT.toText = function (state) {
        const symbol = {
            0: '.', // 未定
            1: 'A', // 帐篷（A 取自 amber）
            2: 'x', // 草地
            3: 'T'  // 树
        };
        let text = '';
        for (let r = 0; r < state.rows; r++) {
            let line = '';
            for (let c = 0; c < state.cols; c++) {
                line += symbol[state.cells[r][c]];
            }
            text += line + '\n';
        }
        return text;
    };

    /* ------------------------------------------------------------------
     * 7. 配对：树与帐篷的一一对应（这一节是整个程序的地基）
     *
     * 规则里最容易被理解错的一点是"配对"到底指什么。正确的说法是：
     *
     *   · 每棵树必须配上一顶帐篷，配对的那顶帐篷就在它上下左右；
     *   · 每顶帐篷只属于一棵树；
     *   · 但帐篷旁边可以同时挨着好几棵树 —— 多出来的那些树只是"顺便蹭在
     *     旁边"，它们各自还有自己配对的帐篷。
     *
     * 画成图就是这样（A、B 是帐篷，上方/下方的两棵树分别配对给 A、B）：
     *
     *       树          ← 这棵树配给下面的帐篷
     *      [帐篷 A]
     *       树          ← 这棵树不配 A，它配给下面那顶帐篷
     *      [帐篷 B]
     *
     * 所以判断局面对不对，不能去数"帐篷旁边有几棵树"，而要看：
     * 这些树和这些帐篷能不能两两配上对（数学上叫二分图匹配）。
     * 下面的 matchAllTrees 就是在算这件事。
     * ------------------------------------------------------------------ */

    /** 一格上下左右有几棵树 */
    TT.treeCountAround = function (state, r, c) {
        let count = 0;
        TT.forEachNeighbor4(state, r, c, function (rr, cc, type) {
            if (type === CELL.TREE) {
                count++;
            }
        });
        return count;
    };

    /** 一格上下左右有几顶帐篷 */
    TT.tentCountAround = function (state, r, c) {
        let count = 0;
        TT.forEachNeighbor4(state, r, c, function (rr, cc, type) {
            if (type === CELL.TENT) {
                count++;
            }
        });
        return count;
    };

    /** 一格的周围一圈（8 邻）里有没有帐篷 */
    TT.hasTentAround8 = function (state, r, c) {
        let found = false;
        TT.forEachNeighbor8(state, r, c, function (rr, cc, type) {
            if (type === CELL.TENT) {
                found = true;
            }
        });
        return found;
    };

    /**
     * 一个"未定"格子还有没有可能变成帐篷。
     *
     * 两个必要条件：
     *   1. 上下左右至少有一棵树 —— 帐篷必须紧挨着某棵树，才配得出去；
     *   2. 周围一圈没有帐篷 —— 两顶帐篷不能相邻（斜着也不行）。
     *
     * 注意这只是"必要"，不是"一定"：真正的结论还要靠规则和搜索推出来。
     */
    TT.canBeTent = function (state, r, c) {
        if (state.cells[r][c] !== CELL.UNKNOWN) {
            return false;
        }
        if (TT.treeCountAround(state, r, c) === 0) {
            return false;
        }
        return !TT.hasTentAround8(state, r, c);
    };

    /**
     * 给整个棋盘算一张"这个格子还能不能变成帐篷"的表。
     *
     * 规则每次都要问几十上百遍"这格能不能放帐篷"，一次算好整张表，
     * 后面直接查表，速度快很多。表里 true = 还有可能，false = 不可能。
     *
     * 结果会存在局面上（maskCache），只要格子没动过就直接复用。
     * 局面一改（version +1），缓存自动作废。
     */
    TT.tentMask = function (state) {
        if (state.maskCache && state.maskCacheVersion === state.version) {
            return state.maskCache;
        }

        const rows = state.rows;
        const cols = state.cols;
        const cells = state.cells;
        const mask = [];

        for (let r = 0; r < rows; r++) {
            const line = new Array(cols);
            for (let c = 0; c < cols; c++) {
                let usable = false;

                if (cells[r][c] === CELL.UNKNOWN) {
                    // 上下左右有没有树
                    let hasTree = false;
                    for (let k = 0; k < 4; k++) {
                        const rr = r + DIRS4[k][0];
                        const cc = c + DIRS4[k][1];
                        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && cells[rr][cc] === CELL.TREE) {
                            hasTree = true;
                            break;
                        }
                    }

                    // 周围一圈有没有帐篷
                    if (hasTree) {
                        let hasTent = false;
                        for (let k = 0; k < 8; k++) {
                            const rr = r + DIRS8[k][0];
                            const cc = c + DIRS8[k][1];
                            if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && cells[rr][cc] === CELL.TENT) {
                                hasTent = true;
                                break;
                            }
                        }
                        usable = !hasTent;
                    }
                }

                line[c] = usable;
            }
            mask.push(line);
        }

        state.maskCache = mask;
        state.maskCacheVersion = state.version;
        return mask;
    };

    /**
     * 一棵树"可能配对"的所有格子。
     *
     * 两种都算：
     *   · 上下左右已经有帐篷 —— 这顶帐篷可能就是它的（未必，别的树也可能用掉）
     *   · 上下左右还是未定，而且还有可能变成帐篷
     *
     * 返回的是"候选集合"，是一个超集：真正的配对一定落在这些格子里，
     * 但未必每个都会被用到。推理时用超集是安全的（结论只会更保守）。
     */
    TT.possibilities = function (state, r, c, mask) {
        mask = mask || TT.tentMask(state);
        const list = [];
        TT.forEachNeighbor4(state, r, c, function (rr, cc, type) {
            if (type === CELL.TENT) {
                list.push([rr, cc]);
            } else if (type === CELL.UNKNOWN && mask[rr][cc]) {
                list.push([rr, cc]);
            }
        });
        return list;
    };

    /** 把棋盘上所有的树按顺序列出来：[[r, c], ...] */
    TT.listTrees = function (state) {
        const trees = [];
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                if (state.cells[r][c] === CELL.TREE) {
                    trees.push([r, c]);
                }
            }
        }
        return trees;
    };

    /**
     * 每棵树都能配上一顶帐篷吗？（二分图匹配 / 匈牙利算法）
     *
     * 把"树"放在左边，"可能当帐篷的格子"放在右边，能连线的就算邻居。
     * 然后尽量多地把树和格子配上对；如果每棵树都配上了，这个局面就还有戏。
     *
     * @param {object} opts {
     *        mask:      tentMask 算好的表，省得再算一遍（可不传）
     *        tentsOnly: true 时只允许用"已经放好的帐篷"配对，
     *                   用于判断"是不是真的解完了"
     *      }
     * @returns {{ok: boolean, unmatched: Array}} ok = 全部配上；
     *          unmatched = 配不上的树的位置，用来写错误提示
     */
    TT.matchAllTrees = function (state, opts) {
        opts = opts || {};
        const tentsOnly = opts.tentsOnly === true;
        const mask = opts.mask || (tentsOnly ? null : TT.tentMask(state));
        const rows = state.rows;
        const cols = state.cols;
        const cells = state.cells;

        const trees = TT.listTrees(state);
        if (trees.length === 0) {
            return { ok: true, unmatched: [] };
        }

        // 右边的"格子"直接用 r*cols+c 当编号，省去建字典的开销
        const total = rows * cols;
        const adj = [];             // 每棵树能连到的格子编号

        for (let i = 0; i < trees.length; i++) {
            const r = trees[i][0];
            const c = trees[i][1];
            const list = [];

            for (let k = 0; k < 4; k++) {
                const rr = r + DIRS4[k][0];
                const cc = c + DIRS4[k][1];
                if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) {
                    continue;
                }
                const type = cells[rr][cc];
                if (type === CELL.TENT) {
                    list.push(rr * cols + cc);
                } else if (type === CELL.UNKNOWN && !tentsOnly && mask[rr][cc]) {
                    list.push(rr * cols + cc);
                }
            }

            adj.push(list);
        }

        const owner = new Int32Array(total).fill(-1); // 格子被第几棵树占了，-1 表示空着

        // 匈牙利算法：给第 treeIdx 棵树找位置，找不到就返回 false
        function augment(treeIdx, visited) {
            const list = adj[treeIdx];
            for (let i = 0; i < list.length; i++) {
                const cell = list[i];
                if (visited[cell]) {
                    continue;
                }
                visited[cell] = 1;
                if (owner[cell] < 0 || augment(owner[cell], visited)) {
                    owner[cell] = treeIdx;
                    return true;
                }
            }
            return false;
        }

        const matched = [];
        for (let i = 0; i < adj.length; i++) {
            matched.push(false);
        }

        for (let i = 0; i < adj.length; i++) {
            if (adj[i].length === 0) {
                continue;
            }
            const visited = new Uint8Array(total);
            if (augment(i, visited)) {
                matched[i] = true;
            }
        }

        const unmatched = [];
        for (let i = 0; i < trees.length; i++) {
            if (!matched[i]) {
                unmatched.push(trees[i]);
            }
        }

        return { ok: unmatched.length === 0, unmatched: unmatched };
    };

    /**
     * 一行 / 一列最多还能再放几个帐篷（把"帐篷不能挨着"也算进去）。
     *
     * 用动态规划：从左到右一格一格看，
     *   dp[i] = 前 i 个格子里最多能放几个帐篷
     *   dp[i] = max( dp[i-1], dp[i-2] + 1 )   ← 这格不放 / 这格放
     * 要求"这格能放"必须是未定、而且 mask 说它还有可能。
     */
    TT.lineMaxTents = function (state, isRow, index, mask) {
        mask = mask || TT.tentMask(state);
        const length = isRow ? state.cols : state.rows;

        let twoAgo = 0; // dp[i-2]
        let oneAgo = 0; // dp[i-1]

        for (let i = 0; i < length; i++) {
            const r = isRow ? index : i;
            const c = isRow ? i : index;
            const usable = state.cells[r][c] === CELL.UNKNOWN && mask[r][c];
            const current = usable ? Math.max(oneAgo, twoAgo + 1) : oneAgo;
            twoAgo = oneAgo;
            oneAgo = current;
        }

        return oneAgo;
    };

    /* ------------------------------------------------------------------
     * 8. 题目检查
     *
     * 玩家填的提示数字可能自相矛盾，先查一遍，能给出人话错误提示，
     * 免得求解器在里面绕圈子。
     * ------------------------------------------------------------------ */

    /**
     * @returns {string|null} 没问题返回 null，有问题返回一句中文说明
     */
    TT.checkPuzzle = function (puzzle) {
        const rows = puzzle.rows;
        const cols = puzzle.cols;

        if (rows < TT.MIN_SIZE || rows > TT.MAX_SIZE ||
            cols < TT.MIN_SIZE || cols > TT.MAX_SIZE) {
            return '棋盘尺寸必须在 ' + TT.MIN_SIZE + ' 到 ' + TT.MAX_SIZE + ' 之间。';
        }

        let treeCount = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (puzzle.trees[r][c]) {
                    treeCount++;
                }
            }
        }

        let totalRow = 0;
        let totalCol = 0;
        let anyMissing = false; // 有没有提示被标成"?"（缺失数字）

        for (let r = 0; r < rows; r++) {
            const hint = puzzle.rowHints[r];
            if (hint === null || hint === undefined) {
                anyMissing = true;
                continue; // 缺失数字：这一行数量不限，后面校验也跳过它
            }
            if (!Number.isInteger(hint) || hint < 0 || hint > cols) {
                return '第 ' + (r + 1) + ' 行左边的提示必须是 0 到 ' + cols +
                    ' 的整数，或者填「?」表示不知道。';
            }
            totalRow += hint;
        }

        for (let c = 0; c < cols; c++) {
            const hint = puzzle.colHints[c];
            if (hint === null || hint === undefined) {
                anyMissing = true;
                continue;
            }
            if (!Number.isInteger(hint) || hint < 0 || hint > rows) {
                return '第 ' + (c + 1) + ' 列上面的提示必须是 0 到 ' + rows +
                    ' 的整数，或者填「?」表示不知道。';
            }
            totalCol += hint;
        }

        // 只要有一个数字不知道，就没法在开局核对"合计是否相等、树和帐篷是否一样多"，
        // 这些留到求解时按已知数字和配对关系去判断。
        if (anyMissing) {
            return null;
        }

        if (totalRow !== totalCol) {
            return '左边提示合计 ' + totalRow + '，上面提示合计 ' + totalCol +
                '，两者必须相等（每个帐篷同时被一行和一列统计）。';
        }

        if (treeCount !== totalRow) {
            return '棋盘上放了 ' + treeCount + ' 棵树，但提示合计是 ' + totalRow +
                '。每棵树对应一个帐篷，两个数字必须相同。';
        }

        return null;
    };

})(window.TT);
