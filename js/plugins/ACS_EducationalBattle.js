/*:
 * @plugindesc v0.2 - Matematica, portugues e coordenacao motora no combate.
 * @author As Cronicas do Saber
 * @help
 * Nas Notas de uma habilidade, use:
 * <ACSSubject: math> ou <ACSSubject: portuguese>
 * <ACSDifficulty: 1> (1 a 3; padrao 1)
 * <ACSSubject: pe> para Educacao Fisica.
 * O Ataque padrao recebe PE facil automaticamente, sem precisar de notas.
 * <ACSControls: auto> (auto, keyboard, touch; padrao auto)
 *
 * Apenas acoes normais dos herois em combate recebem desafios.
 * Itens e outras habilidades sem notas continuam normais.
 * Erro consome a acao e seu custo de MP/TP, sem efeitos da habilidade.
 * Acerto permite a execucao normal (inclusive acerto/evasao do MV).
 * Sem limite de tempo nesta primeira versao. Setas/Enter ou mouse/toque.
 * Acoes forcadas por eventos nao recebem desafios nesta versao.
 */
(function() {
    'use strict';
    var ACS = window.ACS_EducationalBattle = {};
    ACS.physical = null;
    // Battle events choose their own switch IDs; no database edits are required.
    ACS.beginTutorial = function(actorId, magicSkillId, attackSwitch, magicSwitch) {
        var ids = [actorId, magicSkillId, attackSwitch, magicSwitch].map(Number);
        if (ids.some(function(n) { return !isFinite(n) || n < 1 || Math.floor(n) !== n; }) || ids[2] === ids[3]) {
            throw new Error('ACS.beginTutorial: use IDs positivos e switches diferentes.');
        }
        this._tutorial = {actorId:ids[0],magicSkillId:ids[1],attackSwitch:ids[2],magicSwitch:ids[3],attackDone:false,magicDone:false};
        this._healingTutorial = null;
        $gameSwitches.setValue(ids[2],false); $gameSwitches.setValue(ids[3],false);
    };
    ACS.beginHealingTutorial = function(actorId, skillId, successSwitch) {
        var actor = $gameActors.actor(actorId), skill = $dataSkills[skillId];
        if (!actor || !skill || !Number.isInteger(successSwitch) || successSwitch < 1) throw new Error('ACS: configuração de cura inválida.');
        this._healingTutorial = {actorId:actorId,skillId:skillId,successSwitch:successSwitch};
        $gameSwitches.setValue(successSwitch,false);
        actor.learnSkill(skillId);
        actor.gainMp(Math.max(0,actor.skillMpCost(skill) - actor.mp));
        var damage = Math.min(Math.max(1,Math.floor(actor.mhp * 0.35)),Math.max(0,actor.hp - 1));
        actor.gainHp(-damage);
        actor.startAnimation(1,false,0); actor.performDamage(); actor.startDamagePopup();
        BattleManager.refreshStatus();
    };
    ACS.stopTutorial = function() { this._tutorial = null; this._healingTutorial = null; };
    var applyAction = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        var previousHp = target.hp;
        applyAction.call(this,target);
        var watch = BattleManager._acsTutorialAction;
        if (watch && watch.action === this && target.isEnemy() && target.result().isHit()) watch.hit = true;
        if (watch && watch.action === this && target.isActor && target.isActor() && target.hp > previousHp && target.result().isHit()) {
            watch.healedActors = watch.healedActors || {};
            watch.healedActors[target.actorId()] = true;
        }
    };
    var endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        var watch = this._acsTutorialAction;
        this._acsTutorialAction = null;
        endAction.call(this);
        var healing = ACS._healingTutorial;
        if (healing && watch && watch.actor.actorId() === healing.actorId && watch.action.item().id === healing.skillId && watch.healedActors && watch.healedActors[healing.actorId]) {
            $gameSwitches.setValue(healing.successSwitch,true);
            ACS._healingTutorial = null;
        }
        var tutorial = ACS._tutorial;
        if (!watch || !watch.hit || !tutorial || watch.actor.actorId() !== tutorial.actorId) return;
        if (!tutorial.attackDone && watch.attack) {
            tutorial.attackDone = true;
            $gameSwitches.setValue(tutorial.attackSwitch,true);
        } else if (tutorial.attackDone && !tutorial.magicDone && watch.action.item().id === tutorial.magicSkillId) {
            tutorial.magicDone = true;
            $gameSwitches.setValue(tutorial.magicSwitch,true);
        }
    };
    // Listen only during our minigame; do not replace MV's global key mapping.
    if (typeof document !== 'undefined') {
        document.addEventListener('keydown', function(event) {
            var game = ACS.physical;
            if (!game || !game._running || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
            var key = String(event.key || '').toUpperCase();
            if (/^[A-Z]$/.test(key) || /^ARROW(UP|DOWN|LEFT|RIGHT)$/.test(key)) {
                event.preventDefault();
                if (game._keys.length < 8) game._keys.push(key);
            }
        });
    }
    ACS.makePhysical = function(difficulty) {
        var level = Math.floor(Math.max(1, Math.min(3, Number(difficulty) || 1)));
        var pool = ['ARROWLEFT','ARROWUP','ARROWRIGHT','ARROWDOWN'];
        if (level > 1) pool = pool.concat(['A','S','D','W','J','K']);
        var count = [1,3,5][level - 1], sequence = [];
        for (var i = 0; i < count; i++) sequence.push(pool[integer(0,pool.length - 1)]);
        return { sequence:sequence, frames:[120,105,90][level - 1], radius:[38,32,27][level - 1] };
    };
    function Window_ACSPhysical() { this.initialize.apply(this,arguments); }
    Window_ACSPhysical.prototype = Object.create(Window_Base.prototype);
    Window_ACSPhysical.prototype.constructor = Window_ACSPhysical;
    ACS.PhysicalWindow = Window_ACSPhysical;
    Window_ACSPhysical.prototype.initialize = function() {
        Window_Base.prototype.initialize.call(this,16,64,Graphics.boxWidth - 32,Graphics.boxHeight - 96);
        this._running = false; this._keys = []; this.hide(); this.backOpacity = 210;
    };
    Window_ACSPhysical.prototype.present = function(pending) {
        this._challenge = ACS.makePhysical(pending.action.item().meta.ACSDifficulty);
        this._control = String(pending.action.item().meta.ACSControls || 'auto').trim().toLowerCase();
        if (['auto','keyboard','touch'].indexOf(this._control) < 0) this._control = 'auto';
        this._mode = this._control === 'auto' ? (Utils.isMobileDevice() ? 'touch' : 'keyboard') : this._control;
        this._caption = pending.actor.name() + ' — ' + pending.action.item().name;
        this._step = 0; this._elapsed = 0; this._grace = 30; this._keys = [];
        this._running = true; ACS.physical = this; this.show(); this.open();
        this._points = [];
        var positions = [[0.25,0.45],[0.72,0.65],[0.48,0.42],[0.25,0.72],[0.76,0.37]];
        for (var i = 0; i < this._challenge.sequence.length; i++) {
            this._points.push({x:this.contentsWidth() * positions[i][0], y:this.contentsHeight() * positions[i][1]});
        }
        this.redraw();
    };
    Window_ACSPhysical.prototype.finish = function(correct) {
        if (!this._running) return;
        this._running = false; this._keys = []; ACS.physical = null; this.hide();
        Input.clear(); TouchInput.clear();
        BattleManager.acsResolve(correct, '');
    };
    Window_ACSPhysical.prototype.attempt = function(correct) {
        var progress = this._elapsed / this._challenge.frames;
        if (!correct || progress < 0.35 || progress > 0.95) return this.finish(false);
        this._step++;
        if (this._step === this._challenge.sequence.length) return this.finish(true);
        this._elapsed = 0; this._grace = 12; this._keys = [];
    };
    Window_ACSPhysical.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (!this._running) return;
        if (this._grace > 0) { this._grace--; this._keys = []; this.redraw(); return; }
        this._elapsed++;
        if (this._elapsed > this._challenge.frames) return this.finish(false);
        if (TouchInput.isTriggered() && this._control !== 'keyboard') {
            this._mode = 'touch';
            var point = this._points[this._step];
            var dx = TouchInput.x - this.x - this.padding - point.x;
            var dy = TouchInput.y - this.y - this.padding - point.y;
            this.attempt(dx * dx + dy * dy <= Math.pow(this._challenge.radius,2));
        } else if (this._keys.length && this._control !== 'touch') {
            this._mode = 'keyboard';
            this.attempt(this._keys.shift() === this._challenge.sequence[this._step]);
        }
        this._keys = []; if (this._running) this.redraw();
    };
    Window_ACSPhysical.prototype.redraw = function() {
        var b = this.contents, w = this.contentsWidth(); b.clear(); b.fontSize = 20;
        this.drawText(this._caption,0,0,w,'center');
        this.drawText('Educação Física — ' + (this._step + 1) + '/' + this._challenge.sequence.length,0,32,w,'center');
        this.drawText('Aperte a tecla ou toque no ponto quando o anel ficar verde.',0,64,w,'center');
        var progress = this._elapsed / this._challenge.frames;
        var ready = !this._grace && progress >= 0.35 && progress <= 0.95;
        var point = this._points[this._step], r = this._challenge.radius;
        b.drawCircle(point.x,point.y,r,ready ? '#26734b' : '#454b59');
        var ctx = b._context;
        ctx.save(); ctx.strokeStyle = ready ? '#80ffb0' : '#e6d78a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(point.x,point.y,r + (1 - progress) * 28,0,Math.PI * 2); ctx.stroke(); ctx.restore();
        b._setDirty();
        var arrows = {ARROWLEFT:'←',ARROWUP:'↑',ARROWRIGHT:'→',ARROWDOWN:'↓'};
        var key = this._challenge.sequence[this._step];
        b.fontSize = 28;
        this.drawText(this._mode === 'touch' ? String(this._step + 1) : (arrows[key] || key),point.x-r,point.y-18,r*2,'center');
        b.fontSize = 18;
        this.drawText(this._grace ? 'Prepare-se…' : ready ? 'AGORA!' : 'Espere o verde…',0,this.contentsHeight()-44,w,'center');
    };
    function integer(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }
    function shuffle(items) {
        for (var i = items.length - 1; i > 0; i--) {
            var j = integer(0, i), temp = items[i];
            items[i] = items[j]; items[j] = temp;
        }
        return items;
    }
    var portuguese = [
        [
            ['Complete: Ela ___ estudar hoje.', 'vai', 'vou', 'vamos', 'vão'],
            ['Qual palavra está escrita corretamente?', 'coração', 'corassão', 'coraçao', 'corasão'],
            ['Qual é o plural de "flor"?', 'flores', 'flors', 'floris', 'florões'],
            ['Qual palavra é um verbo?', 'correr', 'janela', 'azul', 'mesa']
        ],
        [
            ['Complete: Nós ___ cedo ontem.', 'chegamos', 'chegou', 'chegaram', 'cheguei'],
            ['Qual é o antônimo de "alegre"?', 'triste', 'feliz', 'contente', 'animado'],
            ['Complete: Quero estudar, ___ estou cansado.', 'mas', 'mais', 'más', 'máis'],
            ['Qual palavra é uma proparoxítona?', 'médico', 'café', 'papel', 'janela']
        ],
        [
            ['Complete: ___ dois anos que moro aqui.', 'Faz', 'Fazem', 'Faziam', 'Fizeram'],
            ['Complete: Espero que eles ___ amanhã.', 'venham', 'vem', 'vêm', 'vinham'],
            ['Complete: Não sei ___ ele saiu.', 'por que', 'porque', 'porquê', 'por quê'],
            ['Complete: Ela se referiu ___ professora.', 'à', 'a', 'há', 'á']
        ]
    ];
    ACS.makeQuestion = function(subject, difficulty) {
        var level = Math.max(1, Math.min(3, Number(difficulty) || 1));
        level = Math.floor(level);
        var prompt, answer, options;
        if (subject === 'math') {
            var a = integer(1, level === 1 ? 10 : 20);
            var b = integer(1, level === 1 ? 10 : 12);
            var op = level === 1 ? 0 : integer(0, level === 2 ? 1 : 2);
            if (op === 0) { prompt = a + ' + ' + b + ' = ?'; answer = a + b; }
            if (op === 1) {
                var high = Math.max(a, b), low = Math.min(a, b);
                prompt = high + ' − ' + low + ' = ?'; answer = high - low;
            }
            if (op === 2) { prompt = a + ' × ' + b + ' = ?'; answer = a * b; }
            options = [answer, answer + 1, answer + 2, answer === 0 ? 3 : answer - 1];
            options = options.map(String); answer = String(answer);
        } else {
            var bank = portuguese[level - 1];
            var entry = bank[integer(0, bank.length - 1)];
            prompt = entry[0]; answer = entry[1]; options = entry.slice(1);
        }
        return { prompt: prompt, answer: answer, options: shuffle(options) };
    };
    function Window_ACSChallenge() { this.initialize.apply(this, arguments); }
    Window_ACSChallenge.prototype = Object.create(Window_Command.prototype);
    Window_ACSChallenge.prototype.constructor = Window_ACSChallenge;
    Window_ACSChallenge.prototype.initialize = function() {
        this._question = null;
        Window_Command.prototype.initialize.call(this, 0, 0);
        this.openness = 0; this.deactivate(); this.hide();
        this.backOpacity = 210;
        this.setHandler('answer', this.answer.bind(this));
    };
    Window_ACSChallenge.prototype.windowWidth = function() {
        return Math.min(660, Graphics.boxWidth - 32);
    };
    Window_ACSChallenge.prototype.windowHeight = function() { return this.fittingHeight(7); };
    Window_ACSChallenge.prototype.numVisibleRows = function() { return 4; };
    Window_ACSChallenge.prototype.itemRect = function(index) {
        var rect = Window_Command.prototype.itemRect.call(this, index);
        rect.y += this.lineHeight() * 3;
        return rect;
    };
    Window_ACSChallenge.prototype.makeCommandList = function() {
        if (!this._question) return;
        this._question.options.forEach(function(option) {
            this.addCommand(option, 'answer', true, option);
        }, this);
    };
    Window_ACSChallenge.prototype.refresh = function() {
        Window_Command.prototype.refresh.call(this);
        if (!this._question) return;
        this.contents.fontSize = 20;
        this.changeTextColor(this.systemColor());
        this.drawText(this._caption, 0, 0, this.contentsWidth(), 'center');
        this.resetTextColor();
        this.drawText(this._question.prompt, 0, this.lineHeight(), this.contentsWidth(), 'center');
        this.resetFontSettings();
    };
    Window_ACSChallenge.prototype.present = function(pending) {
        var item = pending.action.item();
        this._question = ACS.makeQuestion(pending.subject, item.meta.ACSDifficulty);
        this._caption = pending.actor.name() + ' — ' + item.name;
        this.refresh();
        this.x = (Graphics.boxWidth - this.width) / 2;
        this.y = Math.max(8, Math.floor((Graphics.boxHeight - this.height) / 2) - 36);
        this.select(0); this.show(); this.open(); this.activate();
    };
    Window_ACSChallenge.prototype.answer = function() {
        var correct = this.currentExt() === this._question.answer;
        var expected = this._question.answer;
        this.deactivate(); this.close();
        BattleManager.acsResolve(correct, expected);
    };
    var createWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        createWindows.call(this);
        this._acsChallengeWindow = new Window_ACSChallenge();
        this.addWindow(this._acsChallengeWindow);
        this._acsPhysicalWindow = new Window_ACSPhysical();
        this.addWindow(this._acsPhysicalWindow);
    };
    var processTurn = BattleManager.processTurn;
    BattleManager.processTurn = function() {
        var actor = this._subject;
        var action = actor && actor.currentAction();
        var item = action && action.item();
        var subject = item && item.meta && String(item.meta.ACSSubject || '').trim().toLowerCase();
        if (!subject && action && action.isAttack()) subject = 'pe';
        var scene = SceneManager._scene;
        if (!actor || !action || !actor.isActor() || actor.isConfused() || !action.isSkill() ||
            (subject !== 'math' && subject !== 'portuguese' && subject !== 'pe') ||
            !scene || !scene._acsChallengeWindow) {
            return processTurn.call(this);
        }
        action.prepare();
        if (!action.isValid()) { actor.removeCurrentAction(); return; }
        this._acsPending = { actor: actor, action: action, subject: subject };
        this._phase = 'acsChallenge';
        if (subject === 'pe') scene._acsPhysicalWindow.present(this._acsPending);
        else scene._acsChallengeWindow.present(this._acsPending);
    };
    BattleManager.acsResolve = function(correct, expected) {
        var pending = this._acsPending;
        if (!pending) return;
        this._acsPending = null;
        if (correct) {
            this._acsTutorialAction = {actor:pending.actor,action:pending.action,attack:pending.action.isAttack(),hit:false};
            this._logWindow.push('addText', pending.subject === 'pe' ? 'Movimento correto!' : 'Resposta correta!');
            this.startAction();
        } else {
            pending.actor.useItem(pending.action.item());
            var healing = ACS._healingTutorial;
            if (healing && pending.actor.actorId() === healing.actorId && pending.action.item().id === healing.skillId) {
                // A failed practice answer must not leave the lesson without MP.
                pending.actor.gainMp(pending.actor.skillMpCost(pending.action.item()));
            }
            this.refreshStatus();
            this._logWindow.push('addText', pending.subject === 'pe' ? 'O golpe falhou: movimento fora do ritmo.' : 'A magia falhou. Resposta: ' + expected + '.');
            this._logWindow.push('wait');
            this._phase = 'turn';
        }
        pending.actor.removeCurrentAction();
    };
    var endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        this._acsPending = null;
        this._acsTutorialAction = null; ACS.stopTutorial();
        if (ACS.physical) { ACS.physical._running = false; ACS.physical.hide(); ACS.physical = null; }
        var scene = SceneManager._scene;
        if (scene && scene._acsChallengeWindow) {
            scene._acsChallengeWindow.deactivate(); scene._acsChallengeWindow.hide();
        }
        endBattle.call(this, result);
    };
})();
