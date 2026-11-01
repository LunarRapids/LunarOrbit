import * as A from './astro.js';
import { HeroMoon } from './hero-moon.js';
import { OrbitScene } from './orbit.js';
import { drawMiniMoon, setMiniSprite } from './mini-moon.js';

const $ = (id) => document.getElementById(id);

const el = {
  loading: $('loading'),
  stage: $('stage'),
  stageDateText: $('stageDateText'),
  stageWeekday: $('stageWeekday'),
  stageTime: $('stageTime'),
  stageMode: $('stageMode'),
  stageHint: $('stageHint'),
  heroDate: $('heroDate'),
  phaseName: $('phaseName'),
  phaseEn: $('phaseEn'),
  illumPct: $('illumPct'),
  moonAge: $('moonAge'),
  statAngle: $('statAngle'),
  statDist: $('statDist'),
  statRise: $('statRise'),
  statSet: $('statSet'),
  nextEvent: $('nextEvent'),
  labelPhase: $('labelPhase'),
  moonStage: $('moonStage'),
  moonHalo: $('moonHalo'),
  moonRim: $('moonRim'),
  timeline: $('timeline'),
  timelineWrap: document.querySelector('.timeline-wrap'),
  phaseChips: $('phaseChips'),
  btnPlay: $('btnPlay'),
  speed: $('speed'),
  btnToday: $('btnToday'),
  btnToday2: $('btnToday2'),
  btnResetView: $('btnResetView'),
  btnRotate: $('btnRotate'),
  viewSwitch: $('viewSwitch'),
  btnHelp: $('btnHelp'),
  modal: $('modal'),
  btnCloseModal: $('btnCloseModal'),
  toast: $('toast'),
  winControls: $('winControls'),
  btnMin: $('btnMin'),
  btnMax: $('btnMax'),
  btnClose: $('btnClose'),
};

const state = {
  targetDate: new Date(),
  visualPhase: 0,
  playing: false,
  speed: 1,
  autoRotate: true,
  draggingMoon: false,
};

let orbit = null;
let hero = null;
let timelineDays = [];
let timelineStart = null;
let timelineEnd = null;
let timelineBusy = false;
let lastActiveKey = null;
let lastUI = 0;
let lastChip = -1;
let toastTimer = 0;
let eventCache = { key: null, full: null };

const TIMELINE_INITIAL = 45;
const TIMELINE_BATCH = 30;
const dayMs = 86400000;
const dateKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const pad = (n) => String(n).padStart(2, '0');

function fmtMonthDay(date) {
  const p = A.dateParts(date);
  return `${p.month}月${p.day}日`;
}

function toast(html) {
  el.toast.innerHTML = html;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2800);
}

function updatePlayUI() {
  el.btnPlay.classList.toggle('playing', state.playing);
  el.btnPlay.setAttribute('aria-label', state.playing ? '暂停' : '播放');
}

function setPlaying(playing) {
  state.playing = playing;
  updatePlayUI();
}

/* ---------------- 初始化 ---------------- */

async function init() {
  state.visualPhase = A.phaseAngle(A.toJD(state.targetDate));

  orbit = new OrbitScene($('orbitCanvas'));
  hero = new HeroMoon($('moonCanvas'));

  try {
    await Promise.all([orbit.init(), hero.init()]);
  } catch (err) {
    console.error(err);
    el.loading.querySelector('.loading-title').textContent = '无法初始化 3D 场景';
    el.loading.querySelector('.loading-sub').textContent = '请确认显卡驱动与 WebView2 运行库正常';
    return;
  }

  hero.setPhase(state.visualPhase);
  orbit.setPhase(state.visualPhase);

  await setMiniSprite(hero.spriteURL);
  buildTimeline();
  updateUI(true);
  updatePlayUI();

  const ro = new ResizeObserver(() => orbit.resize());
  ro.observe(el.stage);
  window.addEventListener('resize', () => orbit.resize());

  bindUI();
  startLoop();

  setTimeout(() => {
    el.loading.classList.add('hide');
    setTimeout(() => el.loading.remove(), 800);
    el.stageHint.classList.add('show');
    setTimeout(() => el.stageHint.classList.remove('show'), 7000);
  }, 260);
}

/* ---------------- 月相日历（可持续延伸） ---------------- */

function createDay(date) {
  const info = A.phaseInfo(A.toJD(date));
  const key = dateKey(date);
  const p = A.dateParts(date);
  const btn = document.createElement('button');
  btn.className = 'day';
  btn.type = 'button';
  btn.dataset.key = key;
  btn.dataset.time = String(date.getTime());
  btn.innerHTML = `
    <span class="dow">${p.weekday}</span>
    <span class="date">${p.month}/${p.day}</span>
    <canvas width="74" height="74"></canvas>
    <span class="pct">${Math.round(info.illum * 100)}%</span>`;
  btn.title = `${p.month}月${p.day}日 · ${info.cn} · 照亮 ${Math.round(info.illum * 100)}%`;
  drawMiniMoon(btn.querySelector('canvas'), info.angle, 74);
  btn.addEventListener('click', () => {
    jumpToDate(new Date(date));
    toast(`已跳转到 <b>${p.month}月${p.day}日</b> · ${info.cn}`);
  });
  if (key === dateKey(state.targetDate)) btn.classList.add('active');
  return { el: btn, date: new Date(date), info, key };
}

function buildTimeline() {
  const start = new Date();
  const frag = document.createDocumentFragment();
  const items = [];

  for (let i = 0; i < TIMELINE_INITIAL; i++) {
    const item = createDay(new Date(start.getTime() + i * dayMs));
    items.push(item);
    frag.appendChild(item.el);
  }

  el.timeline.appendChild(frag);
  timelineDays = items;
  timelineStart = new Date(items[0].date);
  timelineEnd = new Date(items[items.length - 1].date);
}

function appendDays(count) {
  if (!timelineEnd || timelineBusy) return;
  timelineBusy = true;
  const frag = document.createDocumentFragment();
  const items = [];
  for (let i = 1; i <= count; i++) {
    const item = createDay(new Date(timelineEnd.getTime() + i * dayMs));
    items.push(item);
    frag.appendChild(item.el);
  }
  el.timeline.appendChild(frag);
  timelineDays.push(...items);
  timelineEnd = new Date(items[items.length - 1].date);
  timelineBusy = false;
}

function prependDays(count) {
  if (!timelineStart || timelineBusy) return;
  timelineBusy = true;
  const frag = document.createDocumentFragment();
  const items = [];
  for (let i = count; i >= 1; i--) {
    const item = createDay(new Date(timelineStart.getTime() - i * dayMs));
    items.push(item);
    frag.appendChild(item.el);
  }

  const wrap = el.timelineWrap;
  const before = wrap.scrollWidth;
  el.timeline.prepend(frag);
  const after = wrap.scrollWidth;
  // 保持当前看到的日期不跳动
  wrap.scrollLeft += after - before;

  timelineDays.unshift(...items);
  timelineStart = new Date(items[0].date);
  timelineBusy = false;
}

/** 确保当前日期已经存在于日历中，不够就向两侧追加。 */
function ensureDateLoaded(date) {
  if (!timelineStart || !timelineEnd) return;
  const target = A.startOfLocalDay(date).getTime();
  let guard = 0;
  while (target < A.startOfLocalDay(timelineStart).getTime() && guard++ < 24) {
    prependDays(TIMELINE_BATCH);
  }
  guard = 0;
  while (target > A.startOfLocalDay(timelineEnd).getTime() && guard++ < 24) {
    appendDays(TIMELINE_BATCH);
  }
}

function updateTimelineSelection(forceScroll = false) {
  const key = dateKey(state.targetDate);
  if (key !== lastActiveKey) {
    lastActiveKey = key;
    for (const item of timelineDays) {
      item.el.classList.toggle('active', item.key === key);
    }
  }
  if (forceScroll) revealActiveDay();
}

function revealActiveDay() {
  const active = el.timeline.querySelector('.day.active');
  if (active) {
    active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
}

/* ---------------- 数据更新 ---------------- */

function jumpToDate(date, { pause = true } = {}) {
  state.targetDate = new Date(date);
  if (pause) setPlaying(false);
  ensureDateLoaded(state.targetDate);
  updateUI(true);
  revealActiveDay();
}

function setToday() {
  state.targetDate = new Date();
  setPlaying(false);
  ensureDateLoaded(state.targetDate);
  updateUI(true);
  revealActiveDay();
  toast('已回到 <b>今天</b>');
}

function getNextFull(date) {
  const jd = A.toJD(date);
  const key = Math.floor(jd * 2);
  if (eventCache.key !== key) {
    eventCache.key = key;
    eventCache.full = A.fromJD(A.findNextPhase(jd, 180));
  }
  return eventCache.full;
}

function updateUI(force = false) {
  const now = performance.now();
  if (!force && now - lastUI < 80) return;
  lastUI = now;

  ensureDateLoaded(state.targetDate);

  const visual = state.visualPhase;
  const targetJD = A.toJD(state.targetDate);
  const targetAngle = A.phaseAngle(targetJD);
  const illum = A.illumination(visual);
  const phase = A.PHASES[A.phaseIndexFromAngle(visual)];
  const targetPhase = A.PHASES[A.phaseIndexFromAngle(targetAngle)];
  const parts = A.dateParts(state.targetDate);

  el.heroDate.textContent = `${parts.month}月${parts.day}日 · ${parts.weekday}`;
  el.stageDateText.textContent = `${parts.month}月${parts.day}日`;
  el.stageWeekday.textContent = parts.weekday;
  el.stageTime.textContent = `${pad(state.targetDate.getHours())}:${pad(state.targetDate.getMinutes())}`;
  const isToday = A.sameLocalDay(state.targetDate, new Date());
  el.stageMode.textContent = state.playing ? '模拟中' : isToday ? '实时' : '已暂停';
  el.stage.classList.toggle('paused', !state.playing && !isToday);

  el.phaseName.textContent = phase.cn;
  el.phaseEn.textContent = phase.en;
  el.illumPct.textContent = String(Math.round(illum * 100));
  el.moonAge.textContent = ((visual / 360) * A.SYNODIC_MONTH).toFixed(1);
  el.labelPhase.textContent = phase.cn;

  el.statAngle.textContent = String(Math.round(visual));
  el.statDist.textContent = (A.moonDistance(targetJD) / 10000).toFixed(1);
  const rs = A.riseSetHours(targetAngle);
  el.statRise.textContent = A.formatHours(rs.rise);
  el.statSet.textContent = A.formatHours(rs.set);

  const full = getNextFull(state.targetDate);
  const days = (full.getTime() - state.targetDate.getTime()) / dayMs;
  const fd = A.dateParts(full);
  el.nextEvent.textContent =
    days < 0.5 ? `今晚 · ${fd.month}月${fd.day}日` : `${fd.month}月${fd.day}日 · ${Math.max(1, Math.round(days))} 天后`;

  el.moonHalo.style.filter = `blur(20px) brightness(${(0.55 + illum * 0.9).toFixed(2)})`;
  el.moonRim.style.opacity = String(0.25 + illum * 0.75);

  const chipIndex = A.phaseIndexFromAngle(targetAngle);
  if (chipIndex !== lastChip) {
    lastChip = chipIndex;
    [...el.phaseChips.children].forEach((b, i) => b.classList.toggle('active', i === chipIndex));
  }

  updateTimelineSelection();
}

/* ---------------- 主循环 ---------------- */

let lastFrame = 0;

function startLoop() {
  lastFrame = performance.now();
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.06, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  if (state.playing && !state.draggingMoon) {
    state.targetDate = new Date(state.targetDate.getTime() + dt * state.speed * dayMs);
  }

  const targetAngle = A.phaseAngle(A.toJD(state.targetDate));
  if (!state.draggingMoon) {
    const delta = ((targetAngle - state.visualPhase + 540) % 360) - 180;
    const k = 1 - Math.exp(-dt * (state.playing ? 7 : 4.6));
    state.visualPhase = (state.visualPhase + delta * k + 360) % 360;
  }

  orbit.setPhase(state.visualPhase);
  orbit.update(dt);

  hero.setPhase(state.visualPhase);
  hero.render(dt);

  updateUI();
  requestAnimationFrame(frame);
}

/* ---------------- 交互 ---------------- */

function bindUI() {
  el.btnPlay.addEventListener('click', () => {
    setPlaying(!state.playing);
    if (state.playing) toast(`开始演示 · <b>${state.speed} 天 / 秒</b>`);
  });

  el.speed.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-speed]');
    if (!btn) return;
    state.speed = Number(btn.dataset.speed);
    [...el.speed.children].forEach((b) => b.classList.toggle('active', b === btn));
    toast(`演示速度 <b>${state.speed}×</b>（${state.speed} 天 / 秒）`);
  });

  el.btnToday.addEventListener('click', setToday);
  el.btnToday2.addEventListener('click', setToday);

  el.btnResetView.addEventListener('click', () => {
    orbit.resetView();
    toast('视角已复位');
  });

  el.btnRotate.addEventListener('click', () => {
    state.autoRotate = !state.autoRotate;
    orbit.setAutoRotate(state.autoRotate);
    el.btnRotate.setAttribute('aria-pressed', String(state.autoRotate));
    toast(state.autoRotate ? '自动旋转已开启' : '自动旋转已关闭');
  });

  el.viewSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    [...el.viewSwitch.children].forEach((b) => b.classList.toggle('active', b === btn));
    orbit.setView(btn.dataset.view);
  });

  el.phaseChips.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-phase]');
    if (!btn) return;
    const angle = Number(btn.dataset.phase);
    const target = A.nextPhaseDate(state.targetDate, angle);
    const phase = A.PHASES[A.phaseIndexFromAngle(angle)];
    state.targetDate = target;
    setPlaying(false);
    ensureDateLoaded(target);
    updateUI(true);
    revealActiveDay();
    toast(`下一次<b>${phase.cn}</b> · ${fmtMonthDay(target)}`);
  });

  el.timelineWrap.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.timelineWrap.scrollLeft += e.deltaY;
    },
    { passive: false }
  );

  let scrollTick = 0;
  el.timelineWrap.addEventListener(
    'scroll',
    () => {
      if (scrollTick) return;
      scrollTick = requestAnimationFrame(() => {
        scrollTick = 0;
        if (timelineBusy) return;
        const wrap = el.timelineWrap;
        if (wrap.scrollLeft + wrap.clientWidth > wrap.scrollWidth - 520) {
          appendDays(TIMELINE_BATCH);
        } else if (wrap.scrollLeft < 360) {
          prependDays(TIMELINE_BATCH);
        }
      });
    },
    { passive: true }
  );

  bindMoonDrag();
  bindModal();
  bindKeyboard();
  bindWindowAPI();

  $('orbitCanvas').addEventListener('mouseenter', () => {
    document.body.style.cursor = '';
  });
}

function bindMoonDrag() {
  let drag = null;

  el.moonStage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = {
      x: e.clientX,
      date: new Date(state.targetDate),
      wasPlaying: state.playing,
      moved: false,
    };
    state.draggingMoon = true;
    setPlaying(false);
    el.moonStage.classList.add('dragging');
    el.moonStage.setPointerCapture(e.pointerId);
  });

  el.moonStage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    if (!drag.moved) return;
    const days = (dx / el.moonStage.clientWidth) * 18;
    state.targetDate = new Date(drag.date.getTime() + days * dayMs);
    state.visualPhase = A.phaseAngle(A.toJD(state.targetDate));
    updateUI(true);
  });

  const end = (e) => {
    if (!drag) return;
    const moved = drag.moved;
    const wasPlaying = drag.wasPlaying;
    drag = null;
    state.draggingMoon = false;
    el.moonStage.classList.remove('dragging');
    try {
      el.moonStage.releasePointerCapture(e.pointerId);
    } catch (_) {}
    if (!moved) {
      setPlaying(wasPlaying);
    } else {
      const p = A.dateParts(state.targetDate);
      revealActiveDay();
      toast(`已浏览到 <b>${p.month}月${p.day}日</b> · ${A.phaseInfo(A.toJD(state.targetDate)).cn}`);
    }
  };

  el.moonStage.addEventListener('pointerup', end);
  el.moonStage.addEventListener('pointercancel', end);
}

function bindModal() {
  const open = () => {
    el.modal.classList.add('open');
    el.modal.setAttribute('aria-hidden', 'false');
  };
  const close = () => {
    el.modal.classList.remove('open');
    el.modal.setAttribute('aria-hidden', 'true');
  };
  el.btnHelp.addEventListener('click', open);
  el.btnCloseModal.addEventListener('click', close);
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.modal.classList.contains('open')) close();
  });
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (el.modal.classList.contains('open')) return;
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setPlaying(!state.playing);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setPlaying(false);
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      state.targetDate = new Date(state.targetDate.getTime() + delta * dayMs);
      ensureDateLoaded(state.targetDate);
      updateUI(true);
      revealActiveDay();
    } else if (e.key === 'r' || e.key === 'R') {
      orbit.resetView();
    } else if (e.key === '?' || e.key === 'h' || e.key === 'H') {
      el.btnHelp.click();
    }
  });
}

function bindWindowAPI() {
  const api = window.pywebview && window.pywebview.api;
  if (!api) return;
  document.body.classList.add('webview');
  el.btnMin.addEventListener('click', () => api.minimize());
  el.btnMax.addEventListener('click', () => api.toggle_maximize());
  el.btnClose.addEventListener('click', () => api.close());
  document.querySelector('.titlebar-drag').addEventListener('dblclick', () => api.toggle_maximize());
}

window.addEventListener('pywebviewready', bindWindowAPI);

init();
