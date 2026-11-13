/* ==========================================================================
 * solver.js —— 第 3 层：求解主流程
 *
 * 这一层负责：
 *   1. 检查局面有没有矛盾（validate）
 *   2. 反复套用 rules.js 里的规则，直到推不动为止（propagate）
 *   3. 推理卡住时交给 backtrack.js 去试探（solve）
 *   4. 把每一步的局面记下来，界面才能逐步回放
 *
 * 它自己不懂任何解题技巧，技巧全在 rules.js。
 * ========================================================================== */

(function (TT) {
    'use strict';

    const CELL = TT.CELL;

    /* ------------------------------------------------------------------
     * 1. 检查局面有没有矛盾
     *
     * 返回 null 表示还没发现问题；返回一句话表示这个局面已经不成立。
     * 求解器每推一步都会查一次，这样一旦走错能立刻停下。
     * ------------------------------------------------------------------ */

    TT.validate = function (state) {
        const mask = TT.tentMask(state);

        // ---- 1. 行、列的配额 ----
        // rowLeft / colLeft 为 null 表示这一行/列是"缺失数字"，数量不限，跳过配额检查。
        for (let r = 0; r < state.rows; r++) {
            if (state.rowLeft[r] === null) {
                continue;
            }
            if (state.rowLeft[r] < 0) {
                return '第 ' + (r + 1) + ' 行的帐篷数量超出了提示数字。';
            }
            if (state.rowLeft[r] > TT.unknownInRow(state, r)) {
                return '第 ' + (r + 1) + ' 行只剩 ' + TT.unknownInRow(state, r) +
                    ' 个空格，却还差 ' + state.rowLeft[r] + ' 个帐篷，放不下。';
            }
            // 把"帐篷不能相邻"也算进去，一行到底还能放几个
            const room = TT.lineMaxTents(state, true, r, mask);
            if (state.rowLeft[r] > room) {
                return '第 ' + (r + 1) + ' 行还差 ' + state.rowLeft[r] +
                    ' 个帐篷，但按"帐篷不能相邻"算，这一行最多还能放 ' + room + ' 个。';
            }
        }

        for (let c = 0; c < state.cols; c++) {
            if (state.colLeft[c] === null) {
                continue;
            }
            if (state.colLeft[c] < 0) {
                return '第 ' + (c + 1) + ' 列的帐篷数量超出了提示数字。';
            }
            if (state.colLeft[c] > TT.unknownInCol(state, c)) {
                return '第 ' + (c + 1) + ' 列只剩 ' + TT.unknownInCol(state, c) +
                    ' 个空格，却还差 ' + state.colLeft[c] + ' 个帐篷，放不下。';
            }
            const room = TT.lineMaxTents(state, false, c, mask);
            if (state.colLeft[c] > room) {
                return '第 ' + (c + 1) + ' 列还差 ' + state.colLeft[c] +
                    ' 个帐篷，但按"帐篷不能相邻"算，这一列最多还能放 ' + room + ' 个。';
            }
        }

        // ---- 2. 每顶帐篷都必须挨着至少一棵树 ----
        // （帐篷是树的配对对象，不挨着树就配不出去。挨着好几棵树是允许的。）
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                if (state.cells[r][c] !== CELL.TENT) {
                    continue;
                }
                if (TT.treeCountAround(state, r, c) === 0) {
                    return TT.pos(r, c) + '的帐篷四周没有树，帐篷必须挨着它配对的那棵树。';
                }

                // ---- 3. 帐篷之间不能相邻 ----
                if (TT.hasTentAround8(state, r, c)) {
                    return TT.pos(r, c) + '的帐篷挨着别的帐篷，两个帐篷不能相邻（斜着也不行）。';
                }
            }
        }

        // ---- 4. 这棵树还有地方放帐篷吗？----
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                if (state.cells[r][c] !== CELL.TREE) {
                    continue;
                }
                if (TT.possibilities(state, r, c, mask).length === 0) {
                    return TT.pos(r, c) + '的树已经没有任何地方可以配帐篷了。';
                }
            }
        }

        // ---- 5. 全局：所有树和所有帐篷还能不能一一配上对 ----
        // 前面几步都是"局部"检查，这一条看的是整体。
        // 比如三棵树都只能抢同一顶帐篷，局部看每棵都没问题，整体却配不出来。
        const match = TT.matchAllTrees(state, { mask: mask });
        if (!match.ok) {
            return '局面已经配不成对了：' + TT.pos(match.unmatched[0][0], match.unmatched[0][1]) +
                '的树抢不到属于自己的帐篷（还有 ' + match.unmatched.length + ' 棵树同样没着落）。';
        }

        return null;
    };

    /* ------------------------------------------------------------------
     * 2. 解出来了吗？
     * ------------------------------------------------------------------ */

    TT.isSolved = function (state) {
        for (let r = 0; r < state.rows; r++) {
            // 缺失数字（null）不要求放满；有明确数字的行必须放够
            if (state.rowLeft[r] !== null && state.rowLeft[r] !== 0) {
                return false;
            }
            for (let c = 0; c < state.cols; c++) {
                if (state.cells[r][c] === CELL.UNKNOWN) {
                    return false;
                }
            }
        }
        for (let c = 0; c < state.cols; c++) {
            if (state.colLeft[c] !== null && state.colLeft[c] !== 0) {
                return false;
            }
        }

        // 全部格子都有结论之后，最后再确认一次：
        // 这些树和这些帐篷真的能一对一配上吗？
        // （这一步是"配对"和"独占"的分界：配得上的解才算法。）
        return TT.matchAllTrees(state, { tentsOnly: true }).ok;
    };

    /* ------------------------------------------------------------------
     * 3. 反复套用规则，直到推不动
     *
     * 一次调用 = 一个"推理阶段"：从第一条规则开始试，哪条能改动就从第一条重新开始，
     * 直到所有规则都推不出东西为止。
     * ------------------------------------------------------------------ */

    /** 把一条规则反复执行到它自己推不出新东西，顺便收集它改动的格子 */
    function applyRuleUntilStable(state, rule) {
        const changed = [];
        const notes = [];

        // 正常情况下几轮就停，这里的上限只是保险，避免死循环
        for (let guard = 0; guard < 200; guard++) {
            const outcome = rule.apply(state);
            if (!outcome || outcome.changed.length === 0) {
                break;
            }
            for (let i = 0; i < outcome.changed.length; i++) {
                changed.push(outcome.changed[i]);
            }
            if (outcome.note) {
                notes.push(outcome.note);
            }
        }

        return {
            changed: changed,
            note: notes.length > 0 ? notes[0] : ''
        };
    }

    /**
     * @param {object} state    局面（会被直接修改）
     * @param {object} options  {
     *                            useTrial: 是否使用较慢的"试探排除"规则，默认 true
     *                            onStep:    每推进一步回调一次，用于记录步骤
     *                          }
     * @returns {{status: string, error?: string}}
     *          status = 'solved' 解完了 / 'stalled' 推不动了 / 'invalid' 出现矛盾
     */
    TT.propagate = function (state, options) {
        const useTrial = !options || options.useTrial !== false;
        const onStep = options && options.onStep;
        const rules = useTrial ? TT.RULES : TT.FAST_RULES;

        for (let guard = 0; guard < 2000; guard++) {
            if (TT.isSolved(state)) {
                return { status: 'solved' };
            }

            const error = TT.validate(state);
            if (error) {
                return { status: 'invalid', error: error };
            }

            let moved = false;
            for (let i = 0; i < rules.length; i++) {
                const outcome = applyRuleUntilStable(state, rules[i]);
                if (outcome.changed.length === 0) {
                    continue;
                }
                if (onStep) {
                    onStep({
                        kind: 'deduce',
                        ruleId: rules[i].id,
                        title: rules[i].name,
                        note: outcome.note,
                        changed: outcome.changed,
                        cells: TT.snapshot(state)
                    });
                }
                moved = true;
                break; // 回到第一条规则，重新检查
            }

            if (!moved) {
                return { status: 'stalled' };
            }
        }

        return { status: 'stalled' };
    };

    /* ------------------------------------------------------------------
     * 4. 放一个"试探"的帐篷
     *
     * 试探的含意是："假设这棵树和这一格配对"。
     * 所以只做两件事：
     *   · 把这一格标成帐篷
     *   · 帐篷周围一圈标成草地（帐篷之间不能相邻）
     *
     * 特别注意：不能把这棵树旁边的其他格子标成草地。
     * 那些格子完全可能是别的树的帐篷 —— 帐篷旁边可以挨着好几棵树，
     * 这是"配对"和"独占"最大的区别。老版本的这里曾经标过，那是错的。
     * ------------------------------------------------------------------ */

    TT.placeGuess = function (state, tree, cell) {
        const changed = [];
        const r = cell[0];
        const c = cell[1];

        if (TT.setCell(state, r, c, CELL.TENT)) {
            changed.push([r, c]);
        }
        TT.grassAroundTent(state, r, c, changed);

        return changed;
    };

    /* ------------------------------------------------------------------
     * 5. 完整求解
     * ------------------------------------------------------------------ */

    /**
     * @param {object} puzzle  题目
     * @param {object} options { maxNodes, timeLimit } 试探的预算
     * @returns {{
     *   status: 'solved' | 'invalid' | 'failed',
     *   steps: Array,
     *   message?: string,
     *   stats: { guesses: number, byLogic: boolean }
     * }}
     */
    TT.solve = function (puzzle, options) {
        options = options || {};
        const steps = [];
        const state = TT.createState(puzzle);

        // 第 0 步：题目原样
        steps.push({
            kind: 'initial',
            title: '初始局面',
            note: '题目的树和提示数字已经填好，其余格子都是"未定"，等待推理。',
            changed: [],
            cells: TT.snapshot(state)
        });

        function pushStep(step) {
            steps.push(step);
        }

        // ---- 第一轮：纯逻辑推理 ----
        const logicResult = TT.propagate(state, { useTrial: true, onStep: pushStep });

        if (logicResult.status === 'invalid') {
            return {
                status: 'invalid',
                steps: steps,
                message: '题目自相矛盾：' + logicResult.error,
                stats: { guesses: 0, byLogic: false }
            };
        }

        if (logicResult.status === 'solved') {
            pushStep({
                kind: 'done',
                title: '完成',
                note: '全部靠推理得出，没有猜过任何一步。',
                changed: [],
                cells: TT.snapshot(state)
            });
            return {
                status: 'solved',
                steps: steps,
                stats: { guesses: 0, byLogic: true }
            };
        }

        // ---- 第二轮：逻辑推不动了，开始试探 ----
        const search = TT.searchSolution(state, {
            maxNodes: options.maxNodes || 20000,
            timeLimit: options.timeLimit || 2000
        });

        if (search.timeout) {
            return {
                status: 'failed',
                steps: steps,
                message: '推理到第 ' + steps.length + ' 步就卡住了，试探搜索也超出了时间限制。' +
                    '题目可能无解，也可能需要更长的搜索时间。',
                stats: { guesses: 0, byLogic: false }
            };
        }

        if (!search.decisions) {
            return {
                status: 'failed',
                steps: steps,
                message: '推理到第 ' + steps.length + ' 步就卡住了，试探也找不到解，' +
                    '这道题很可能是无解的，或者提示数字填错了。',
                stats: { guesses: 0, byLogic: false }
            };
        }

        // ---- 第三轮：把试探的路径重新走一遍，同时记录步骤，供界面回放 ----
        for (let i = 0; i < search.decisions.length; i++) {
            const decision = search.decisions[i];
            const changed = TT.placeGuess(state, decision.tree, decision.cell);

            if (decision.pair) {
                // 这一格本来就已经放好帐篷了，这一步只是确认"它归这棵树"
                pushStep({
                    kind: 'guess',
                    title: '确认配对',
                    note: '推理推不动了。先假设 ' + TT.pos(decision.tree[0], decision.tree[1]) +
                        '的树配的是' + TT.pos(decision.cell[0], decision.cell[1]) +
                        '这顶已经放好的帐篷，按这个假设继续往下推。',
                    changed: [],
                    depth: i + 1,
                    cells: TT.snapshot(state)
                });
            } else {
                pushStep({
                    kind: 'guess',
                    title: '试探',
                    note: '推理推不动了。先假设 ' + TT.pos(decision.tree[0], decision.tree[1]) +
                        '的树把帐篷放在 ' + TT.pos(decision.cell[0], decision.cell[1]) +
                        '，按这个假设继续往下推。',
                    changed: changed,
                    depth: i + 1,
                    cells: TT.snapshot(state)
                });
            }

            const result = TT.propagate(state, { useTrial: true, onStep: pushStep });
            if (result.status === 'invalid') {
                break;
            }
            if (result.status === 'solved') {
                break;
            }
        }

        // 试探路径走完后，剩下的未定格子按草地处理。
        // 普通模式下配额规则会把这些格子推成草地；缺失数字模式跳过了配额规则，
        // 这里统一收口，避免回放结束还留着未定格。
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                if (state.cells[r][c] === CELL.UNKNOWN) {
                    TT.setCell(state, r, c, CELL.GRASS);
                }
            }
        }

        if (!TT.isSolved(state)) {
            // 理论上不会走到这里；真走到了，说明回放和搜索结果对不上
            return {
                status: 'failed',
                steps: steps,
                message: '找到了解，但回放步骤时出现了偏差，请反馈这个问题。',
                stats: { guesses: search.decisions.length, byLogic: false }
            };
        }

        pushStep({
            kind: 'done',
            title: '完成',
            note: '解出来了：中间有 ' + search.decisions.length +
                ' 步是靠试探的，其余都是推理得出的。',
            changed: [],
            cells: TT.snapshot(state)
        });

        return {
            status: 'solved',
            steps: steps,
            stats: { guesses: search.decisions.length, byLogic: false }
        };
    };

})(window.TT);
