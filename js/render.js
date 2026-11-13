/* ==========================================================================
 * render.js —— 第 5 层：把数据画到页面上
 *
 * 这一层只做"显示"，不做任何推理。它对外提供 TT.render 这个对象：
 *   TT.render.buildBoard(...)      画棋盘
 *   TT.render.updateCells(...)     按局面刷新格子（只改动有变化的格子）
 *   TT.render.showStep(...)        刷新步骤说明
 *   TT.render.toast(...)           右下角提示
 * 谁调用它、什么时候调用，都在 app.js 里。
 * ========================================================================== */

(function (TT) {
    'use strict';

    const CELL = TT.CELL;

    // 这个文件对外的接口都挂在 TT.render 上，先建个空对象
    TT.render = {};

    // 棋盘相关的 DOM 引用集中放这里，避免每次都重新查一遍
    const board = {
        element: null,
        cellElements: [],   // [行][列] = <button>
        icons: [],          // [行][列] = <span class="icon">
        hintInputs: [],     // { col: [...], row: [...] }
        lastCells: null,    // 上一次画上去的局面，用来做差分
        rows: 0,
        cols: 0,
        missingMode: false  // 缺失数字模式：提示允许是 null（界面上显示「?」）
    };

    const stepView = {
        listEl: null,
        items: [],
        onPick: null
    };

    /* ------------------------------------------------------------------
     * 1. 小工具
     * ------------------------------------------------------------------ */

    function el(tagName, className) {
        const node = document.createElement(tagName);
        if (className) {
            node.className = className;
        }
        return node;
    }

    function iconMarkup(symbolId, color) {
        return '<svg viewBox="0 0 24 24" style="color:' + color + '" aria-hidden="true">' +
            '<use href="#' + symbolId + '" xlink:href="#' + symbolId + '"></use></svg>';
    }

    /**
     * 把提示输入框里的文字解析成引擎口径：数字，或 null（缺失数字「?」）。
     * 普通模式下空框按 0 处理；缺失模式下空框或「?」按 null 处理。
     */
    function parseHint(raw, missing) {
        const text = String(raw == null ? '' : raw).trim();
        if (missing) {
            if (text === '' || text === '?' || text === '？') {
                return null;
            }
            const n = parseInt(text, 10);
            return Number.isInteger(n) ? n : null;
        }
        const n = parseInt(text, 10);
        return Number.isInteger(n) ? n : 0;
    }

    /** null 在界面上显示成「?」，数字直接显示本身 */
    function hintText(value) {
        return value === null ? '?' : String(value);
    }

    /* ------------------------------------------------------------------
     * 2. 画棋盘
     * ------------------------------------------------------------------ */

    /**
     * @param {HTMLElement} container 放棋盘的容器
     * @param {object} puzzle          题目（用它的尺寸、树的位置、提示数字）
     * @param {object} handlers        { onCellClick(r, c), onHintChange(r, c, value) }
     */
    TT.render.buildBoard = function (container, puzzle, handlers) {
        board.element = container;
        board.rows = puzzle.rows;
        board.cols = puzzle.cols;
        board.cellElements = [];
        board.icons = [];
        board.hintInputs = { col: [], row: [] };
        board.lastCells = null;
        board.missingMode = !!puzzle.missingMode;

        container.innerHTML = '';

        // 让每格都是正方形：列数 + 1 行提示，行数 + 1 列提示
        // 1.25 是提示格的相对宽度
        container.style.gridTemplateColumns = '1.25fr repeat(' + puzzle.cols + ', 1fr)';
        container.style.gridTemplateRows = '1.25fr repeat(' + puzzle.rows + ', 1fr)';
        container.style.aspectRatio = (puzzle.cols + 1.25) + ' / ' + (puzzle.rows + 1.25);

        // 手机屏幕窄，20×20 会被压成指甲盖大小，点都点不准。
        // 这里给每格留一个最小尺寸，放不下就让外面那层横向滚动。
        container.style.minWidth = Math.round((puzzle.cols + 1.25) * 24) + 'px';

        // 左上角空格
        container.appendChild(el('div', 'corner'));

        // 顶部：每列的提示数字
        for (let c = 0; c < puzzle.cols; c++) {
            const cell = el('div', 'hint-cell');
            const input = el('input', 'hint-input');
            input.type = board.missingMode ? 'text' : 'number';
            input.min = '0';
            input.max = String(puzzle.rows);
            input.step = '1';
            input.value = hintText(puzzle.colHints[c]);
            input.setAttribute('aria-label', TT.i18n.t('aria.colHint', { i: c + 1 }));
            bindHintInput(input, 'col', c);
            cell.appendChild(input);
            board.hintInputs.col.push({ cell: cell, input: input });
            container.appendChild(cell);
        }

        // 左边提示 + 棋盘格
        for (let r = 0; r < puzzle.rows; r++) {
            const hintCell = el('div', 'hint-cell');
            const input = el('input', 'hint-input');
            input.type = board.missingMode ? 'text' : 'number';
            input.min = '0';
            input.max = String(puzzle.cols);
            input.step = '1';
            input.value = hintText(puzzle.rowHints[r]);
            input.setAttribute('aria-label', TT.i18n.t('aria.rowHint', { i: r + 1 }));
            bindHintInput(input, 'row', r);
            hintCell.appendChild(input);
            board.hintInputs.row.push({ cell: hintCell, input: input });
            container.appendChild(hintCell);

            const rowCells = [];
            const rowIcons = [];
            for (let c = 0; c < puzzle.cols; c++) {
                const button = el('button', 'cell');
                button.type = 'button';
                button.dataset.row = String(r);
                button.dataset.col = String(c);
                button.setAttribute('aria-label', TT.i18n.t('aria.cell', { r: r + 1, c: c + 1 }));

                const icon = el('span', 'icon');
                button.appendChild(icon);

                button.addEventListener('click', function () {
                    if (handlers && handlers.onCellClick) {
                        handlers.onCellClick(r, c);
                    }
                });

                rowCells.push(button);
                rowIcons.push(icon);
                container.appendChild(button);
            }
            board.cellElements.push(rowCells);
            board.icons.push(rowIcons);
        }

        // 顶部 / 左侧提示输入框的小坐标也存下来，方便后面判断状态
        function bindHintInput(input, axis, index) {
            input.addEventListener('input', function () {
                if (handlers && handlers.onHintChange) {
                    handlers.onHintChange(axis, index, input.value);
                }
            });
            // 回车跳到下一个输入框，填 20 个数字时省点事
            input.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter') {
                    return;
                }
                const inputs = container.querySelectorAll('.hint-input');
                const all = Array.prototype.slice.call(inputs);
                const next = all[all.indexOf(input) + 1];
                if (next) {
                    next.focus();
                    next.select();
                }
            });
        }
    };

    /* ------------------------------------------------------------------
     * 3. 刷新格子
     * ------------------------------------------------------------------ */

    function paintCell(r, c, type) {
        const button = board.cellElements[r][c];
        const icon = board.icons[r][c];

        button.classList.remove('f-tree', 'f-grass', 'f-tent');

        if (type === CELL.TREE) {
            button.classList.add('f-tree');
            icon.innerHTML = iconMarkup('i-tree', '#2f6d53');
        } else if (type === CELL.TENT) {
            button.classList.add('f-tent');
            icon.innerHTML = iconMarkup('i-tent', '#b5711f');
        } else if (type === CELL.GRASS) {
            button.classList.add('f-grass');
            icon.innerHTML = '';
        } else {
            icon.innerHTML = '';
        }
    }

    /**
     * 把一份局面画到棋盘上。
     * 和上一次画的内容对比，只重画变了的格子 —— 20×20 有 400 格，
     * 每步全量重画会明显卡顿。
     *
     * @param {Array} cells   二维数组，值是 TT.CELL
     * @param {Array} changed 这一步改动的坐标 [[r, c], ...]，会加高亮
     */
    TT.render.updateCells = function (cells, changed) {
        const highlight = {};
        if (changed) {
            for (let i = 0; i < changed.length; i++) {
                highlight[changed[i][0] + ',' + changed[i][1]] = true;
            }
        }

        for (let r = 0; r < board.rows; r++) {
            for (let c = 0; c < board.cols; c++) {
                const type = cells[r][c];
                const key = r + ',' + c;
                const button = board.cellElements[r][c];

                // 只有内容变了才重画图标
                const previous = board.lastCells ? board.lastCells[r][c] : -1;
                if (previous !== type) {
                    paintCell(r, c, type);
                }

                if (highlight[key]) {
                    button.classList.add('is-changed');
                } else {
                    button.classList.remove('is-changed');
                }
            }
        }

        board.lastCells = TT.snapshotCells(cells);
        TT.render.updateHints(cells);
    };

    /** 给 render 用的小工具：复制一份局面数字（因为 cells 可能是外部数组） */
    TT.snapshotCells = function (cells) {
        const copy = [];
        for (let r = 0; r < cells.length; r++) {
            copy.push(cells[r].slice());
        }
        return copy;
    };

    /* ------------------------------------------------------------------
     * 4. 提示数字的状态（够了 / 超了）
     * ------------------------------------------------------------------ */

    TT.render.updateHints = function (cells) {
        for (let c = 0; c < board.cols; c++) {
            const item = board.hintInputs.col[c];
            const want = parseHint(item.input.value, board.missingMode);
            let count = 0;
            for (let r = 0; r < board.rows; r++) {
                if (cells[r][c] === CELL.TENT) {
                    count++;
                }
            }
            setHintState(item.cell, count, want);
        }

        for (let r = 0; r < board.rows; r++) {
            const item = board.hintInputs.row[r];
            const want = parseHint(item.input.value, board.missingMode);
            let count = 0;
            for (let c = 0; c < board.cols; c++) {
                if (cells[r][c] === CELL.TENT) {
                    count++;
                }
            }
            setHintState(item.cell, count, want);
        }
    };

    function setHintState(cellElement, count, want) {
        cellElement.classList.remove('is-done', 'is-over');
        // 缺失数字（null）：不知道目标数量，不标"够了 / 超了"
        if (want === null) {
            return;
        }
        if (count > want) {
            cellElement.classList.add('is-over');
        } else if (count === want && want > 0) {
            cellElement.classList.add('is-done');
        }
    }

    /** 读出棋盘上当前的提示数字（缺失模式下「?」解析为 null） */
    TT.render.readHints = function () {
        const rowHints = [];
        const colHints = [];
        for (let r = 0; r < board.rows; r++) {
            rowHints.push(parseHint(board.hintInputs.row[r].input.value, board.missingMode));
        }
        for (let c = 0; c < board.cols; c++) {
            colHints.push(parseHint(board.hintInputs.col[c].input.value, board.missingMode));
        }
        return { rowHints: rowHints, colHints: colHints };
    };

    /** 把一组提示数字写回输入框（null 写成「?」） */
    TT.render.writeHints = function (rowHints, colHints) {
        for (let r = 0; r < board.rows; r++) {
            board.hintInputs.row[r].input.value = hintText(rowHints[r]);
        }
        for (let c = 0; c < board.cols; c++) {
            board.hintInputs.col[c].input.value = hintText(colHints[c]);
        }
    };

    /** 切换缺失数字模式：改输入框类型，并用给定提示刷新显示 */
    TT.render.setMissingMode = function (on, rowHints, colHints) {
        board.missingMode = !!on;
        const items = [];
        for (let c = 0; c < board.cols; c++) {
            items.push(board.hintInputs.col[c].input);
        }
        for (let r = 0; r < board.rows; r++) {
            items.push(board.hintInputs.row[r].input);
        }
        for (let i = 0; i < items.length; i++) {
            items[i].type = on ? 'text' : 'number';
        }
        if (rowHints && colHints) {
            TT.render.writeHints(rowHints, colHints);
        }
    };

    /** 查看解答时锁住输入，回到编辑模式再放开 */
    TT.render.setEditable = function (editable) {
        const inputs = [];
        for (let c = 0; c < board.cols; c++) {
            inputs.push(board.hintInputs.col[c].input);
        }
        for (let r = 0; r < board.rows; r++) {
            inputs.push(board.hintInputs.row[r].input);
        }
        for (let i = 0; i < inputs.length; i++) {
            inputs[i].readOnly = !editable;
        }
        for (let r = 0; r < board.rows; r++) {
            for (let c = 0; c < board.cols; c++) {
                board.cellElements[r][c].classList.toggle('is-static', !editable);
            }
        }
    };

    /* ------------------------------------------------------------------
     * 5. 示例按钮
     * ------------------------------------------------------------------ */

    const LEVEL_KEY = {
        '入门': 'demo.level.beginner',
        '练习': 'demo.level.practice',
        '挑战': 'demo.level.challenge',
        '高难': 'demo.level.hard'
    };

    TT.render.buildDemoButtons = function (container, demos, onPick) {
        container.innerHTML = '<span class="label">' + TT.i18n.t('app.demos') + '</span>';

        for (let i = 0; i < demos.length; i++) {
            const demo = demos[i];
            const button = el('button', 'demo-btn');
            button.type = 'button';
            button.textContent = demo.name;
            const levelKey = LEVEL_KEY[demo.level] || 'demo.level.challenge';
            button.title = TT.i18n.t('demo.loadTitle', { level: TT.i18n.t(levelKey) });
            button.addEventListener('click', function () {
                onPick(demo);
            });
            container.appendChild(button);
        }
    };

    /* ------------------------------------------------------------------
     * 6. 步骤面板
     * ------------------------------------------------------------------ */

    const KIND_CLASS = {
        initial: '',
        deduce: '',
        guess: 'is-guess',
        done: 'is-done'
    };

    function kindName(kind) {
        return TT.i18n.t('kind.' + kind) || TT.i18n.t('kind.deduce');
    }

    function resolveTitle(step) {
        return step.titleKey ? TT.i18n.t(step.titleKey) : (step.title || '');
    }

    function resolveNote(step) {
        return step.noteKey ? TT.i18n.t(step.noteKey, step.noteVars) : (step.note || '');
    }

    /**
     * 显示某一步：更新卡片、滑块、列表高亮
     * @param {object} solution TT.solve() 的返回值
     * @param {number} index    第几步（从 0 开始）
     */
    TT.render.showStep = function (solution, index) {
        const steps = solution.steps;
        const step = steps[index];

        document.getElementById('stepCounter').textContent =
            TT.i18n.t('steps.counter', { i: index + 1, n: steps.length });

        const tag = document.getElementById('stepTag');
        tag.textContent = kindName(step.kind);
        tag.className = 'tag ' + (KIND_CLASS[step.kind] || '');

        document.getElementById('stepTitle').textContent = resolveTitle(step);
        document.getElementById('stepNote').textContent = resolveNote(step);

        const slider = document.getElementById('stepSlider');
        slider.max = String(steps.length);
        slider.value = String(index + 1);
        document.getElementById('sliderFrom').textContent = TT.i18n.t('steps.stepFrom');
        document.getElementById('sliderTo').textContent = TT.i18n.t('steps.stepTo', { n: steps.length });

        // 列表高亮：只让列表自己滚动，不要带着整个页面跳
        for (let i = 0; i < stepView.items.length; i++) {
            stepView.items[i].classList.toggle('is-active', i === index);
        }
        const active = stepView.items[index];
        const list = stepView.listEl;
        if (active && list && list.scrollHeight > list.clientHeight) {
            const top = active.offsetTop - list.offsetTop;
            const bottom = top + active.offsetHeight;
            if (top < list.scrollTop) {
                list.scrollTop = top - 4;
            } else if (bottom > list.scrollTop + list.clientHeight) {
                list.scrollTop = bottom - list.clientHeight + 4;
            }
        }
    };

    /** 重建步骤列表（求解完成时调用一次） */
    TT.render.buildStepList = function (solution, onPick) {
        const list = document.getElementById('stepList');
        list.innerHTML = '';
        stepView.listEl = list;
        stepView.items = [];
        stepView.onPick = onPick;

        for (let i = 0; i < solution.steps.length; i++) {
            const step = solution.steps[i];
            const item = el('button', 'step-item');
            item.type = 'button';

            const no = el('span', 'no');
            no.textContent = String(i + 1);

            const title = el('span', 'title');
            title.textContent = resolveTitle(step);

            const kind = el('span', 'kind');
            kind.textContent = kindName(step.kind);

            item.appendChild(no);
            item.appendChild(title);
            item.appendChild(kind);

            item.addEventListener('click', function () {
                onPick(i);
            });

            list.appendChild(item);
            stepView.items.push(item);
        }
    };

    /* ------------------------------------------------------------------
     * 7. 提示条
     * ------------------------------------------------------------------ */

    let toastTimer = null;

    TT.render.toast = function (message, isError) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.toggle('is-error', !!isError);
        toast.classList.add('is-visible');

        if (toastTimer) {
            clearTimeout(toastTimer);
        }
        toastTimer = setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 2600);
    };

    /* ------------------------------------------------------------------
     * 8. 棋盘下方的状态行
     * ------------------------------------------------------------------ */

    TT.render.setBoardNote = function (parts) {
        const note = document.getElementById('boardNote');
        note.innerHTML = '';

        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                const dot = el('span', 'dot');
                note.appendChild(dot);
            }
            const span = el('span', parts[i].className || '');
            span.textContent = parts[i].text;
            note.appendChild(span);
        }
    };

    TT.render.setModeHint = function (text) {
        document.getElementById('boardModeHint').textContent = text;
    };

})(window.TT);
