/* ============================================================
   ИГРОВОЙ ДВИЖОК
   Сцена → строки (тап = далее) → выборы / next / branch / ending.
   Состояние пишется в Store после каждого шага: закрыл вкладку —
   продолжил с той же реплики.
   ============================================================ */

const Engine = {
  story: null,
  state: null,        // {sceneId, lineIndex, stats, paid[], visited[], log[], completed, endingsFound[]}
  typing: null,       // {timer, full, done}
  onEvent: null,      // колбэк в UI: (type, payload)

  emit(type, payload) { this.onEvent && this.onEvent(type, payload); },

  freshState(story) {
    const stats = {};
    Object.keys(story.stats || {}).forEach(k => stats[k] = 0);
    const prev = Store.getProgress(story.id) || {};
    return {
      sceneId: story.start, lineIndex: 0, stats,
      paid: [], visited: [story.start], log: [],
      // seen: сцены, виденные в ЛЮБОМ прохождении (для «пропуска прочитанного»)
      seen: prev.seen || prev.visited || [story.start],
      completed: false,
      endingsFound: prev.endingsFound || [],
      completedBefore: prev.completed || false,
    };
  },

  open(story, mode) { // mode: 'continue' | 'restart'
    this.stopTyping();
    this.story = story;
    const saved = Store.getProgress(story.id);
    if (mode === 'continue' && saved && story.scenes[saved.sceneId] && !saved.completed) {
      this.state = saved;
    } else {
      this.state = this.freshState(story);
    }
    if (!this.state.seen) this.state.seen = (this.state.visited || []).slice();
    // Защита от сохранений прошлой версии истории: сцена могла укоротиться.
    const sc0 = this.scene();
    if (sc0) this.state.lineIndex = Math.max(0, Math.min(this.state.lineIndex || 0, sc0.lines.length - 1));
    this._finishedSceneId = null;
    // снимок «уже читано до этого захода» — граница для пропуска прочитанного
    this.seenBefore = new Set([...(this.state.seen || []), ...(this.state.visited || [])]);
    this.persist();
    this.render();
  },

  persist() { if (this.story && this.state) Store.setProgress(this.story.id, this.state); },
  scene() { return this.story.scenes[this.state.sceneId]; },
  line() { return this.scene().lines[this.state.lineIndex] || null; },

  applyEffect(effect) {
    if (!effect) return;
    const changes = [];
    for (const [k, v] of Object.entries(effect)) {
      this.state.stats[k] = (this.state.stats[k] || 0) + v;
      const meta = (this.story.stats || {})[k] || {};
      changes.push(`${meta.icon || '✦'} ${meta.label || k} ${v > 0 ? '+' : ''}${v}`);
    }
    if (changes.length) this.emit('stat-change', changes);
  },

  checkRequires(choice) {
    // возвращает null если доступно, иначе текст причины
    for (const [k, need] of Object.entries(choice.requires || {})) {
      if ((this.state.stats[k] || 0) < need) {
        const meta = (this.story.stats || {})[k] || {};
        return `Нужно: ${meta.label || k} ≥ ${need}`;
      }
    }
    return null;
  },

  choiceKey(choice, idx) { return `${this.state.sceneId}:${idx}`; },
  isPaid(choice, idx) { return this.state.paid.includes(this.choiceKey(choice, idx)); },

  choose(idx) {
    const choice = (this.scene().choices || [])[idx];
    if (!choice) return;

    const locked = this.checkRequires(choice);
    if (locked) { this.emit('locked', locked); return; }

    const cost = choice.crystals || 0;
    if (cost > 0 && !this.isPaid(choice, idx)) {
      if (!Store.spendCrystals(cost, `Выбор в «${this.story.title}»`)) {
        this.emit('need-crystals', { cost, idx });
        return;
      }
      this.state.paid.push(this.choiceKey(choice, idx)); // повторно в этом прохождении не платим
      this.emit('crystals-spent', cost);
    }

    this.state.log.push({ type: 'choice', text: choice.text });
    this.applyEffect(choice.effect);
    this.emit('choice-made', { paid: cost > 0 });
    this.goTo(choice.next);
  },

  goTo(sceneId) {
    if (!this.story.scenes[sceneId]) return;
    this._finishedSceneId = null;
    this.state.sceneId = sceneId;
    this.state.lineIndex = 0;
    if (!this.state.visited.includes(sceneId)) this.state.visited.push(sceneId);
    if (this.state.seen && !this.state.seen.includes(sceneId)) this.state.seen.push(sceneId);
    this.persist();
    this.render();
  },

  /* Пропуск прочитанного: мгновенно листает уже виденные сцены до ближайшего
     выбора, финала или первой непрочитанной сцены. Возвращает true, если сдвинулись. */
  skipRead() {
    if (!this.state || !this.scene()) return false;
    if (this.seenBefore && !this.seenBefore.has(this.state.sceneId)) return false;
    this.stopTyping();
    this._finishedSceneId = null;
    const fromScene = this.state.sceneId, fromLine = this.state.lineIndex;
    let guard = 0;
    while (guard++ < 1500) {
      const sc = this.scene();
      if (!sc) break;
      if (this.state.lineIndex < sc.lines.length - 1) { this.state.lineIndex = sc.lines.length - 1; continue; }
      if (sc.ending || (sc.choices || []).length) break;
      const target = this.resolveBranch(sc) || sc.next;
      if (!target || !this.story.scenes[target]) break;
      this.state.sceneId = target;
      this.state.lineIndex = 0;
      if (!this.state.visited.includes(target)) this.state.visited.push(target);
      if (this.state.seen && !this.state.seen.includes(target)) this.state.seen.push(target);
      if (this.seenBefore && !this.seenBefore.has(target)) break; // первая непрочитанная — стоп на её первой реплике
    }
    this.persist();
    this.render();
    return this.state.sceneId !== fromScene || this.state.lineIndex !== fromLine;
  },

  /* Тап по диалогу: допечатать строку ИЛИ шагнуть дальше. */
  advance() {
    if (this.typing && !this.typing.done) { this.finishTyping(); return; }
    const sc = this.scene();
    if (!sc || !sc.lines) return;
    if (this.state.lineIndex < sc.lines.length - 1) {
      this.state.lineIndex++;
      this.persist();
      this.renderLine();
      return;
    }
    // последняя строка сцены показана — решаем, что дальше
    if (sc.ending) { this.finish(sc); return; }
    if ((sc.choices || []).length) { this.emit('show-choices'); return; }
    const target = this.resolveBranch(sc) || sc.next;
    if (target) this.goTo(target);
  },

  resolveBranch(sc) {
    for (const b of (sc.branch || [])) {
      const cond = b.if || {};
      const val = this.state.stats[cond.stat] || 0;
      if (cond.gte !== undefined && !(val >= cond.gte)) continue;
      if (cond.lte !== undefined && !(val <= cond.lte)) continue;
      if (cond.eq !== undefined && !(val === cond.eq)) continue;
      return b.to;
    }
    return null;
  },

  /* Если сцена открывается сразу на выборах/финале без тапа — UI спросит это. */
  scenePhase() {
    const sc = this.scene();
    if (!sc || !sc.lines) return 'lines';
    const lastLine = this.state.lineIndex >= sc.lines.length - 1;
    if (!lastLine) return 'lines';
    if (sc.ending) return 'ending-ready';
    if ((sc.choices || []).length) return 'choices-ready';
    return 'lines';
  },

  finish(sc) {
    const endingId = this.state.sceneId;
    // Финал эмитится один раз на вход в сцену: повторные тапы/пробелы на уже
    // открытом экране финала не должны заново крутить награды и счётчики заданий.
    if (this._finishedSceneId === endingId) return;
    this._finishedSceneId = endingId;
    const isNewEnding = !this.state.endingsFound.includes(endingId);
    const firstComplete = !this.state.completedBefore && !this.state.completed;
    if (isNewEnding) this.state.endingsFound.push(endingId);
    this.state.completed = true;
    this.persist();

    let reward = 0; const notes = [];
    if (firstComplete) {
      reward += CONFIG.crystals.completeStory;
      notes.push(`История пройдена: +${CONFIG.crystals.completeStory} ◆`);
      // первое прохождение вообще в приложении — засчитываем рефералу
      const anyCompleted = Object.values(Store.data.progress).filter(p => p.completed).length;
      if (anyCompleted === 1) Referrals.onFirstStoryCompleted();
    }
    if (isNewEnding && !firstComplete) {
      reward += CONFIG.crystals.newEnding;
      notes.push(`Новый финал открыт: +${CONFIG.crystals.newEnding} ◆`);
    }
    if (reward) Store.addCrystals(reward, `Финал «${sc.ending.title}»`);
    this.emit('ending', { ending: sc.ending, reward, notes, isNewEnding, firstComplete });
  },

  progressPct() {
    const total = Object.keys(this.story.scenes).length || 1;
    return Math.min(100, Math.round((this.state.visited.length / total) * 100));
  },

  /* ---------- рендер (делегируем в UI через события) ---------- */
  render() {
    this.emit('render-scene');
    this.renderLine();
  },
  renderLine() {
    const ln = this.line();
    if (!ln) return;
    if (!this.state.log.length || this.state.log[this.state.log.length - 1].text !== ln.text
        || this.state.log[this.state.log.length - 1].scene !== this.state.sceneId
        || this.state.log[this.state.log.length - 1].line !== this.state.lineIndex) {
      this.state.log.push({ type: ln.type, who: ln.who || null, text: ln.text, scene: this.state.sceneId, line: this.state.lineIndex });
      if (this.state.log.length > 500) this.state.log = this.state.log.slice(-500);
      this.persist();
      this.emit('line-read'); // реплика показана впервые — для заданий и достижений
    }
    this.emit('render-line', ln);
  },

  /* ---------- печатная машинка ---------- */
  startTyping(el, text) {
    this.stopTyping();
    if (!Store.data.settings.typewriter) { el.textContent = text; this.typing = { done: true, full: text, el }; return; }
    let i = 0;
    el.textContent = '';
    this.typing = { done: false, full: text, el, timer: null };
    const ms = (Store.data.settings && Store.data.settings.typeMs) || CONFIG.text.typewriterMs;
    this.typing.timer = setInterval(() => {
      i += 2; // по 2 символа — плавно и без нагрузки
      el.textContent = text.slice(0, i);
      if (i >= text.length) this.finishTyping();
    }, ms);
  },
  finishTyping() {
    if (!this.typing) return;
    clearInterval(this.typing.timer);
    if (this.typing.el) this.typing.el.textContent = this.typing.full;
    this.typing.done = true;
    this.emit('typing-done');
  },
  stopTyping() { if (this.typing) clearInterval(this.typing.timer); this.typing = null; },
};
