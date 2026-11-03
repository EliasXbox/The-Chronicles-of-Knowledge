/*:
 * @plugindesc v0.1 - Herois a esquerda; inimigos SV e recortes de tilesets.
 * @author As Cronicas do Saber
 * @help
 * Ative abaixo de ACS_EducationalBattle. Reinicie o teste do jogo.
 * Nas Notas de um inimigo, use UMA destas opcoes:
 * <ACSSV: Actor1_1>
 *   Nome da folha em img/sv_actors, sem .png. Usa poses animadas.
 * <ACSTile: Outside_B,288,432,48,48>
 *   Arquivo em img/tilesets e retangulo em pixels (x,y,largura,altura).
 * <ACSScale: 2>
 * <ACSMirror: true>
 *   Espelha o inimigo na horizontal. Aceita escala decimal, como 1.5.
 *   Escala opcional (1 a 4). O boneco acima usa escala 2 por padrao.
 * A visao lateral e ativada pelo plugin sem alterar System.json.
 * Os inimigos sem notas continuam usando suas imagens normais.
 * O posicionamento dos inimigos e automatico no lado direito.
 */
(function() {
    'use strict';
    var sideView = Game_System.prototype.isSideView;
    Game_System.prototype.isSideView = function() { return true; };
    var actorHome = Sprite_Actor.prototype.setActorHome;
    Sprite_Actor.prototype.setActorHome = function(index) {
        this.setHome(180 - index * 24, Graphics.boxHeight * 0.46 + index * 44);
    };
    // Only mirror the body and weapon, keeping state icons and damage readable.
    var actorUpdate = Sprite_Actor.prototype.update;
    Sprite_Actor.prototype.update = function() {
        actorUpdate.call(this);
        this._mainSprite.scale.x = -1;
        this._weaponSprite.scale.x = -1;
    };
    Sprite_Actor.prototype.moveToStartPosition = function() { this.startMove(-300, 0, 0); };
    Sprite_Actor.prototype.stepForward = function() { this.startMove(48, 0, 12); };
    Sprite_Actor.prototype.retreat = function() { this.startMove(-Graphics.boxWidth, 0, 30); };
    function visual(enemy) {
        var meta = enemy.enemy().meta || {};
        var scale = Math.max(1, Math.min(4, Number(meta.ACSScale) || (meta.ACSTile ? 2 : 1)));
        var mirror = String(meta.ACSMirror || '').trim().toLowerCase() === 'true';
        if (meta.ACSSV) return {type:'sv', name:String(meta.ACSSV).trim(), scale:scale, mirror:mirror};
        if (meta.ACSTile) {
            var parts = String(meta.ACSTile).split(',');
            var rect = parts.slice(1).map(Number);
            if (parts.length === 5 && rect.every(function(n) { return isFinite(n) && n >= 0; }) && rect[2] > 0 && rect[3] > 0) {
                return {type:'tile',name:parts[0].trim(),rect:rect,scale:scale,mirror:mirror};
            }
        }
        return null;
    }
    var enemySet = Sprite_Enemy.prototype.setBattler;
    Sprite_Enemy.prototype.setBattler = function(battler) {
        enemySet.call(this,battler);
        this._acsVisualKey = null;
        this._acsPose = 1; this._acsPoseTicks = 0; this._acsClock = 0;
        var index = battler.index();
        this.setHome(Graphics.boxWidth - 170 + Math.floor(index / 4) * 65,
            Graphics.boxHeight * 0.43 + (index % 4) * 48);
    };
    var enemyBitmap = Sprite_Enemy.prototype.updateBitmap;
    Sprite_Enemy.prototype.updateBitmap = function() {
        var config = visual(this._enemy);
        this._acsVisual = config;
        if (!config) {
            if (this._acsVisualKey) { this._battlerName = null; this.scale.x = this.scale.y = 1; }
            this._acsVisualKey = null;
            return enemyBitmap.call(this);
        }
        var key = JSON.stringify(config);
        if (key !== this._acsVisualKey) {
            this._acsVisualKey = key;
            this.bitmap = config.type === 'sv' ? ImageManager.loadSvActor(config.name) : ImageManager.loadTileset(config.name);
            this.scale.x = config.mirror ? -config.scale : config.scale;
            this.scale.y = config.scale;
            this.initVisibility();
        }
    };
    var enemyFrame = Sprite_Enemy.prototype.updateFrame;
    Sprite_Enemy.prototype.updateFrame = function() {
        var config = this._acsVisual;
        if (!config) return enemyFrame.call(this);
        if (config.type === 'tile') {
            var r = config.rect;
            this._acsFrameHeight = r[3]; this.setFrame(r[0],r[1],r[2],r[3]);
        } else {
            this._acsClock++;
            if (this._acsPoseTicks > 0) this._acsPoseTicks--;
            var pose = this._acsPoseTicks > 0 ? this._acsPose : (this._enemy.isDying() ? 14 : 1);
            var pattern = [0,1,2,1][Math.floor(this._acsClock / 12) % 4];
            var w = this.bitmap.width / 9, h = this.bitmap.height / 6;
            this._acsFrameHeight = h;
            this.setFrame((Math.floor(pose / 6) * 3 + pattern) * w, (pose % 6) * h, w, h);
        }
    };
    var statePosition = Sprite_Enemy.prototype.updateStateSprite;
    Sprite_Enemy.prototype.updateStateSprite = function() {
        if (!this._acsVisual) return statePosition.call(this);
        this._stateIconSprite.y = -(this._acsFrameHeight || 48) - 16;
        this._stateIconSprite.scale.x = 1 / this.scale.x;
        this._stateIconSprite.scale.y = 1 / this.scale.y;
    };
    function animate(enemy, pose) {
        var scene = SceneManager._scene;
        var sprites = scene && scene._spriteset && scene._spriteset._enemySprites;
        if (sprites) sprites.forEach(function(sprite) {
            if (sprite._enemy === enemy) { sprite._acsPose = pose; sprite._acsPoseTicks = 36; sprite._acsClock = 0; }
        });
    }
    var enemyAction = Game_Enemy.prototype.performAction;
    Game_Enemy.prototype.performAction = function(action) {
        enemyAction.call(this,action);
        animate(this, action.isMagicSkill() ? 10 : action.isAttack() ? 6 : 9);
    };
    var enemyDamage = Game_Enemy.prototype.performDamage;
    Game_Enemy.prototype.performDamage = function() { enemyDamage.call(this); animate(this,4); };
})();
