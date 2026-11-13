/* ==========================================================================
 * i18n.js —— 界面双语（中文 / English）
 *
 * 只负责文案：字典在下面 dict 里，t(key, vars) 取当前语言的句子，
 * {占位符} 用 vars 里的值替换。静态界面元素带 data-i18n 属性，
 * 切换语言时由 applyStatic() 统一刷新；动态消息在 JS 里直接调 t()。
 * 默认中文，选择记在 localStorage，下次打开沿用。
 * ========================================================================== */

(function (TT) {
    'use strict';

    const STORE_KEY = 'tt-lang';

    const dict = {
        zh: {
            'app.title': '树与帐篷 求解器',
            'app.pageTitle': '树与帐篷 · 求解器',
            'app.subtitle': '在格子里放树、填数字，然后看它一步步推出来。适用于 4×4 到 20×20。',
            'app.version': 'v0.1.0',

            'app.width': '宽',
            'app.height': '高',
            'app.widthAria': '棋盘宽度',
            'app.heightAria': '棋盘高度',
            'app.create': '生成棋盘',
            'app.solve': '开始求解',
            'app.reset': '重置',
            'app.resetTitle': '清掉帐篷和草地，保留树和提示数字',
            'app.missingMode': '缺失数字模式',
            'app.missingTitle': '开启后，行/列数字可以填「?」表示不知道，这一行/列的帐篷数量不限',
            'app.demos': '示例题目',

            'board.title': '棋盘',
            'board.editHint': '编辑中 · 点格子切换树',
            'legend.tree': '树',
            'legend.tent': '帐篷',
            'legend.grass': '草地',
            'legend.changed': '本步改动',
            'help.button': '规则说明',

            'steps.title': '推理步骤',
            'steps.unsolved': '尚未求解',
            'steps.ready': '准备',
            'steps.readyTitle': '先摆好树，再点「开始求解」',
            'steps.readyNote': '左边每行的数字表示这一行要放几个帐篷，上面每列同理。可以先用示例题目试一下。',
            'steps.prev': '上一步',
            'steps.play': '播放',
            'steps.pause': '暂停',
            'steps.next': '下一步',
            'steps.stepFrom': '第 1 步',
            'steps.stepTo': '共 {n} 步',
            'steps.counter': '第 {i} 步 / 共 {n} 步',

            'shot.title': '截图识别',
            'shot.hint': '把游戏截图粘贴进来，自动生成棋盘；识别不准可在棋盘上直接改',
            'shot.pick': '选择截图文件',
            'shot.paste': '从剪贴板粘贴',
            'shot.status': '支持 4×4 到 20×20 的同风格截图；树位或数字识别不准时，载入后点格子改树、点数字改提示即可。',
            'shot.gamePrefix': '截图对应游戏',
            'shot.gameName': 'Tents and Trees',

            'code.title': '棋盘代码',
            'code.hint': '复制这段代码，下次粘贴即可还原这张棋盘',
            'code.placeholder': '点「生成代码」把当前棋盘写成一段代码；把别人给的代码粘进来，再点「粘贴还原」。',
            'code.gen': '生成代码',
            'code.copy': '复制代码',
            'code.restore': '粘贴还原',

            'help.title': '这是个什么游戏',
            'help.subtitle': '树与帐篷（Tents and Trees）',
            'help.rulesTitle': '规则一共四条',
            'help.rule1': '树和帐篷<b>一对一配对</b>：每棵树配一顶帐篷（配对的那顶就在它上下左右），每顶帐篷只属于一棵树。',
            'help.rule2': '但帐篷旁边<b>可以同时挨着好几棵树</b> —— 多出来的那几棵只是"蹭在旁边"，它们各自还有自己配对的帐篷。',
            'help.rule3': '帐篷之间不能相邻，<b>斜着相邻也不行</b>。',
            'help.rule4': '左边每行的数字表示这一行有几顶帐篷，上面每列的数字表示这一列有几顶帐篷，剩下的格子都是草地。',
            'help.howTitle': '怎么用这个页面',
            'help.how1': '点「生成棋盘」，按题目尺寸开一张空盘。',
            'help.how2': '点格子放树，再点一次取消；所有树摆好后填提示数字。',
            'help.how3': '点「开始求解」，下面的步骤面板会说明每一步用了什么规则、改了哪几格。',
            'help.how4': '推理推不动时，求解器会先"试探"一步，试探的步骤会标成橙色。',
            'help.how5': '打开「缺失数字模式」后，行/列提示可以填「?」表示不知道，这一行/列的帐篷数量不限；其余规则不变。',
            'help.how6': '「棋盘代码」会把当前树、提示和已摆的格子写成一段代码，复制保存；下次粘贴代码就能还原这张棋盘。',
            'help.how7': '「截图识别」可以直接导入游戏截图：选文件或粘贴剪贴板图片，自动认出树和提示数字；识别不准时，载入后点格子、点数字直接改。',
            'help.note': '求解器先用人类常用的推理规则一步步推进；如果所有规则都推不动，再启动回溯搜索（挑候选最少的树去假设，走不通就退回来换下一个）。因此再难的题也能给出答案，只是会有几步是"试探"出来的。',

            'mode.edit': '编辑中 · 点格子切换树',
            'mode.view': '查看中 · 可翻看每一步',
            'mode.viewBad': '查看中 · 题目有问题',
            'toast.viewMode': '现在是查看模式，先点「重置」回到编辑',
            'toast.boardCreated': '已生成 {r}×{c} 的空棋盘',
            'toast.resetDone': '已重置：树和数字都留着，帐篷清掉了',
            'toast.codeGenerated': '已按当前棋盘生成代码',
            'toast.alreadyView': '已经在查看结果了，改题目请先点「重置」',
            'solving': '求解中…',
            'toast.solved': '解出来了：共 {n} 步，其中试探 {g} 步',
            'step.problem': '问题',
            'step.failedTitle': '这次没能解出来',
            'step.failedNote': '没解出来。',

            'note.trees': '树 {n} 棵',
            'note.hintSum': '提示合计 {n}',
            'note.hintSumUnknown': '已知提示合计 {n}（{m} 项未知）',
            'note.mismatchRowCol': '行列提示合计不一致',
            'note.treesHintsMismatch': '树的数量和提示还没对上',
            'note.solvedSteps': '共 {n} 步，试探 {g} 步',

            'code.empty': '代码是空的',
            'code.badFormat': '代码格式不正确，无法解码',
            'code.invalid': '代码内容不是有效的棋盘数据',
            'code.notObject': '代码不是有效的棋盘数据',
            'code.unknownVersion': '代码版本不认识，可能不是本程序导出的',
            'code.badSize': '代码里的尺寸不在 {min}×{min} 到 {max}×{max} 之间',
            'code.treesIncomplete': '代码里的树位置不完整',
            'code.rowHintsIncomplete': '代码里的行提示不完整',
            'code.colHintsIncomplete': '代码里的列提示不完整',
            'code.cellsIncomplete': '代码里的格子不完整',
            'code.treesDim': '树位置行列对不上',
            'code.cellsDim': '格子行列对不上',
            'code.unknownCell': '格子状态不认识',
            'code.treeCellMismatch': '代码里树和格子标记不一致',
            'code.rowHintRange': '行提示数字越界',
            'code.colHintRange': '列提示数字越界',
            'code.nothingToCopy': '还没有可复制的代码',
            'code.copied': '代码已复制',
            'code.copyFailed': '复制失败，请手动选中复制',
            'code.copiedRestore': '代码已复制，下次粘贴即可还原',
            'code.restoreFailed': '还原失败：{msg}',
            'code.restored': '已按代码还原棋盘：{r}×{c}',

            'shot.done': '识别完成：{r}×{c}，树 {t} 棵',
            'shot.doneUnknown': '，{u} 项数字没把握（显示为 ?）',
            'shot.doneTail': '；如有出入，点格子改树、点数字改提示即可',
            'shot.notImage': '请选择图片文件',
            'shot.badImage': '图片打不开，请换一张试试',
            'shot.noClipboard': '当前浏览器不支持读取剪贴板，请改用「选择截图文件」',
            'shot.clipboardNoImage': '剪贴板里没有图片，请先复制游戏截图',
            'shot.clipboardFailed': '读取剪贴板失败，请先复制截图，或改用选择文件',
            'toast.demoLoaded': '已载入 {name} 示例',

            'recognize.noImage': '没有读到图片',
            'recognize.loading': '图片还没加载完，请再试一次',
            'recognize.readFail': '图片读取失败，可能是格式不支持',
            'recognize.noBoard': '没在图片里找到棋盘，请截完整的游戏画面（含格子和四周数字）',

            'pos.rowCol': '第 {r} 行第 {c} 列',
            'aria.rowHint': '第 {i} 行的帐篷数量',
            'aria.colHint': '第 {i} 列的帐篷数量',
            'aria.cell': '第 {r} 行第 {c} 列',
            'aria.langSwitch': '切换语言',
            'aria.langZh': '切换为中文',
            'aria.langEn': '切换为 English',
            'aria.toolbar': '操作',
            'aria.board': '棋盘',
            'aria.steps': '推理步骤',
            'aria.shot': '截图识别',
            'aria.code': '棋盘代码',
            'aria.help': '规则说明',
            'aria.slider': '选择步骤',
            'kind.initial': '初始',
            'kind.deduce': '推理',
            'kind.guess': '试探',
            'kind.done': '完成',
            'note.lineRow': '第 {i} 行',
            'note.lineCol': '第 {i} 列',
            'demo.level.beginner': '入门',
            'demo.level.practice': '练习',
            'demo.level.challenge': '挑战',
            'demo.level.hard': '高难',
            'demo.loadTitle': '{level}难度 · 点一下载入这道题',

            'rule.quotaZero': '配额已满',
            'rule.deadLand': '空地无树',
            'rule.tentIsolation': '帐篷周围不能放帐篷',
            'rule.isolatedTree': '孤树补帐篷',
            'rule.lineTightFill': '空格刚好等于缺口',
            'rule.packedLine': '隔一个放一个',
            'rule.pairMatch': '候选重合配对',
            'rule.boxLine': '配额被占满',
            'rule.ownerFixed': '帐篷的主人已确定',
            'rule.trialElimination': '试探排除',

            'note.quotaZero': '{cells}的帐篷已经够数，剩下的空格全部是草地。',
            'note.deadLand': '有 {n} 个格子上下左右都没有树，帐篷放在那儿配不出去，标成草地。',
            'note.tentIsolation': '帐篷之间不能相邻（斜着也不行），所以帐篷周围一圈共 {n} 个空格是草地。',
            'note.isolatedTreeItem': '{pos}的树只剩这一个地方能配帐篷（{pos2}）',
            'note.isolatedTree': '{list}，只能在唯一的位置放帐篷。',
            'note.lineTightItemRow': '第 {i} 行还差 {n} 个帐篷，而能放帐篷的格子正好只剩 {n} 个',
            'note.lineTightItemCol': '第 {i} 列还差 {n} 个帐篷，而能放帐篷的格子正好只剩 {n} 个',
            'note.lineTightFill': '{list}，这些格子只能全放帐篷。',
            'note.packedItemRow': '第 {i} 行最多只能放 {n} 个帐篷，正好等于缺口，只能隔一个放一个',
            'note.packedItemCol': '第 {i} 列最多只能放 {n} 个帐篷，正好等于缺口，只能隔一个放一个',
            'note.packedLine': '{list}。',
            'note.pairMatch': '有 {n} 个格子被候选完全相同的树"分光"了，必然都是帐篷：{list}。',
            'note.boxItemRow': '第 {i} 行的 {n} 个帐篷名额已经被 {n} 棵树占满',
            'note.boxItemCol': '第 {i} 列的 {n} 个帐篷名额已经被 {n} 棵树占满',
            'note.boxLine': '{list}，这一行其他格子都不可能是帐篷。',
            'note.ownerFixed': '有 {n} 个格子只挨着一棵"已经配好帐篷"的树，它们不可能再当帐篷：{list}。',
            'note.trialTent': '{pos}放帐篷会矛盾',
            'note.trialGrass': '{pos}放草地会矛盾',
            'note.trial': '试了几种可能，{list}，直接定下来。',

            'err.size': '棋盘尺寸必须在 {min} 到 {max} 之间。',
            'err.rowHint': '第 {r} 行左边的提示必须是 0 到 {c} 的整数，或者填「?」表示不知道。',
            'err.colHint': '第 {c} 列上面的提示必须是 0 到 {r} 的整数，或者填「?」表示不知道。',
            'err.hintSum': '左边提示合计 {a}，上面提示合计 {b}，两者必须相等（每个帐篷同时被一行和一列统计）。',
            'err.treeCount': '棋盘上放了 {t} 棵树，但提示合计是 {h}。每棵树对应一个帐篷，两个数字必须相同。',
            'err.rowOverflow': '第 {r} 行的帐篷数量超出了提示数字。',
            'err.rowNoSpace': '第 {r} 行只剩 {n} 个空格，却还差 {need} 个帐篷，放不下。',
            'err.rowRoom': '第 {r} 行还差 {need} 个帐篷，但按"帐篷不能相邻"算，这一行最多还能放 {room} 个。',
            'err.colOverflow': '第 {c} 列的帐篷数量超出了提示数字。',
            'err.colNoSpace': '第 {c} 列只剩 {n} 个空格，却还差 {need} 个帐篷，放不下。',
            'err.colRoom': '第 {c} 列还差 {need} 个帐篷，但按"帐篷不能相邻"算，这一列最多还能放 {room} 个。',
            'err.tentNoTree': '{pos}的帐篷四周没有树，帐篷必须挨着它配对的那棵树。',
            'err.tentTouch': '{pos}的帐篷挨着别的帐篷，两个帐篷不能相邻（斜着也不行）。',
            'err.treeNoSpot': '{pos}的树已经没有任何地方可以配帐篷了。',
            'err.noMatch': '局面已经配不成对了：{pos}的树抢不到属于自己的帐篷（还有 {n} 棵树同样没着落）。',

            'step.initialTitle': '初始局面',
            'step.invalidPrefix': '题目自相矛盾：{msg}',
            'step.initialNote': '题目的树和提示数字已经填好，其余格子都是"未定"，等待推理。',
            'step.doneTitle': '完成',
            'step.doneNotePure': '全部靠推理得出，没有猜过任何一步。',
            'step.stalledTime': '推理到第 {n} 步就卡住了，试探搜索也超出了时间限制。题目可能无解，也可能需要更长的搜索时间。',
            'step.stalledNoSolution': '推理到第 {n} 步就卡住了，试探也找不到解，这道题很可能是无解的，或者提示数字填错了。',
            'step.confirmPair': '确认配对',
            'step.confirmPairNote': '推理推不动了。先假设 {posTree} 的树配的是 {posCell} 这顶已经放好的帐篷，按这个假设继续往下推。',
            'step.guess': '试探',
            'step.guessNote': '推理推不动了。先假设 {posTree} 的树把帐篷放在 {posCell}，按这个假设继续往下推。',
            'step.replayBug': '找到了解，但回放步骤时出现了偏差，请反馈这个问题。',
            'step.doneNoteSearch': '解出来了：中间有 {n} 步是靠试探的，其余都是推理得出的。'
        },

        en: {
            'app.title': 'Tents and Trees Solver',
            'app.pageTitle': 'Tents and Trees Solver',
            'app.subtitle': 'Place trees and fill the numbers, then watch the puzzle solve step by step. Sizes 4×4 to 20×20.',
            'app.version': 'v0.1.0',

            'app.width': 'Width',
            'app.height': 'Height',
            'app.widthAria': 'Board width',
            'app.heightAria': 'Board height',
            'app.create': 'New board',
            'app.solve': 'Solve',
            'app.reset': 'Reset',
            'app.resetTitle': 'Clear tents and grass, keep trees and hints',
            'app.missingMode': 'Missing-number mode',
            'app.missingTitle': 'When on, row/column hints can be "?" (unknown); the tent count for that line is unconstrained',
            'app.demos': 'Examples',

            'board.title': 'Board',
            'board.editHint': 'Editing · click a cell to toggle a tree',
            'legend.tree': 'Tree',
            'legend.tent': 'Tent',
            'legend.grass': 'Grass',
            'legend.changed': 'Changed',
            'help.button': 'Rules',

            'steps.title': 'Steps',
            'steps.unsolved': 'Not solved',
            'steps.ready': 'Ready',
            'steps.readyTitle': 'Place the trees first, then click Solve.',
            'steps.readyNote': 'Each number on the left is how many tents go in that row; the numbers on top work the same for columns. Try an example first.',
            'steps.prev': 'Prev',
            'steps.play': 'Play',
            'steps.pause': 'Pause',
            'steps.next': 'Next',
            'steps.stepFrom': 'Step 1',
            'steps.stepTo': '{n} steps',
            'steps.counter': 'Step {i} of {n}',

            'shot.title': 'Screenshot import',
            'shot.hint': 'Paste a game screenshot to build the board automatically; fix any mistake directly on the board.',
            'shot.pick': 'Choose image',
            'shot.paste': 'Paste from clipboard',
            'shot.status': 'Works for same-style screenshots from 4×4 to 20×20. If a tree or number is off after import, click cells to edit trees and hint numbers.',
            'shot.gamePrefix': 'From the game',
            'shot.gameName': 'Tents and Trees',

            'code.title': 'Board code',
            'code.hint': 'Copy this code to restore the board later by pasting it back.',
            'code.placeholder': 'Click "Generate" to encode the current board; paste a received code here and click "Restore".',
            'code.gen': 'Generate',
            'code.copy': 'Copy',
            'code.restore': 'Restore',

            'help.title': 'About this game',
            'help.subtitle': 'Tents and Trees',
            'help.rulesTitle': 'Four rules',
            'help.rule1': 'Each tree is <b>paired with exactly one tent</b> (next to it up/down/left/right), and each tent belongs to one tree.',
            'help.rule2': 'A tent may <b>touch several trees at once</b> — the extra trees are just "nearby"; each still has its own paired tent.',
            'help.rule3': 'Tents cannot touch each other, <b>not even diagonally</b>.',
            'help.rule4': 'The number on the left of each row is its tent count; the number on top of each column is its column count. All remaining cells are grass.',
            'help.howTitle': 'How to use this page',
            'help.how1': 'Click "New board" to start an empty board at the chosen size.',
            'help.how2': 'Click cells to place trees; click again to remove. Fill in the hint numbers after the trees are set.',
            'help.how3': 'Click "Solve"; the step panel explains which rule was used and which cells changed.',
            'help.how4': 'When deduction stalls, the solver makes a "guess" step; guessed steps are highlighted orange.',
            'help.how5': 'In "Missing-number mode", a row/column hint can be "?" (unknown); its tent count is unconstrained. Other rules stay the same.',
            'help.how6': '"Board code" encodes the trees, hints and placed cells into a string. Save it; paste it back later to restore the board.',
            'help.how7': '"Screenshot import" reads a game screenshot: pick a file or paste a clipboard image to detect trees and hints. Fix anything wrong after import.',
            'help.note': 'The solver first applies common human deduction rules; if none move forward, it falls back to backtracking (try the tree with fewest options, back up if a path fails). Hard puzzles still get an answer, though a few steps may be guesses.',

            'mode.edit': 'Editing · click a cell to toggle a tree',
            'mode.view': 'Viewing · browse each step',
            'mode.viewBad': 'Viewing · the puzzle has a problem',
            'toast.viewMode': 'Viewing mode. Click Reset first to go back to editing.',
            'toast.boardCreated': 'Empty {r}×{c} board created',
            'toast.resetDone': 'Reset: trees and numbers kept, tents cleared',
            'toast.codeGenerated': 'Code generated from the current board',
            'toast.alreadyView': 'Already viewing the result. Click Reset first to edit the puzzle.',
            'solving': 'Solving…',
            'toast.solved': 'Solved in {n} steps ({g} guesses)',
            'step.problem': 'Problem',
            'step.failedTitle': 'No solution found',
            'step.failedNote': 'No solution.',

            'note.trees': '{n} trees',
            'note.hintSum': 'Hints total {n}',
            'note.hintSumUnknown': 'Known hints total {n} ({m} unknown)',
            'note.mismatchRowCol': 'Row and column hint totals do not match',
            'note.treesHintsMismatch': 'Tree count does not match the hints',
            'note.solvedSteps': '{n} steps, {g} guesses',

            'code.empty': 'The code is empty',
            'code.badFormat': 'Code format is invalid and cannot be decoded',
            'code.invalid': 'The code is not valid board data',
            'code.notObject': 'The code is not valid board data',
            'code.unknownVersion': 'Unrecognized code version; it may not be exported by this app',
            'code.badSize': 'Board size must be between {min}×{min} and {max}×{max}',
            'code.treesIncomplete': 'Tree positions in the code are incomplete',
            'code.rowHintsIncomplete': 'Row hints in the code are incomplete',
            'code.colHintsIncomplete': 'Column hints in the code are incomplete',
            'code.cellsIncomplete': 'Cells in the code are incomplete',
            'code.treesDim': 'Tree positions do not match the dimensions',
            'code.cellsDim': 'Cells do not match the dimensions',
            'code.unknownCell': 'Unrecognized cell state',
            'code.treeCellMismatch': 'Trees and cell marks in the code disagree',
            'code.rowHintRange': 'Row hint number is out of range',
            'code.colHintRange': 'Column hint number is out of range',
            'code.nothingToCopy': 'No code to copy yet',
            'code.copied': 'Code copied',
            'code.copyFailed': 'Copy failed; select and copy manually',
            'code.copiedRestore': 'Code copied; paste it back to restore',
            'code.restoreFailed': 'Restore failed: {msg}',
            'code.restored': 'Board restored from code: {r}×{c}',

            'shot.done': 'Imported {r}×{c}, {t} trees',
            'shot.doneUnknown': ', {u} numbers uncertain (shown as ?)',
            'shot.doneTail': 'If anything is off, click cells to edit trees and hints.',
            'shot.notImage': 'Please choose an image file',
            'shot.badImage': 'Could not open the image; try another one',
            'shot.noClipboard': 'This browser cannot read the clipboard; use "Choose image" instead',
            'shot.clipboardNoImage': 'No image in the clipboard; copy a game screenshot first',
            'shot.clipboardFailed': 'Clipboard read failed; copy the screenshot first or choose a file',
            'toast.demoLoaded': 'Loaded example {name}',

            'recognize.noImage': 'No image received',
            'recognize.loading': 'The image has not finished loading; please try again',
            'recognize.readFail': 'Failed to read the image; the format may be unsupported',
            'recognize.noBoard': 'No board found in the image; capture the full game view, including grid and surrounding numbers',

            'pos.rowCol': 'row {r}, col {c}',
            'aria.rowHint': 'Tents in row {i}',
            'aria.colHint': 'Tents in column {i}',
            'aria.cell': 'Row {r}, col {c}',
            'aria.langSwitch': 'Switch language',
            'aria.langZh': 'Switch to Chinese',
            'aria.langEn': 'Switch to English',
            'aria.toolbar': 'Controls',
            'aria.board': 'Board',
            'aria.steps': 'Steps',
            'aria.shot': 'Screenshot import',
            'aria.code': 'Board code',
            'aria.help': 'Rules',
            'aria.slider': 'Choose step',
            'kind.initial': 'Initial',
            'kind.deduce': 'Deduction',
            'kind.guess': 'Guess',
            'kind.done': 'Done',
            'note.lineRow': 'Row {i}',
            'note.lineCol': 'Col {i}',
            'demo.level.beginner': 'Beginner',
            'demo.level.practice': 'Practice',
            'demo.level.challenge': 'Challenge',
            'demo.level.hard': 'Hard',
            'demo.loadTitle': '{level} · click to load this puzzle',

            'rule.quotaZero': 'Quota full',
            'rule.deadLand': 'No tree nearby',
            'rule.tentIsolation': 'Keep tents apart',
            'rule.isolatedTree': 'Only spot for tree',
            'rule.lineTightFill': 'Slots match demand',
            'rule.packedLine': 'Alternating fill',
            'rule.pairMatch': 'Shared candidates',
            'rule.boxLine': 'Quota occupied',
            'rule.ownerFixed': 'Tent owner fixed',
            'rule.trialElimination': 'Trial elimination',

            'note.quotaZero': 'Tents in {cells} are already full; the rest are grass.',
            'note.deadLand': '{n} cells have no adjacent tree, so a tent there could not be paired; marked grass.',
            'note.tentIsolation': 'Tents cannot touch, even diagonally, so {n} surrounding cells are grass.',
            'note.isolatedTreeItem': 'The tree at {pos} has only one tent spot left ({pos2})',
            'note.isolatedTree': '{list} must place its tent in the only remaining spot.',
            'note.lineTightItemRow': 'Row {i} needs {n} tents and has exactly {n} viable cells left',
            'note.lineTightItemCol': 'Column {i} needs {n} tents and has exactly {n} viable cells left',
            'note.lineTightFill': '{list}: all these cells must be tents.',
            'note.packedItemRow': 'Row {i} can hold at most {n} tents, exactly its demand; alternating placement only',
            'note.packedItemCol': 'Column {i} can hold at most {n} tents, exactly its demand; alternating placement only',
            'note.packedLine': '{list}.',
            'note.pairMatch': '{n} cells are shared candidates of identical trees, so all must be tents: {list}.',
            'note.boxItemRow': 'The {n} tent slots in row {i} are already taken by {n} trees',
            'note.boxItemCol': 'The {n} tent slots in column {i} are already taken by {n} trees',
            'note.boxLine': '{list}: no other cell in this line can be a tent.',
            'note.ownerFixed': '{n} cells touch only a tree already paired, so they cannot be tents: {list}.',
            'note.trialTent': 'tent at {pos} would contradict',
            'note.trialGrass': 'grass at {pos} would contradict',
            'note.trial': 'Tried alternatives: {list}; settled directly.',

            'err.size': 'Board size must be between {min} and {max}.',
            'err.rowHint': 'Row {r} hint must be an integer from 0 to {c}, or "?" if unknown.',
            'err.colHint': 'Column {c} hint must be an integer from 0 to {r}, or "?" if unknown.',
            'err.hintSum': 'Row hints total {a}, column hints total {b}; they must be equal (each tent counts once in a row and once in a column).',
            'err.treeCount': 'There are {t} trees but hints total {h}. Each tree has one tent, so the two numbers must match.',
            'err.rowOverflow': 'Row {r} has more tents than its hint allows.',
            'err.rowNoSpace': 'Row {r} has only {n} empty cells but still needs {need} tents; no room.',
            'err.rowRoom': 'Row {r} still needs {need} tents, but with the no-touch rule it can hold at most {room}.',
            'err.colOverflow': 'Column {c} has more tents than its hint allows.',
            'err.colNoSpace': 'Column {c} has only {n} empty cells but still needs {need} tents; no room.',
            'err.colRoom': 'Column {c} still needs {need} tents, but with the no-touch rule it can hold at most {room}.',
            'err.tentNoTree': 'The tent at {pos} touches no tree; a tent must be next to its paired tree.',
            'err.tentTouch': 'The tent at {pos} touches another tent; tents cannot touch, even diagonally.',
            'err.treeNoSpot': 'The tree at {pos} has nowhere left to place a tent.',
            'err.noMatch': 'No valid pairing: the tree at {pos} cannot get its own tent ({n} other trees are also unmatched).',

            'step.initialTitle': 'Initial board',
            'step.invalidPrefix': 'Contradiction in the puzzle: {msg}',
            'step.initialNote': 'Trees and hints are set; every other cell is undecided, waiting for deduction.',
            'step.doneTitle': 'Done',
            'step.doneNotePure': 'Fully deduced; no guesses were made.',
            'step.stalledTime': 'Stalled after {n} steps and the search exceeded the time limit. The puzzle may have no solution, or it may need longer searching.',
            'step.stalledNoSolution': 'Stalled after {n} steps and no solution was found by guessing. The puzzle is likely unsolvable or the hints are wrong.',
            'step.confirmPair': 'Confirm pairing',
            'step.confirmPairNote': 'Deduction stalled. Assume the tree at {posTree} pairs with the already-placed tent at {posCell}, and continue from there.',
            'step.guess': 'Guess',
            'step.guessNote': 'Deduction stalled. Assume the tree at {posTree} places its tent at {posCell}, and continue from there.',
            'step.replayBug': 'A solution was found, but replaying the steps drifted; please report this issue.',
            'step.doneNoteSearch': 'Solved: {n} steps relied on guessing, the rest were deduced.'
        }
    };

    let lang = 'zh';
    try {
        const saved = localStorage.getItem(STORE_KEY);
        if (saved === 'zh' || saved === 'en') {
            lang = saved;
        } else if (typeof location !== 'undefined') {
            const q = new URLSearchParams(location.search);
            const urlLang = q.get('lang') || location.hash.replace('#', '');
            if (urlLang === 'zh' || urlLang === 'en') {
                lang = urlLang;
            }
        }
    } catch (e) {
        /* 隐私模式等场景下 localStorage 不可用，保持默认中文 */
    }

    function t(key, vars) {
        let text = (dict[lang] && dict[lang][key]) || (dict.zh[key]) || key;
        if (vars) {
            Object.keys(vars).forEach(function (k) {
                let v = vars[k];
                if (Array.isArray(v)) {
                    v = v.map(function (item) { return typeof item === 'string' ? item : String(item); })
                        .join(lang === 'en' ? ', ' : '、');
                }
                text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
            });
        }
        return text;
    }

    function getLang() {
        return lang;
    }

    function setLang(next) {
        if (next !== 'zh' && next !== 'en') {
            return;
        }
        lang = next;
        try {
            localStorage.setItem(STORE_KEY, next);
        } catch (e) {
            /* 忽略写入失败 */
        }
        applyStatic();
    }

    /* 把带 data-i18n 的静态元素刷新成当前语言；
       data-i18n-ph 换占位符，data-i18n-title 换 title，data-i18n-aria 换 aria-label。 */
    function applyStatic() {
        if (typeof document === 'undefined') {
            return;
        }
        document.querySelectorAll('[data-i18n]').forEach(function (node) {
            node.textContent = t(node.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(function (node) {
            node.setAttribute('placeholder', t(node.getAttribute('data-i18n-ph')));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function (node) {
            node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
        });
        document.querySelectorAll('[data-i18n-aria]').forEach(function (node) {
            node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria')));
        });
        document.querySelectorAll('[data-i18n-html]').forEach(function (node) {
            node.innerHTML = t(node.getAttribute('data-i18n-html'));
        });
        document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
        document.title = t('app.pageTitle');
    }

    TT.i18n = {
        t: t,
        getLang: getLang,
        setLang: setLang,
        applyStatic: applyStatic
    };

})(window.TT);
