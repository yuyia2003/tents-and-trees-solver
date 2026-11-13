/* ==========================================================================
 * backtrack.js —— 第 4 层：试探与回溯
 *
 * 逻辑推理卡住的时候（比如题目本身需要"假设一下试试"），就用这里。
 *
 * 核心思路非常朴素：
 *   挑一棵还没认领到帐篷的树，把它的每一个候选位置都试一遍；
 *   每试一个就把局面复制一份往下推，推不动就退回来换下一个候选。
 * 这就是"深度优先搜索 + 回溯"。
 *
 * 这里必须把"配对"的含意记住：
 *   · 一棵树只能认领一顶帐篷；一顶帐篷也只能被一棵树认领；
 *   · 但一顶帐篷旁边可以挨着好几棵树，别的树只是"蹭在旁边"，
 *     它们各自还要去找属于自己的那顶帐篷。
 * 所以搜索时维护两份小账本：
 *   assigned[i] —— 第 i 棵树认领了没有
 *   used["r,c"] —— 这一格帐篷已经被谁认领了
 *
 * 为了让搜索不至于爆炸，用上了两个技巧：
 *   1. 每走一步都先跑一遍推理规则（相当于不停地剪枝）
 *   2. 优先挑"候选最少"的那棵树下手，选择越少，试错越少
 * ========================================================================== */

(function (TT) {
    'use strict';

    const CELL = TT.CELL;

    const BUDGET_EXCEEDED = 'budget-exceeded';

    /** 把棋盘上剩下的空格全部标成草地（树都认领完了的时候用） */
    function grassAllUnknown(state) {
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                if (state.cells[r][c] === CELL.UNKNOWN) {
                    TT.setCell(state, r, c, CELL.GRASS);
                }
            }
        }
    }

    /**
     * 一棵树现在还能认领哪些格子。
     * @returns {Array} [[r, c, 是不是已经放好的帐篷], ...]
     *          未定的候选排在前面，已经放好的帐篷排在后面（先试更容易的分支）
     */
    function possibleCells(state, tree, used, mask) {
        const fresh = [];
        const existing = [];

        TT.forEachNeighbor4(state, tree[0], tree[1], function (rr, cc, type) {
            const key = rr + ',' + cc;
            if (type === CELL.TENT) {
                if (!used[key]) {
                    existing.push([rr, cc, true]); // 这顶帐篷还没主人，可能是它的
                }
            } else if (type === CELL.UNKNOWN && mask[rr][cc]) {
                fresh.push([rr, cc, false]);
            }
        });

        return fresh.concat(existing);
    }

    /** 挑一棵"还没认领、候选又最少"的树 */
    function chooseTree(state, trees, assigned, used, mask) {
        let best = null;

        for (let i = 0; i < trees.length; i++) {
            if (assigned[i]) {
                continue;
            }

            const list = possibleCells(state, trees[i], used, mask);
            if (list.length === 0) {
                return null; // 有树没地方可去了，这个分支走不通
            }

            if (!best || list.length < best.list.length) {
                best = { index: i, tree: trees[i], list: list };
            }
        }

        return best;
    }

    /* ------------------------------------------------------------------
     * 找出一个解
     * ------------------------------------------------------------------ */

    /**
     * @param {object} baseState  已经推理到推不动的局面（不会被修改）
     * @param {object} limits     { maxNodes, timeLimit }
     * @returns {{decisions: Array|null, timeout: boolean, nodes: number}}
     *          decisions 是一串"认领"： [{ tree: [r, c], cell: [r, c], pair: boolean }, ...]
     *          pair = true 表示这一格本来就已经是帐篷了，只是确认配对关系
     */
    TT.searchSolution = function (baseState, limits) {
        const maxNodes = (limits && limits.maxNodes) || 20000;
        const timeLimit = (limits && limits.timeLimit) || 2000;
        const deadline = Date.now() + timeLimit;
        const stats = { nodes: 0, timeout: false };

        const trees = TT.listTrees(baseState);
        const assigned = new Array(trees.length).fill(false);
        const used = {};

        function budgetOut() {
            if (stats.nodes > maxNodes || Date.now() > deadline) {
                stats.timeout = true;
                throw BUDGET_EXCEEDED;
            }
        }

        function finish(state, remaining) {
            // 树都认领完了：剩下的空格只可能是草地
            if (remaining === 0) {
                grassAllUnknown(state);
            }
            return TT.isSolved(state) ? [] : null;
        }

        function dfs(state, remaining) {
            budgetOut();
            stats.nodes++;

            // 先把能推的推干净
            const result = TT.propagate(state, { useTrial: false });
            if (result.status === 'invalid') {
                return null;
            }
            if (result.status === 'solved' || remaining === 0) {
                return finish(state, remaining);
            }

            const mask = TT.tentMask(state);
            const branch = chooseTree(state, trees, assigned, used, mask);
            if (!branch) {
                return null;
            }

            for (let i = 0; i < branch.list.length; i++) {
                const cand = branch.list[i];
                const key = cand[0] + ',' + cand[1];

                const next = TT.cloneState(state);
                if (!cand[2]) {
                    TT.placeGuess(next, branch.tree, cand);
                }
                if (TT.validate(next)) {
                    continue; // 一放就矛盾，直接换下一个候选
                }

                used[key] = true;
                assigned[branch.index] = true;

                const rest = dfs(next, remaining - 1);

                assigned[branch.index] = false;
                delete used[key];

                if (rest) {
                    return [{ tree: branch.tree, cell: [cand[0], cand[1]], pair: cand[2] }].concat(rest);
                }
            }

            return null;
        }

        try {
            const decisions = dfs(TT.cloneState(baseState), trees.length);
            return { decisions: decisions, timeout: false, nodes: stats.nodes };
        } catch (e) {
            if (e === BUDGET_EXCEEDED) {
                return { decisions: null, timeout: true, nodes: stats.nodes };
            }
            throw e;
        }
    };

    /* ------------------------------------------------------------------
     * 数一数有几个解（判断题目是否"唯一解"时用）
     *
     * 生成示例题的时候要用它：一道题如果有很多解，拿来当示例就没意思了。
     *
     * 注意按"配对数"来数会重复：同一套棋盘结果，可能存在好几种配对方式
     * （一顶帐篷旁边有两棵树时，它跟谁配对都可以）。
     * 所以这里按"棋盘结果"去重，同一个结果只算一次。
     * ------------------------------------------------------------------ */

    TT.countSolutions = function (baseState, limit, limits) {
        const maxCount = limit || 2;
        const maxNodes = (limits && limits.maxNodes) || 200000;
        const deadline = Date.now() + ((limits && limits.timeLimit) || 5000);

        let count = 0;
        let nodes = 0;
        let stop = false;
        let timeout = false;

        const trees = TT.listTrees(baseState);
        const assigned = new Array(trees.length).fill(false);
        const used = {};
        const seen = {};

        function record(state) {
            const sig = TT.signature(state);
            if (seen[sig]) {
                return;
            }
            seen[sig] = true;
            count++;
            if (count >= maxCount) {
                stop = true;
            }
        }

        function dfs(state, remaining) {
            if (stop) {
                return;
            }
            nodes++;
            if (nodes > maxNodes || Date.now() > deadline) {
                stop = true;
                timeout = true;
                return;
            }

            const result = TT.propagate(state, { useTrial: false });
            if (result.status === 'invalid') {
                return;
            }

            if (result.status === 'solved' || remaining === 0) {
                if (remaining === 0) {
                    grassAllUnknown(state);
                }
                if (TT.isSolved(state)) {
                    record(state);
                }
                return;
            }

            const mask = TT.tentMask(state);
            const branch = chooseTree(state, trees, assigned, used, mask);
            if (!branch) {
                return;
            }

            for (let i = 0; i < branch.list.length && !stop; i++) {
                const cand = branch.list[i];
                const key = cand[0] + ',' + cand[1];

                const next = TT.cloneState(state);
                if (!cand[2]) {
                    TT.placeGuess(next, branch.tree, cand);
                }
                if (TT.validate(next)) {
                    continue;
                }

                used[key] = true;
                assigned[branch.index] = true;

                dfs(next, remaining - 1);

                assigned[branch.index] = false;
                delete used[key];
            }
        }

        dfs(TT.cloneState(baseState), trees.length);

        return { count: count, timeout: timeout, nodes: nodes };
    };

})(window.TT);
