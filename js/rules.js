/* ==========================================================================
 * rules.js —— 第 2 层：推理规则
 *
 * 这个文件是"人类解题思路"的集合。
 * 每条规则只做一件事：看一遍局面，把能确定的格子确定下来。
 * 规则只知道常识，不知道搜索，也不知道界面长什么样。
 *
 * 所有规则都建立在同一条常识上（core.js 第 7 节详细说过）：
 *   · 树和帐篷是一对一配对：每棵树配一顶帐篷，每顶帐篷只属于一棵树；
 *   · 但帐篷旁边可以同时挨着好几棵树，那些树各自有自己配对的帐篷。
 * 所以规则里绝不能出现"这棵树旁边已经有帐篷了，它就满足了"这种想法 ——
 * 旁边那顶帐篷很可能是隔壁那棵树的。
 *
 * 每条规则长这样：
 *   {
 *     id:    '规则编号，调试用',
 *     name:  '规则的中文名字，显示在界面上',
 *     apply: function (state) {
 *              // 返回 { changed: [[r, c], ...], note: '这一步到底做了什么' }
 *              // 什么都没推出就返回 null
 *            }
 *   }
 *
 * 规则只允许把格子从"未定"改成"帐篷"或"草地"，绝不推翻已有结论。
 * ========================================================================== */

(function (TT) {
    'use strict';

    const CELL = TT.CELL;

    /* ------------------------------------------------------------------
     * 公共小工具：几条规则都会用到，所以提到前面来
     * ------------------------------------------------------------------ */

    // 坐标转成给人看的说法：第 3 行第 5 列（随当前语言切换）
    function pos(r, c) {
        return TT.i18n.t('pos.rowCol', { r: r + 1, c: c + 1 });
    }
    TT.pos = pos;

    /** 把"未定"改成草地，返回真的被改动的格子 */
    function toGrass(state, r, c, changed) {
        if (TT.setCell(state, r, c, CELL.GRASS)) {
            changed.push([r, c]);
            return true;
        }
        return false;
    }

    /** 把"未定"改成帐篷，返回真的被改动的格子 */
    function toTent(state, r, c, changed) {
        if (TT.setCell(state, r, c, CELL.TENT)) {
            changed.push([r, c]);
            return true;
        }
        return false;
    }

    /** 帐篷周围一圈（8 格）都不能再放帐篷 —— 变成草地 */
    function grassAroundTent(state, r, c, changed) {
        TT.forEachNeighbor8(state, r, c, function (rr, cc, type) {
            if (type === CELL.UNKNOWN) {
                toGrass(state, rr, cc, changed);
            }
        });
    }
    TT.grassAroundTent = grassAroundTent;

    /**
     * 找出一行 / 一列里"还可能有帐篷"的连续段。
     *
     * 这里只把 mask 为 true 的格子算进来：没有树挨着、或者被别的帐篷压住的
     * 格子根本不可能变成帐篷，它们在判断"能放几个"时和草地一模一样，
     * 所以当成"墙"，把这一段切开。
     *
     * @returns {Array} [[起点下标, 长度], ...]
     */
    function findTentRuns(state, isRow, index, mask) {
        const runs = [];
        const length = isRow ? state.cols : state.rows;
        let start = -1;

        for (let i = 0; i < length; i++) {
            const r = isRow ? index : i;
            const c = isRow ? i : index;
            const usable = state.cells[r][c] === CELL.UNKNOWN && mask[r][c];

            if (usable) {
                if (start < 0) {
                    start = i;
                }
            } else if (start >= 0) {
                runs.push([start, i - start]);
                start = -1;
            }
        }
        if (start >= 0) {
            runs.push([start, length - start]);
        }
        return runs;
    }

    /** 一行 / 一列的格子坐标：i → [r, c] */
    function cellAt(isRow, index, i) {
        return isRow ? [index, i] : [i, index];
    }

    /* ------------------------------------------------------------------
     * 规则 1：配额已满
     *
     * 某一行的帐篷已经够数了，那这一行剩下的空格就不可能再放帐篷。
     * 这是最基础、几乎每题第一步都会用到的一条。
     * ------------------------------------------------------------------ */

    const ruleQuotaZero = {
        id: 'quota-zero',
        nameKey: 'rule.quotaZero',
        apply: function (state) {
            const changed = [];
            const touched = [];

            for (let r = 0; r < state.rows; r++) {
                if (state.rowLeft[r] === null || state.rowLeft[r] !== 0) {
                    continue;
                }
                let count = 0;
                for (let c = 0; c < state.cols; c++) {
                    if (toGrass(state, r, c, changed)) {
                        count++;
                    }
                }
                if (count > 0) {
                    touched.push(TT.i18n.t('note.lineRow', { i: r + 1 }));
                }
            }

            for (let c = 0; c < state.cols; c++) {
                if (state.colLeft[c] === null || state.colLeft[c] !== 0) {
                    continue;
                }
                let count = 0;
                for (let r = 0; r < state.rows; r++) {
                    if (toGrass(state, r, c, changed)) {
                        count++;
                    }
                }
                if (count > 0) {
                    touched.push(TT.i18n.t('note.lineCol', { i: c + 1 }));
                }
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.quotaZero',
                vars: { cells: touched }
            };
        }
    };

    /* ------------------------------------------------------------------
     * 规则 2：空地无树
     *
     * 帐篷必须紧挨着一棵树（那是它配对的对象）。
     * 上下左右都没有树的格子，绝不可能是帐篷。
     * ------------------------------------------------------------------ */

    const ruleDeadLand = {
        id: 'dead-land',
        nameKey: 'rule.deadLand',
        apply: function (state) {
            const changed = [];

            for (let r = 0; r < state.rows; r++) {
                for (let c = 0; c < state.cols; c++) {
                    if (state.cells[r][c] !== CELL.UNKNOWN) {
                        continue;
                    }
                    if (TT.treeCountAround(state, r, c) === 0) {
                        toGrass(state, r, c, changed);
                    }
                }
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.deadLand',
                vars: { n: changed.length }
            };
        }
    };

    /* ------------------------------------------------------------------
     * 规则 3：帐篷周围不能放帐篷
     *
     * 两个帐篷不能上下左右相邻，也不能斜着相邻。
     * 所以一顶帐篷周围一圈都可以标成草地。
     * ------------------------------------------------------------------ */

    const ruleTentIsolation = {
        id: 'tent-isolation',
        nameKey: 'rule.tentIsolation',
        apply: function (state) {
            const changed = [];

            for (let r = 0; r < state.rows; r++) {
                for (let c = 0; c < state.cols; c++) {
                    if (state.cells[r][c] === CELL.TENT) {
                        grassAroundTent(state, r, c, changed);
                    }
                }
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.tentIsolation',
                vars: { n: changed.length }
            };
        }
    };

    /* ------------------------------------------------------------------
     * 规则 4：孤树补帐篷
     *
     * 一棵树只剩下一个地方可能放帐篷了 —— 不管那顶帐篷旁边还挨着谁，
     * 它都只能是这棵树的配对帐篷，所以这一格必然是帐篷。
     * 这是最"爽"的一条规则，做题时最先找的就是它。
     * ------------------------------------------------------------------ */

    const ruleIsolatedTree = {
        id: 'isolated-tree',
        nameKey: 'rule.isolatedTree',
        apply: function (state) {
            const changed = [];
            const notes = [];
            const mask = TT.tentMask(state);

            for (let r = 0; r < state.rows; r++) {
                for (let c = 0; c < state.cols; c++) {
                    if (state.cells[r][c] !== CELL.TREE) {
                        continue;
                    }

                    const list = TT.possibilities(state, r, c, mask);
                    if (list.length !== 1) {
                        continue; // 0 个说明出矛盾了，validate 会报；多个就再看看
                    }

                    const only = list[0];
                    if (state.cells[only[0]][only[1]] !== CELL.UNKNOWN) {
                        continue; // 那一格已经是帐篷了，没什么可做的
                    }
                    if (!toTent(state, only[0], only[1], changed)) {
                        continue;
                    }
                    notes.push(TT.i18n.t('note.isolatedTreeItem', {
                        pos: pos(r, c),
                        pos2: pos(only[0], only[1])
                    }));
                    grassAroundTent(state, only[0], only[1], changed);
                }
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.isolatedTree',
                vars: { list: notes.slice(0, 3) }
            };
        }
    };

    /* ------------------------------------------------------------------
     * 规则 5：空格刚好等于缺口
     *
     * 某一行还差 3 个帐篷，而这一行"还有可能放帐篷"的格子恰好也只有 3 个 ——
     * 那就没有别的选择了，这 3 个格子必须全是帐篷。
     * （这里数的不是"所有空格"，而是"还可能变成帐篷的空格"，
     *   所以比只数空格要更强一些。）
     * ------------------------------------------------------------------ */

    const ruleLineTightFill = {
        id: 'line-tight-fill',
        nameKey: 'rule.lineTightFill',
        apply: function (state) {
            const changed = [];
            const notes = [];
            let mask = TT.tentMask(state);
            let checkedLength = changed.length;

            function handleLine(isRow, index) {
                // 上面几行刚改过局面，表可能过期了，重新算一张
                if (changed.length !== checkedLength) {
                    mask = TT.tentMask(state);
                    checkedLength = changed.length;
                }

                const need = isRow ? state.rowLeft[index] : state.colLeft[index];
                if (need === null || need <= 0) {
                    return;
                }

                const length = isRow ? state.cols : state.rows;
                const slots = [];

                for (let i = 0; i < length; i++) {
                    const r = isRow ? index : i;
                    const c = isRow ? i : index;
                    if (state.cells[r][c] === CELL.UNKNOWN && mask[r][c]) {
                        slots.push(i);
                    }
                }

                if (slots.length !== need) {
                    return;
                }

                // 这 need 个格子之间不能互相挨着，否则"全放"本身就是违规的
                for (let i = 1; i < slots.length; i++) {
                    if (slots[i] - slots[i - 1] === 1) {
                        return;
                    }
                }

                let placed = 0;
                for (let i = 0; i < slots.length; i++) {
                    const cell = cellAt(isRow, index, slots[i]);
                    if (toTent(state, cell[0], cell[1], changed)) {
                        placed++;
                    }
                }

                for (let i = 0; i < slots.length; i++) {
                    const cell = cellAt(isRow, index, slots[i]);
                    if (state.cells[cell[0]][cell[1]] === CELL.TENT) {
                        grassAroundTent(state, cell[0], cell[1], changed);
                    }
                }

                if (placed > 0) {
                    const itemKey = isRow ? 'note.lineTightItemRow' : 'note.lineTightItemCol';
                    notes.push(TT.i18n.t(itemKey, { i: index + 1, n: need }));
                }
            }

            for (let r = 0; r < state.rows; r++) {
                handleLine(true, r);
            }
            for (let c = 0; c < state.cols; c++) {
                handleLine(false, c);
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.lineTightFill',
                vars: { list: notes.slice(0, 3) }
            };
        }
    };

    /* ------------------------------------------------------------------
     * 规则 6：隔一个放一个
     *
     * 把一行里"还可能有帐篷"的连续格子分成若干段。
     * 一段长度 L 的连续格子，最多能放 (L + 1) / 2 个帐篷
     * （因为帐篷之间不能相邻，只能隔一格放一个）。
     *
     * 如果"各段最多能放的数量"加起来正好等于这一行还缺的数量，
     * 说明每一段都必须放满。长度是奇数的段只有一种放满的方式：
     * 从第一个格子开始，隔一个放一个（偶数长度的段有两种放法，跳过）。
     * ------------------------------------------------------------------ */

    const rulePackedLine = {
        id: 'packed-line',
        nameKey: 'rule.packedLine',
        apply: function (state) {
            const changed = [];
            const notes = [];
            let mask = TT.tentMask(state);
            let checkedLength = changed.length;

            function handleLine(isRow, index) {
                if (changed.length !== checkedLength) {
                    mask = TT.tentMask(state);
                    checkedLength = changed.length;
                }

                const need = isRow ? state.rowLeft[index] : state.colLeft[index];
                if (need === null || need <= 0) {
                    return;
                }

                const runs = findTentRuns(state, isRow, index, mask);
                let maxCount = 0;
                for (let i = 0; i < runs.length; i++) {
                    maxCount += Math.floor((runs[i][1] + 1) / 2);
                }

                if (maxCount !== need) {
                    return;
                }

                let placed = 0;
                for (let i = 0; i < runs.length; i++) {
                    const start = runs[i][0];
                    const length = runs[i][1];

                    if (length % 2 === 0) {
                        continue; // 偶数长度有两种放法，定不下来
                    }

                    for (let k = 0; k < length; k += 2) {
                        const cell = cellAt(isRow, index, start + k);
                        if (toTent(state, cell[0], cell[1], changed)) {
                            placed++;
                        }
                    }
                }

                if (placed > 0) {
                    const itemKey = isRow ? 'note.packedItemRow' : 'note.packedItemCol';
                    notes.push(TT.i18n.t(itemKey, { i: index + 1, n: maxCount }));
                }
            }

            for (let r = 0; r < state.rows; r++) {
                handleLine(true, r);
            }
            for (let c = 0; c < state.cols; c++) {
                handleLine(false, c);
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.packedLine',
                vars: { list: notes.slice(0, 3) }
            };
        }
    };

    /* ------------------------------------------------------------------
     * 规则 7：候选重合配对
     *
     * 树 A 的帐篷只可能放在左上、右下这两格，树 B 的也一模一样 ——
     * 它们俩一人一格，那这两格必然都是帐篷，可以直接放下。
     * 推广到 k 棵树候选完全相同、而候选正好 k 格的情况，结论同样成立。
     *
     * 注意这里说的"候选"包含"已经放好的帐篷"：如果那格已经是帐篷，
     * 它随时可能是这几棵树中某一棵的配对对象，所以要一起算进候选。
     * ------------------------------------------------------------------ */

    const rulePairMatch = {
        id: 'pair-match',
        nameKey: 'rule.pairMatch',
        apply: function (state) {
            const changed = [];
            const groups = {};
            const mask = TT.tentMask(state);

            // 1. 收集每棵树的候选格，按"候选完全相同"分组
            for (let r = 0; r < state.rows; r++) {
                for (let c = 0; c < state.cols; c++) {
                    if (state.cells[r][c] !== CELL.TREE) {
                        continue;
                    }

                    const list = TT.possibilities(state, r, c, mask);
                    if (list.length === 0) {
                        continue;
                    }

                    const key = list.map(function (item) {
                        return item[0] + ',' + item[1];
                    }).join('|');

                    if (!groups[key]) {
                        groups[key] = { trees: 0, cells: list };
                    }
                    groups[key].trees++;
                }
            }

            // 2. 组里的树数量 == 候选格数量，说明这组格子刚好被这组树分光
            const keys = Object.keys(groups);
            const notes = [];

            for (let i = 0; i < keys.length; i++) {
                const group = groups[keys[i]];
                if (group.trees < 2 || group.trees !== group.cells.length) {
                    continue;
                }
                for (let j = 0; j < group.cells.length; j++) {
                    const r = group.cells[j][0];
                    const c = group.cells[j][1];
                    if (toTent(state, r, c, changed)) {
                        notes.push(pos(r, c));
                        grassAroundTent(state, r, c, changed);
                    }
                }
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.pairMatch',
                vars: { n: notes.length, list: notes }
            };
        }
    };

    /* ------------------------------------------------------------------
     * 规则 8：配额被占满
     *
     * 如果一行里有 2 棵树，它们的帐篷位置只能在这一行里 ——
     * 而这一行里"已经放好的帐篷 + 还差的帐篷"也正好是 2 个，
     * 那这一行其他的格子就不可能放帐篷了。
     *
     * （"只能在这一行"指：这棵树的所有候选格都落在这一行。注意树本身
     *   可以在别的列，只要它的候选格都在这一行就行。）
     * ------------------------------------------------------------------ */

    const ruleBoxLine = {
        id: 'box-line',
        nameKey: 'rule.boxLine',
        apply: function (state) {
            const changed = [];
            const notes = [];
            let mask = TT.tentMask(state);
            let info = null;
            let checkedLength = -1;

            /** 每棵树的候选集合（整盘只算一次，局面变了再重算） */
            function treeInfo() {
                if (changed.length === checkedLength && info) {
                    return info;
                }
                mask = TT.tentMask(state);
                info = [];
                const trees = TT.listTrees(state);
                for (let i = 0; i < trees.length; i++) {
                    const list = TT.possibilities(state, trees[i][0], trees[i][1], mask);
                    if (list.length > 0) {
                        info.push(list);
                    }
                }
                checkedLength = changed.length;
                return info;
            }

            function handleLine(isRow, index) {
                const need = isRow ? state.rowLeft[index] : state.colLeft[index];
                if (need === null || need <= 0) {
                    return;
                }

                const length = isRow ? state.cols : state.rows;

                // 这一行（列）现在已经放了几顶帐篷
                let placed = 0;
                for (let i = 0; i < length; i++) {
                    const cell = cellAt(isRow, index, i);
                    if (state.cells[cell[0]][cell[1]] === CELL.TENT) {
                        placed++;
                    }
                }

                const all = treeInfo();
                let mustCount = 0;
                const allowed = {}; // 这几棵树的候选格要留着，不能标成草地

                for (let i = 0; i < all.length; i++) {
                    const list = all[i];
                    let allInside = true;
                    for (let j = 0; j < list.length; j++) {
                        const sameLine = isRow ? (list[j][0] === index) : (list[j][1] === index);
                        if (!sameLine) {
                            allInside = false;
                            break;
                        }
                    }
                    if (!allInside) {
                        continue;
                    }

                    mustCount++;
                    for (let j = 0; j < list.length; j++) {
                        allowed[list[j][0] + ',' + list[j][1]] = true;
                    }
                }

                // 这一行最终会有 placed + need 顶帐篷；只有"必须在这里落子的树"
                // 刚好把它们全占光，才能推出"别的格子都不是帐篷"
                if (mustCount === 0 || mustCount !== placed + need) {
                    return;
                }

                let grassed = 0;
                for (let i = 0; i < length; i++) {
                    const cell = cellAt(isRow, index, i);
                    const key = cell[0] + ',' + cell[1];
                    if (state.cells[cell[0]][cell[1]] !== CELL.UNKNOWN) {
                        continue;
                    }
                    if (allowed[key] || !mask[cell[0]][cell[1]]) {
                        continue;
                    }
                    if (toGrass(state, cell[0], cell[1], changed)) {
                        grassed++;
                    }
                }

                if (grassed > 0) {
                    const itemKey = isRow ? 'note.boxItemRow' : 'note.boxItemCol';
                    notes.push(TT.i18n.t(itemKey, { i: index + 1, n: mustCount }));
                }
            }

            for (let r = 0; r < state.rows; r++) {
                handleLine(true, r);
            }
            for (let c = 0; c < state.cols; c++) {
                handleLine(false, c);
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.boxLine',
                vars: { list: notes.slice(0, 3) }
            };
        }
    };

    /* ------------------------------------------------------------------
     * 规则 9：帐篷的主人已经确定
     *
     * 一顶帐篷上下左右只有一棵树 —— 那它只能配给这棵树。
     * 这棵树配好了以后，它旁边那种"只挨着这一棵树"的格子就不可能是帐篷了：
     * 那种格子只能配给这棵树，而这棵树已经名花有主。
     *
     * （注意：只挨着这棵树、同时还挨着别的树的格子不能标，因为那可能是
     *   别的树的帐篷 —— 这正是"配对"和"独占"的区别。）
     * ------------------------------------------------------------------ */

    const ruleOwnerFixed = {
        id: 'owner-fixed',
        nameKey: 'rule.ownerFixed',
        apply: function (state) {
            const changed = [];
            const notes = [];
            const mask = TT.tentMask(state);

            for (let r = 0; r < state.rows; r++) {
                for (let c = 0; c < state.cols; c++) {
                    if (state.cells[r][c] !== CELL.TENT) {
                        continue;
                    }
                    if (TT.treeCountAround(state, r, c) !== 1) {
                        continue; // 挨着好几棵树，主人还没定
                    }

                    let ownerR = -1;
                    let ownerC = -1;
                    TT.forEachNeighbor4(state, r, c, function (rr, cc, type) {
                        if (type === CELL.TREE) {
                            ownerR = rr;
                            ownerC = cc;
                        }
                    });
                    if (ownerR < 0) {
                        continue;
                    }

                    // 这棵树旁边"只挨着它一棵树"的格子，不可能是帐篷了
                    for (let d = 0; d < TT.DIRS4.length; d++) {
                        const rr = ownerR + TT.DIRS4[d][0];
                        const cc = ownerC + TT.DIRS4[d][1];
                        if (!TT.inBounds(state, rr, cc)) {
                            continue;
                        }
                        if (state.cells[rr][cc] !== CELL.UNKNOWN || !mask[rr][cc]) {
                            continue;
                        }
                        if (TT.treeCountAround(state, rr, cc) !== 1) {
                            continue; // 还挨着别的树，可能是别人的帐篷
                        }
                        if (toGrass(state, rr, cc, changed)) {
                            notes.push(pos(rr, cc));
                        }
                    }
                }
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.ownerFixed',
                vars: { n: notes.length, list: notes.slice(0, 4) }
            };
        }
    };

    /* ------------------------------------------------------------------
     * 规则 10：试探排除（进阶）
     *
     * 对每个还可能放帐篷的格子，先假设一下再检查：
     *   · 假设它是帐篷  → 如果马上出现矛盾，它就是草地
     *   · 假设它是草地  → 如果马上出现矛盾，它就必须是帐篷
     * 判断矛盾用的是 solver.js 里那套完整检查（含"树和帐篷还能不能配上对"），
     * 所以比只数数字要靠谱得多。
     *
     * 这条规则最花时间，回溯搜索时会关掉它。
     * ------------------------------------------------------------------ */

    const ruleTrialElimination = {
        id: 'trial-elimination',
        nameKey: 'rule.trialElimination',
        apply: function (state) {
            const changed = [];
            const notes = [];
            let mask = TT.tentMask(state);
            let checkedLength = changed.length;

            for (let r = 0; r < state.rows; r++) {
                for (let c = 0; c < state.cols; c++) {
                    if (changed.length !== checkedLength) {
                        mask = TT.tentMask(state);
                        checkedLength = changed.length;
                    }
                    if (state.cells[r][c] !== CELL.UNKNOWN || !mask[r][c]) {
                        continue;
                    }

                    // 先试"这里放帐篷"
                    if (trialIsContradiction(state, r, c, CELL.TENT)) {
                        toGrass(state, r, c, changed);
                        notes.push(TT.i18n.t('note.trialTent', { pos: pos(r, c) }));
                        continue;
                    }

                    // 再试"这里放草地"
                    if (trialIsContradiction(state, r, c, CELL.GRASS)) {
                        toTent(state, r, c, changed);
                        grassAroundTent(state, r, c, changed);
                        notes.push(TT.i18n.t('note.trialGrass', { pos: pos(r, c) }));
                    }
                }
            }

            if (changed.length === 0) {
                return null;
            }
            return {
                changed: changed,
                noteKey: 'note.trial',
                vars: { list: notes.slice(0, 3) }
            };
        }
    };

    /**
     * 假设 (r, c) 变成 type（帐篷或草地），看会不会立刻出现矛盾。
     * 做法：临时改局面 → 跑一遍完整检查 → 立刻还原。
     */
    function trialIsContradiction(state, r, c, type) {
        const changes = [[r, c, type]];

        if (type === CELL.TENT) {
            // 帐篷周围一圈变草地
            TT.forEachNeighbor8(state, r, c, function (rr, cc, cellType) {
                if (cellType === CELL.UNKNOWN) {
                    changes.push([rr, cc, CELL.GRASS]);
                }
            });
        }

        return TT.tryCells(state, changes, function () {
            return TT.validate(state) !== null;
        });
    }

    /* ------------------------------------------------------------------
     * 规则清单
     *
     * 顺序很重要：求解器每次都从第一条开始试，
     * 先跑最朴素的规则，跑完再从第一条重新来一遍。
     * 这样界面上看到的步骤就是"先找简单的，再找难的"，和人做题的顺序一样。
     * ------------------------------------------------------------------ */

    TT.RULES = [
        ruleQuotaZero,
        ruleDeadLand,
        ruleTentIsolation,
        ruleIsolatedTree,
        ruleLineTightFill,
        rulePackedLine,
        rulePairMatch,
        ruleBoxLine,
        ruleOwnerFixed,
        ruleTrialElimination
    ];

    // 回溯搜索时跳过"试探排除"，它太慢
    TT.FAST_RULES = TT.RULES.filter(function (rule) {
        return rule.id !== 'trial-elimination';
    });

})(window.TT);
