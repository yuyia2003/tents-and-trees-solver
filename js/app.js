/* ==========================================================================
 * app.js —— 第 7 层：把界面和求解器连起来
 *
 * 前面几个文件各管一段：core 管数据，rules 管技巧，solver 管流程，
 * backtrack 管试探，render 管画图。这个文件是"总开关"：
 * 负责听按钮点击、调用求解器、把结果交给 render 去画。
 *
 * 只有两种模式：
 *   edit（编辑）：可以点格子放树、改提示数字
 *   view（查看）：棋盘锁定，只能翻看求解步骤
 * ========================================================================== */

(function (TT) {
    'use strict';

    const CELL = TT.CELL;

    // 整个页面的状态都收在这一个对象里，找起来方便
    const app = {
        mode: 'edit',
        puzzle: null,     // 当前题目：尺寸、树、提示数字
        editCells: null,  // 编辑状态下棋盘该显示成什么样
        solution: null,   // TT.solve() 的结果
        stepIndex: 0,
        timer: null,
        missingMode: false // 缺失数字模式：提示允许是 null（界面上显示「?」）
    };

    function $(id) {
        return document.getElementById(id);
    }

    /* ------------------------------------------------------------------
     * 1. 开始一局
     * ------------------------------------------------------------------ */

    /** 造一张空棋盘；缺失模式下提示一律先放「?」(null)，其余留空给用户填已知数 */
    function emptyPuzzle(rows, cols, missing) {
        const trees = [];
        for (let r = 0; r < rows; r++) {
            const line = [];
            for (let c = 0; c < cols; c++) {
                line.push(false);
            }
            trees.push(line);
        }

        const blank = missing ? null : 0;
        const rowHints = [];
        for (let r = 0; r < rows; r++) {
            rowHints.push(blank);
        }
        const colHints = [];
        for (let c = 0; c < cols; c++) {
            colHints.push(blank);
        }

        return {
            rows: rows,
            cols: cols,
            trees: trees,
            rowHints: rowHints,
            colHints: colHints,
            missingMode: !!missing
        };
    }

    /** 按示例题数据造一份题目（示例都是完整数字提示，普通模式） */
    function puzzleFromDemo(demo) {
        const trees = [];
        for (let r = 0; r < demo.rows; r++) {
            const line = [];
            for (let c = 0; c < demo.cols; c++) {
                line.push(demo.trees[r].charAt(c) === 'T');
            }
            trees.push(line);
        }
        return {
            rows: demo.rows,
            cols: demo.cols,
            trees: trees,
            rowHints: demo.rowHints.slice(),
            colHints: demo.colHints.slice(),
            missingMode: false
        };
    }

    /** 载入一道题，进入编辑模式 */
    function startPuzzle(puzzle) {
        stopPlaying();
        app.mode = 'edit';
        app.puzzle = puzzle;
        app.missingMode = !!puzzle.missingMode;
        app.solution = null;
        app.stepIndex = 0;
        app.editCells = TT.createState(puzzle).cells;

        const toggle = $('missingToggle');
        if (toggle) {
            toggle.checked = app.missingMode;
        }

        $('sizeW').value = String(puzzle.cols);
        $('sizeH').value = String(puzzle.rows);

        TT.render.buildBoard($('board'), puzzle, {
            onCellClick: onCellClick,
            onHintChange: onHintChange
        });
        TT.render.updateCells(app.editCells, []);
        TT.render.setEditable(true);
        TT.render.setModeHint(TT.i18n.t('mode.edit'));

        resetStepPanel();
        refreshNote();
        syncCodeBox();
    }

    /* ------------------------------------------------------------------
     * 2. 编辑棋盘
     * ------------------------------------------------------------------ */

    function onCellClick(r, c) {
        if (app.mode !== 'edit') {
            TT.render.toast(TT.i18n.t('toast.viewMode'));
            return;
        }

        // 点一下放树，再点一下拿掉
        app.puzzle.trees[r][c] = !app.puzzle.trees[r][c];
        app.editCells[r][c] = app.puzzle.trees[r][c] ? CELL.TREE : CELL.UNKNOWN;

        TT.render.updateCells(app.editCells, [[r, c]]);
        refreshNote();
        syncCodeBox();
    }

    /** 把输入框文字解析成提示值：普通模式数字（空按 0），缺失模式「?」/空为 null */
    function parseHintValue(raw) {
        const text = String(raw == null ? '' : raw).trim();
        if (app.missingMode) {
            if (text === '' || text === '?' || text === '？') {
                return null;
            }
            const n = parseInt(text, 10);
            return Number.isInteger(n) ? n : null;
        }
        const n = parseInt(text, 10);
        return Number.isInteger(n) ? n : 0;
    }

    /**
     * 提示数字改了：记到题目里，顺便刷新一下"够了/超了"的颜色
     * @param {string} axis 'row' 表示左边那排，'col' 表示上面那排
     * @param {number} index 第几行 / 第几列（从 0 开始）
     */
    function onHintChange(axis, index, value) {
        const hint = parseHintValue(value);
        if (axis === 'row') {
            app.puzzle.rowHints[index] = hint;
        } else if (axis === 'col') {
            app.puzzle.colHints[index] = hint;
        }
        TT.render.updateHints(app.editCells);
        refreshNote();
        syncCodeBox();
    }

    /* ------------------------------------------------------------------
     * 3. 工具栏
     * ------------------------------------------------------------------ */

    function bindToolbar() {
        $('btnCreate').addEventListener('click', function () {
            const cols = clampSize($('sizeW').value);
            const rows = clampSize($('sizeH').value);
            $('sizeW').value = String(cols);
            $('sizeH').value = String(rows);
            startPuzzle(emptyPuzzle(rows, cols, app.missingMode));
            TT.render.toast(TT.i18n.t('toast.boardCreated', { r: rows, c: cols }));
        });

        $('btnSolve').addEventListener('click', solve);
        $('btnReset').addEventListener('click', function () {
            startPuzzle(app.puzzle);
            TT.render.toast(TT.i18n.t('toast.resetDone'));
        });

        // 缺失数字模式开关
        $('missingToggle').addEventListener('change', function () {
            setMissingMode(this.checked);
        });

        // 棋盘代码：生成 / 复制 / 粘贴还原
        $('btnGenCode').addEventListener('click', function () {
            syncCodeBox();
            TT.render.toast(TT.i18n.t('toast.codeGenerated'));
        });
        $('btnCopyCode').addEventListener('click', copyCode);
        $('btnPasteCode').addEventListener('click', importCode);

        $('btnPrev').addEventListener('click', function () {
            goStep(app.stepIndex - 1);
        });
        $('btnNext').addEventListener('click', function () {
            goStep(app.stepIndex + 1);
        });
        $('btnPlay').addEventListener('click', togglePlay);

        $('stepSlider').addEventListener('input', function () {
            stopPlaying();
            goStep(parseInt(this.value, 10) - 1);
        });

        $('btnHelp').addEventListener('click', function () {
            const panel = $('helpPanel');
            const willShow = panel.hasAttribute('hidden');
            if (willShow) {
                panel.removeAttribute('hidden');
            } else {
                panel.setAttribute('hidden', '');
            }
            this.setAttribute('aria-expanded', willShow ? 'true' : 'false');
        });

        // 键盘：左右键翻步骤，空格播放
        document.addEventListener('keydown', function (event) {
            if (!app.solution || event.target.tagName === 'INPUT') {
                return;
            }
            if (event.key === 'ArrowLeft') {
                goStep(app.stepIndex - 1);
            } else if (event.key === 'ArrowRight') {
                goStep(app.stepIndex + 1);
            } else if (event.key === ' ') {
                event.preventDefault();
                togglePlay();
            }
        });
    }

    function clampSize(text) {
        const value = parseInt(text, 10);
        if (isNaN(value)) {
            return TT.MIN_SIZE;
        }
        return Math.min(TT.MAX_SIZE, Math.max(TT.MIN_SIZE, value));
    }

    /* ------------------------------------------------------------------
     * 4. 求解
     * ------------------------------------------------------------------ */

    function solve() {
        if (app.mode !== 'edit') {
            TT.render.toast(TT.i18n.t('toast.alreadyView'));
            return;
        }

        // 提示数字以输入框里的为准（用户可能刚改过）
        const hints = TT.render.readHints();
        app.puzzle.rowHints = hints.rowHints;
        app.puzzle.colHints = hints.colHints;

        const problem = TT.checkPuzzle(app.puzzle);
        if (problem) {
            TT.render.toast(problem, true);
            refreshNote(problem);
            return;
        }

        const button = $('btnSolve');
        button.disabled = true;
        button.textContent = TT.i18n.t('solving');

        let result;
        try {
            result = TT.solve(app.puzzle, { maxNodes: 30000, timeLimit: 3000 });
        } finally {
            button.disabled = false;
            button.textContent = TT.i18n.t('app.solve');
        }

        app.solution = result;
        app.mode = 'view';
        TT.render.setEditable(false);
        TT.render.buildStepList(result, function (index) {
            stopPlaying();
            goStep(index);
        });

        if (result.status === 'solved') {
            TT.render.setModeHint(TT.i18n.t('mode.view'));
            goStep(result.steps.length - 1);
            TT.render.toast(TT.i18n.t('toast.solved', {
                n: result.steps.length,
                g: result.stats.guesses
            }));
        } else {
            goStep(result.steps.length - 1);
            TT.render.setModeHint(TT.i18n.t('mode.viewBad'));
            // 把原因直接写进步骤卡片，比只看右下角的小提示清楚
            $('stepTag').textContent = TT.i18n.t('step.problem');
            $('stepTag').className = 'tag is-error';
            $('stepTitle').textContent = TT.i18n.t('step.failedTitle');
            $('stepNote').textContent = result.message || TT.i18n.t('step.failedNote');
            TT.render.toast(result.message || TT.i18n.t('step.failedNote'), true);
        }
        refreshNote();
    }

    /* ------------------------------------------------------------------
     * 5. 翻步骤
     * ------------------------------------------------------------------ */

    function goStep(index) {
        if (!app.solution) {
            return;
        }

        const steps = app.solution.steps;
        const clamped = Math.max(0, Math.min(steps.length - 1, index));

        app.stepIndex = clamped;
        TT.render.updateCells(steps[clamped].cells, steps[clamped].changed);
        TT.render.showStep(app.solution, clamped);

        $('stepSlider').disabled = false;
        $('btnPrev').disabled = clamped === 0;
        $('btnNext').disabled = clamped === steps.length - 1;
        refreshNote();
    }

    function togglePlay() {
        if (!app.solution) {
            return;
        }
        if (app.timer) {
            stopPlaying();
            return;
        }

        // 播放到末尾就从头再来一次
        if (app.stepIndex >= app.solution.steps.length - 1) {
            goStep(0);
        }

        $('btnPlay').textContent = TT.i18n.t('steps.pause');
        app.timer = setInterval(function () {
            if (app.stepIndex >= app.solution.steps.length - 1) {
                stopPlaying();
                return;
            }
            goStep(app.stepIndex + 1);
        }, 600);
    }

    function stopPlaying() {
        if (app.timer) {
            clearInterval(app.timer);
            app.timer = null;
        }
        $('btnPlay').textContent = TT.i18n.t('steps.play');
    }

    function resetStepPanel() {
        $('stepCounter').textContent = TT.i18n.t('steps.unsolved');
        $('stepTag').textContent = TT.i18n.t('steps.ready');
        $('stepTag').className = 'tag';
        $('stepTitle').textContent = TT.i18n.t('steps.readyTitle');
        $('stepNote').textContent = TT.i18n.t('steps.readyNote');

        $('stepList').innerHTML = '';
        const slider = $('stepSlider');
        slider.min = '1';
        slider.max = '1';
        slider.value = '1';
        slider.disabled = true;
        $('sliderFrom').textContent = TT.i18n.t('steps.stepFrom');
        $('sliderTo').textContent = '—';

        $('btnPrev').disabled = true;
        $('btnNext').disabled = true;
        $('btnPlay').disabled = true;
    }

    /* ------------------------------------------------------------------
     * 6. 棋盘下面那行状态
     * ------------------------------------------------------------------ */

    function refreshNote(extra) {
        let treeCount = 0;
        for (let r = 0; r < app.puzzle.rows; r++) {
            for (let c = 0; c < app.puzzle.cols; c++) {
                if (app.puzzle.trees[r][c]) {
                    treeCount++;
                }
            }
        }

        const hints = TT.render.readHints();
        // 行提示合计 = 帐篷总数 = 列提示合计；只按行提示算一次，不能横竖相加（会翻倍）
        let rowSum = 0;
        let colSum = 0;
        let missingCount = 0;
        for (let i = 0; i < hints.rowHints.length; i++) {
            if (hints.rowHints[i] === null) {
                missingCount++;
            } else {
                rowSum += hints.rowHints[i];
            }
        }
        for (let i = 0; i < hints.colHints.length; i++) {
            if (hints.colHints[i] === null) {
                missingCount++;
            } else {
                colSum += hints.colHints[i];
            }
        }

        const hintText = missingCount > 0
            ? TT.i18n.t('note.hintSumUnknown', { n: rowSum, m: missingCount })
            : TT.i18n.t('note.hintSum', { n: rowSum });

        const parts = [
            { text: TT.i18n.t('note.trees', { n: treeCount }) },
            { text: hintText }
        ];

        // 有未知提示时，合计本来就没法和树数对上，不提示"还没对上"
        if (missingCount === 0) {
            if (rowSum !== colSum) {
                parts.push({ text: TT.i18n.t('note.mismatchRowCol'), className: 'alert' });
            } else if (treeCount !== rowSum) {
                parts.push({ text: TT.i18n.t('note.treesHintsMismatch') });
            }
        }

        if (app.solution && app.solution.status === 'solved') {
            parts.push({
                text: TT.i18n.t('note.solvedSteps', {
                    n: app.solution.steps.length,
                    g: app.solution.stats.guesses
                }),
                className: 'ok'
            });
        }

        if (extra) {
            parts.push({ text: extra, className: 'alert' });
        }

        TT.render.setBoardNote(parts);
    }

    /* ------------------------------------------------------------------
     * 6.5 缺失数字模式开关
     * ------------------------------------------------------------------ */

    function setMissingMode(on) {
        app.missingMode = !!on;
        app.puzzle.missingMode = app.missingMode;

        // 两种口径互转：开 → 全部置 null（界面上是「?」）；关 → null 归 0
        const rowHints = app.puzzle.rowHints.map(function (h) {
            return app.missingMode ? null : (h === null ? 0 : h);
        });
        const colHints = app.puzzle.colHints.map(function (h) {
            return app.missingMode ? null : (h === null ? 0 : h);
        });
        app.puzzle.rowHints = rowHints;
        app.puzzle.colHints = colHints;

        TT.render.setMissingMode(app.missingMode, rowHints, colHints);
        TT.render.updateHints(app.editCells);
        refreshNote();
        syncCodeBox();
    }

    /* ------------------------------------------------------------------
     * 6.6 棋盘代码：导出 / 还原
     *
     * 代码内容：尺寸、树的位置、行/列提示（含「?」）、当前格子标记、模式开关。
     * 编码：JSON → encodeURIComponent → base64url，得到一段可复制的紧凑字符串。
     * ------------------------------------------------------------------ */

    function currentCells() {
        if (app.mode === 'view' && app.solution && app.solution.steps.length) {
            return app.solution.steps[app.stepIndex].cells;
        }
        return app.editCells;
    }

    function buildSnapshot() {
        const cells = currentCells();
        return {
            v: 1,
            rows: app.puzzle.rows,
            cols: app.puzzle.cols,
            missing: app.missingMode,
            trees: app.puzzle.trees.map(function (row) { return row.map(Number); }),
            rowHints: app.puzzle.rowHints,
            colHints: app.puzzle.colHints,
            cells: cells.map(function (row) { return row.slice(); })
        };
    }

    function encodeSnapshot(snap) {
        const json = JSON.stringify(snap);
        return btoa(encodeURIComponent(json))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    function decodeSnapshot(code) {
        const b64 = String(code || '').trim().replace(/-/g, '+').replace(/_/g, '/');
        if (!b64) {
            throw new Error(TT.i18n.t('code.empty'));
        }
        let json;
        try {
            json = decodeURIComponent(atob(b64));
        } catch (e) {
            throw new Error(TT.i18n.t('code.badFormat'));
        }
        let snap;
        try {
            snap = JSON.parse(json);
        } catch (e) {
            throw new Error(TT.i18n.t('code.invalid'));
        }
        validateSnapshot(snap);
        return snap;
    }

    function isValidHint(h, max) {
        if (h === null) {
            return true;
        }
        return Number.isInteger(h) && h >= 0 && h <= max;
    }

    function validateSnapshot(snap) {
        if (!snap || typeof snap !== 'object') {
            throw new Error(TT.i18n.t('code.notObject'));
        }
        if (snap.v !== 1) {
            throw new Error(TT.i18n.t('code.unknownVersion'));
        }
        const rows = snap.rows;
        const cols = snap.cols;
        if (!Number.isInteger(rows) || !Number.isInteger(cols) ||
            rows < TT.MIN_SIZE || rows > TT.MAX_SIZE ||
            cols < TT.MIN_SIZE || cols > TT.MAX_SIZE) {
            throw new Error(TT.i18n.t('code.badSize', {
                min: TT.MIN_SIZE,
                max: TT.MAX_SIZE
            }));
        }
        if (!Array.isArray(snap.trees) || snap.trees.length !== rows) {
            throw new Error(TT.i18n.t('code.treesIncomplete'));
        }
        if (!Array.isArray(snap.rowHints) || snap.rowHints.length !== rows) {
            throw new Error(TT.i18n.t('code.rowHintsIncomplete'));
        }
        if (!Array.isArray(snap.colHints) || snap.colHints.length !== cols) {
            throw new Error(TT.i18n.t('code.colHintsIncomplete'));
        }
        if (!Array.isArray(snap.cells) || snap.cells.length !== rows) {
            throw new Error(TT.i18n.t('code.cellsIncomplete'));
        }
        for (let r = 0; r < rows; r++) {
            if (!Array.isArray(snap.trees[r]) || snap.trees[r].length !== cols) {
                throw new Error(TT.i18n.t('code.treesDim'));
            }
            if (!Array.isArray(snap.cells[r]) || snap.cells[r].length !== cols) {
                throw new Error(TT.i18n.t('code.cellsDim'));
            }
            for (let c = 0; c < cols; c++) {
                const cell = snap.cells[r][c];
                if (!Number.isInteger(cell) || cell < 0 || cell > 3) {
                    throw new Error(TT.i18n.t('code.unknownCell'));
                }
                if (snap.trees[r][c] && cell !== CELL.TREE) {
                    throw new Error(TT.i18n.t('code.treeCellMismatch'));
                }
            }
        }
        for (let r = 0; r < rows; r++) {
            if (!isValidHint(snap.rowHints[r], cols)) {
                throw new Error(TT.i18n.t('code.rowHintRange'));
            }
        }
        for (let c = 0; c < cols; c++) {
            if (!isValidHint(snap.colHints[c], rows)) {
                throw new Error(TT.i18n.t('code.colHintRange'));
            }
        }
    }

    /** 把当前棋盘写进代码框 */
    function syncCodeBox() {
        $('codeBox').value = encodeSnapshot(buildSnapshot());
    }

    function copyCode() {
        const box = $('codeBox');
        const text = box.value;
        if (!text) {
            TT.render.toast(TT.i18n.t('code.nothingToCopy'), true);
            return;
        }
        function fallback() {
            box.focus();
            box.select();
            let ok = false;
            try {
                ok = document.execCommand('copy');
            } catch (e) {
                ok = false;
            }
            TT.render.toast(ok ? TT.i18n.t('code.copied') : TT.i18n.t('code.copyFailed'), !ok);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                TT.render.toast(TT.i18n.t('code.copiedRestore'));
            }).catch(fallback);
        } else {
            fallback();
        }
    }

    function importCode() {
        if (!$('codeBox').value.trim() && navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function (clip) {
                if (clip && clip.trim()) {
                    $('codeBox').value = clip;
                }
                doImport();
            }).catch(doImport);
            return;
        }
        doImport();

        function doImport() {
            let snap;
            try {
                snap = decodeSnapshot($('codeBox').value);
            } catch (err) {
                TT.render.toast(TT.i18n.t('code.restoreFailed', { msg: err.message }), true);
                return;
            }
            const puzzle = {
                rows: snap.rows,
                cols: snap.cols,
                trees: snap.trees.map(function (row) { return row.map(Boolean); }),
                rowHints: snap.rowHints.slice(),
                colHints: snap.colHints.slice(),
                missingMode: !!snap.missing
            };
            startPuzzle(puzzle);
            // 还原代码里保存的格子标记（树位置已经在 puzzle 里）
            app.editCells = snap.cells.map(function (row) { return row.slice(); });
            TT.render.updateCells(app.editCells, []);
            TT.render.updateHints(app.editCells);
            refreshNote();
            syncCodeBox();
            TT.render.toast(TT.i18n.t('code.restored', { r: snap.rows, c: snap.cols }));
        }
    }

    /* ------------------------------------------------------------------
     * 6.7 截图识别：本地识别游戏截图，生成棋盘后仍可手动修正
     * ------------------------------------------------------------------ */

    function setShotStatus(text) {
        $('shotStatus').textContent = text;
    }

    function showShotPreview(img) {
        const preview = $('shotPreview');
        preview.src = img.src;
        preview.hidden = false;
    }

    function recognizeImage(img) {
        let result;
        try {
            result = TT.recognize.fromImage(img);
        } catch (err) {
            TT.render.toast(err.message, true);
            setShotStatus(err.message);
            return;
        }

        const puzzle = {
            rows: result.rows,
            cols: result.cols,
            trees: result.trees,
            rowHints: result.rowHints,
            colHints: result.colHints,
            missingMode: result.missingMode
        };
        startPuzzle(puzzle);

        let treeCount = 0;
        for (let r = 0; r < puzzle.rows; r++) {
            for (let c = 0; c < puzzle.cols; c++) {
                if (puzzle.trees[r][c]) treeCount++;
            }
        }
        let unknown = 0;
        puzzle.rowHints.forEach(function (h) { if (h === null) unknown++; });
        puzzle.colHints.forEach(function (h) { if (h === null) unknown++; });

        let msg = TT.i18n.t('shot.done', { r: puzzle.rows, c: puzzle.cols, t: treeCount });
        if (unknown > 0) {
            msg += TT.i18n.t('shot.doneUnknown', { u: unknown });
        }
        msg += TT.i18n.t('shot.doneTail');
        TT.render.toast(msg);
        setShotStatus(msg);
    }

    function loadShotFile(file) {
        if (!file) {
            return;
        }
        if (file.type && file.type.indexOf('image/') !== 0) {
            TT.render.toast(TT.i18n.t('shot.notImage'), true);
            return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () {
            showShotPreview(img);
            recognizeImage(img);
            URL.revokeObjectURL(url);
        };
        img.onerror = function () {
            TT.render.toast(TT.i18n.t('shot.badImage'), true);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    function pasteClipboardShot() {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            TT.render.toast(TT.i18n.t('shot.noClipboard'), true);
            return;
        }
        navigator.clipboard.read().then(function (items) {
            for (let i = 0; i < items.length; i++) {
                const type = items[i].types.find(function (t) {
                    return t.indexOf('image/') === 0;
                });
                if (type) {
                    items[i].getType(type).then(function (blob) {
                        loadShotFile(blob);
                    });
                    return;
                }
            }
            TT.render.toast(TT.i18n.t('shot.clipboardNoImage'), true);
        }).catch(function () {
            TT.render.toast(TT.i18n.t('shot.clipboardFailed'), true);
        });
    }

    function bindShotImport() {
        $('btnPickShot').addEventListener('click', function () {
            $('shotFile').click();
        });
        $('shotFile').addEventListener('change', function () {
            loadShotFile(this.files && this.files[0]);
            this.value = '';
        });
        $('btnPasteShot').addEventListener('click', pasteClipboardShot);

        // 全局粘贴：焦点不在输入框里时，直接把剪贴板图片识别成棋盘
        document.addEventListener('paste', function (event) {
            const target = event.target;
            if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
                return;
            }
            const items = event.clipboardData && event.clipboardData.items;
            if (!items) {
                return;
            }
            for (let i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf('image/') === 0) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        event.preventDefault();
                        loadShotFile(blob);
                    }
                    return;
                }
            }
        });
    }

    /* ------------------------------------------------------------------
     * 6.8 语言切换
     * ------------------------------------------------------------------ */

    function refreshLanguage() {
        TT.i18n.applyStatic();

        // 示例按钮的 title 是动态文案，重建一次
        TT.render.buildDemoButtons($('demoGroup'), TT.DEMOS, function (demo) {
            startPuzzle(puzzleFromDemo(demo));
            TT.render.toast(TT.i18n.t('toast.demoLoaded', { name: demo.name }));
        });

        // 棋盘输入框的 aria-label 在建盘时生成，重建一次让它跟随语言
        TT.render.buildBoard($('board'), app.puzzle, {
            onCellClick: onCellClick,
            onHintChange: onHintChange
        });
        TT.render.updateCells(app.editCells, []);
        TT.render.setEditable(app.mode === 'edit');
        const hintKey = app.mode === 'edit'
            ? 'mode.edit'
            : (app.solution && app.solution.status !== 'solved' ? 'mode.viewBad' : 'mode.view');
        TT.render.setModeHint(TT.i18n.t(hintKey));

        // 状态条、步骤面板、截图提示按当前语言刷新
        refreshNote();
        setShotStatus(TT.i18n.t('shot.status'));

        if (app.solution) {
            goStep(app.stepIndex);
        } else {
            resetStepPanel();
        }

        $('btnPlay').textContent = app.timer
            ? TT.i18n.t('steps.pause')
            : TT.i18n.t('steps.play');
        $('btnSolve').textContent = TT.i18n.t('app.solve');

        const zhBtn = $('langZh');
        const enBtn = $('langEn');
        if (zhBtn && enBtn) {
            const isZh = TT.i18n.getLang() === 'zh';
            zhBtn.classList.toggle('is-active', isZh);
            enBtn.classList.toggle('is-active', !isZh);
        }
    }

    function bindLanguage() {
        $('langZh').addEventListener('click', function () {
            TT.i18n.setLang('zh');
            refreshLanguage();
        });
        $('langEn').addEventListener('click', function () {
            TT.i18n.setLang('en');
            refreshLanguage();
        });
    }

    /* ------------------------------------------------------------------
     * 7. 启动
     * ------------------------------------------------------------------ */

    function init() {
        TT.i18n.applyStatic();
        bindLanguage();
        TT.render.buildDemoButtons($('demoGroup'), TT.DEMOS, function (demo) {
            startPuzzle(puzzleFromDemo(demo));
            TT.render.toast(TT.i18n.t('toast.demoLoaded', { name: demo.name }));
        });

        bindToolbar();
        bindShotImport();
        startPuzzle(puzzleFromDemo(TT.DEMOS[0]));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window.TT);
