/**
 * astro.js — 低精度月相天文计算
 *
 * 采用 Meeus《Astronomical Algorithms》第 47 章的简化公式：
 * 太阳黄经、月球黄经、地月距离。误差约 0.1°（相位）与 ~100 km（距离），
 * 对月相演示而言足够精确。
 */

export const SYNODIC_MONTH = 29.530588853;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const PHASES = [
  { key: 'new', cn: '新月', en: 'New Moon', angle: 0 },
  { key: 'waxingCrescent', cn: '娥眉月', en: 'Waxing Crescent', angle: 45 },
  { key: 'firstQuarter', cn: '上弦月', en: 'First Quarter', angle: 90 },
  { key: 'waxingGibbous', cn: '盈凸月', en: 'Waxing Gibbous', angle: 135 },
  { key: 'full', cn: '满月', en: 'Full Moon', angle: 180 },
  { key: 'waningGibbous', cn: '亏凸月', en: 'Waning Gibbous', angle: 225 },
  { key: 'lastQuarter', cn: '下弦月', en: 'Last Quarter', angle: 270 },
  { key: 'waningCrescent', cn: '残月', en: 'Waning Crescent', angle: 315 },
];

const norm360 = (x) => {
  x %= 360;
  return x < 0 ? x + 360 : x;
};

export function toJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function fromJD(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

function centuries(jd) {
  return (jd - 2451545.0) / 36525;
}

export function sunLongitude(jd) {
  const t = centuries(jd);
  const L0 = norm360(280.46646 + 36000.76983 * t + 0.0003032 * t * t);
  const M = norm360(357.52911 + 35999.05029 * t - 0.0001537 * t * t) * RAD;
  const C =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(M) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  return norm360(L0 + C);
}

export function moonLongitude(jd) {
  const t = centuries(jd);
  const Lp = norm360(218.3164477 + 481267.88123421 * t - 0.0015786 * t * t);
  const D = norm360(297.8501921 + 445267.1114034 * t - 0.0018819 * t * t);
  const M = norm360(357.5291092 + 35999.0502909 * t - 0.0001536 * t * t);
  const Mp = norm360(134.9633964 + 477198.8675055 * t + 0.0087414 * t * t);
  const F = norm360(93.272095 + 483202.0175233 * t - 0.0036539 * t * t);
  const d = D * RAD;
  const m = M * RAD;
  const mp = Mp * RAD;
  const f = F * RAD;
  return norm360(
    Lp +
      6.289 * Math.sin(mp) +
      1.274 * Math.sin(2 * d - mp) +
      0.658 * Math.sin(2 * d) +
      0.214 * Math.sin(2 * mp) -
      0.186 * Math.sin(m) -
      0.114 * Math.sin(2 * f) +
      0.059 * Math.sin(2 * d - 2 * mp) +
      0.057 * Math.sin(2 * d - m - mp) +
      0.053 * Math.sin(2 * d + mp) +
      0.046 * Math.sin(2 * d - m) +
      0.041 * Math.sin(mp - m) -
      0.035 * Math.sin(d) -
      0.031 * Math.sin(mp + m) -
      0.015 * Math.sin(2 * f - 2 * d) +
      0.011 * Math.sin(mp - 4 * d)
  );
}

/** 月相角（日月黄经差）：0° 新月，90° 上弦，180° 满月，270° 下弦 */
export function phaseAngle(jd) {
  return norm360(moonLongitude(jd) - sunLongitude(jd));
}

/** 地月距离（km） */
export function moonDistance(jd) {
  const t = centuries(jd);
  const D = norm360(297.8501921 + 445267.1114034 * t - 0.0018819 * t * t) * RAD;
  const M = norm360(357.5291092 + 35999.0502909 * t - 0.0001536 * t * t) * RAD;
  const Mp = norm360(134.9633964 + 477198.8675055 * t + 0.0087414 * t * t) * RAD;
  return (
    385000.56 -
    20905.355 * Math.cos(Mp) -
    3699.111 * Math.cos(2 * D - Mp) -
    2955.968 * Math.cos(2 * D) -
    569.925 * Math.cos(2 * Mp) +
    48.888 * Math.cos(M) +
    0.0
  );
}

/** 被照亮的比例 0–1 */
export function illumination(angle) {
  return (1 - Math.cos(angle * RAD)) / 2;
}

export function phaseIndexFromAngle(angle) {
  const a = norm360(angle);
  return Math.round(a / 45) % 8;
}

export function phaseInfo(jd) {
  const angle = phaseAngle(jd);
  const info = PHASES[phaseIndexFromAngle(angle)];
  const illum = illumination(angle);
  return {
    jd,
    angle,
    illum,
    age: (angle / 360) * SYNODIC_MONTH,
    distance: moonDistance(jd),
    ...info,
  };
}

/**
 * 从 jd 开始，寻找下一次相位角等于 target 的时刻（JD）。
 * 以 0.2 天步长扫描后用二分法收敛，最多向前 45 天。
 */
export function findNextPhase(jd, target, maxDays = 45) {
  const delta = (x) => {
    let d = norm360(phaseAngle(x) - target);
    if (d > 180) d -= 360;
    return d;
  };
  const step = 0.2;
  let prev = delta(jd);
  for (let t = jd + step; t <= jd + maxDays; t += step) {
    const cur = delta(t);
    if (prev < 0 && cur >= 0) {
      let lo = t - step;
      let hi = t;
      for (let i = 0; i < 42; i++) {
        const mid = (lo + hi) / 2;
        if (delta(mid) < 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prev = cur;
  }
  return jd + maxDays;
}

export function nextPhaseDate(date, target) {
  return fromJD(findNextPhase(toJD(date), target));
}

/** 按相位粗略估算月出 / 月落（地方时，小时） */
export function riseSetHours(angle) {
  const transit = (12 + (norm360(angle) / 360) * 24) % 24;
  return {
    rise: (transit - 6 + 24) % 24,
    set: (transit + 6) % 24,
  };
}

export function formatHours(h) {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatNumber(n, digits = 0) {
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 当地日期字符串 */
export function dateParts(date) {
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: week[date.getDay()],
    monthDay: `${date.getMonth() + 1}月${date.getDate()}日`,
  };
}

export function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(a, b) {
  return (b.getTime() - a.getTime()) / 86400000;
}

/** 下一次满月 / 新月，用于展示倒计时 */
export function nextEvents(date) {
  const jd = toJD(date);
  const full = fromJD(findNextPhase(jd, 180));
  const nextNew = fromJD(findNextPhase(jd, 0));
  return { full, newMoon: nextNew };
}

export { DEG, RAD, norm360 };
