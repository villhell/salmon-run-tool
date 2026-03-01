
const SHIFT_TYPE_LABELS = {
  'regular': '通常バイト',
  'bigrun': 'ビッグラン',
  'eggstra': 'バイトチームコンテスト',
};

const LOCAL_DATA_URL = 'data/schedules.json';
const REMOTE_DATA_URL = 'https://splatoon3.ink/data/schedules.json';
const LOCALE_URL = 'https://splatoon3.ink/data/locale/ja-JP.json';

let countdownInterval = null;

async function fetchSchedules() {
  try {
    const res = await fetch(LOCAL_DATA_URL);
    if (!res.ok) throw new Error('local fetch failed');
    const data = await res.json();
    if (!data || Object.keys(data).length === 0) throw new Error('empty local data');
    return data;
  } catch {
    const res = await fetch(REMOTE_DATA_URL);
    if (!res.ok) throw new Error('remote fetch failed');
    return res.json();
  }
}

async function fetchLocale() {
  try {
    const res = await fetch(LOCALE_URL);
    if (!res.ok) throw new Error('locale fetch failed');
    return res.json();
  } catch {
    return null;
  }
}

function buildLocaleLookup(locale) {
  if (!locale) return { stage: () => null, weapon: () => null, boss: () => null };
  return {
    stage: (id) => locale.stages?.[id]?.name ?? null,
    weapon: (id) => locale.weapons?.[id]?.name ?? null,
    boss: (id) => locale.bosses?.[id]?.name ?? null,
  };
}

function parseSchedules(data) {
  const coop = data?.data?.coopGroupingSchedule;
  if (!coop) return [];

  const regular = (coop.regularSchedules?.nodes ?? []).map(n => ({ ...n, type: 'regular' }));
  const bigrun = (coop.bigRunSchedules?.nodes ?? []).map(n => ({ ...n, type: 'bigrun' }));
  const eggstra = (coop.teamContestSchedules?.nodes ?? []).map(n => ({ ...n, type: 'eggstra' }));

  return [...regular, ...bigrun, ...eggstra].sort(
    (a, b) => new Date(a.startTime) - new Date(b.startTime)
  );
}

function formatLocalTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildShiftCard(shift, isCurrent, locale) {
  const setting = shift.setting;
  const stageId = setting?.coopStage?.id;
  const stageName = (stageId && locale.stage(stageId)) ?? setting?.coopStage?.name ?? '不明';
  const weapons = setting?.weapons ?? [];
  const bossId = setting?.boss?.id;
  const bossJa = bossId ? locale.boss(bossId) ?? setting?.boss?.name : null;
  const typeLabel = SHIFT_TYPE_LABELS[shift.type] ?? shift.type;

  const card = document.createElement('article');
  card.className = `shift-card shift-type-${shift.type}${isCurrent ? ' current' : ''}`;
  card.dataset.endTime = shift.endTime;

  const badgeHtml = `<span class="shift-badge badge-${shift.type}">${typeLabel}</span>`;
  const bossHtml = bossJa
    ? `<p class="boss-notice">👑 オカシラ予告: <strong>${bossJa}</strong></p>`
    : '';
  const weaponsHtml = weapons.length
    ? `<ul class="weapons">${weapons.map(w => {
        const weaponId = w?.['__splatoon3ink_id'];
        const name = (weaponId && locale.weapon(weaponId)) ?? w?.name ?? '?';
        const imgUrl = w?.image?.url;
        return imgUrl
          ? `<li><img src="${imgUrl}" alt="${name}" title="${name}" class="weapon-img"></li>`
          : `<li class="weapon-name">${name}</li>`;
      }).join('')}</ul>`
    : '';
  const countdownHtml = isCurrent
    ? `<p class="countdown">残り時間: <span class="countdown-value" data-end="${shift.endTime}">--:--:--</span></p>`
    : `<p class="start-time">開始: ${formatLocalTime(shift.startTime)}</p>`;

  card.innerHTML = `
    <div class="card-header">
      ${badgeHtml}
      <span class="time-range">${formatLocalTime(shift.startTime)} 〜 ${formatLocalTime(shift.endTime)}</span>
    </div>
    <h3 class="stage-name">${stageName}</h3>
    ${weaponsHtml}
    ${bossHtml}
    ${countdownHtml}
  `;

  return card;
}

function updateCountdowns() {
  const now = Date.now();
  document.querySelectorAll('.countdown-value').forEach(el => {
    const end = new Date(el.dataset.end).getTime();
    el.textContent = formatCountdown(end - now);
  });
}

function render(schedules, locale) {
  const now = new Date();
  const currentContainer = document.getElementById('current-shift-content');
  const upcomingContainer = document.getElementById('upcoming-shifts-content');

  currentContainer.innerHTML = '';
  upcomingContainer.innerHTML = '';

  let hasCurrentShift = false;

  for (const shift of schedules) {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);

    if (start <= now && now < end) {
      currentContainer.appendChild(buildShiftCard(shift, true, locale));
      hasCurrentShift = true;
    } else if (start > now) {
      upcomingContainer.appendChild(buildShiftCard(shift, false, locale));
    }
  }

  if (!hasCurrentShift) {
    currentContainer.innerHTML = '<p class="no-shift">現在進行中のシフトはありません。</p>';
  }

  if (upcomingContainer.children.length === 0) {
    upcomingContainer.innerHTML = '<p class="no-shift">今後のシフト情報がありません。</p>';
  }

  if (countdownInterval) clearInterval(countdownInterval);
  updateCountdowns();
  countdownInterval = setInterval(updateCountdowns, 1000);
}

async function main() {
  try {
    const [data, localeData] = await Promise.all([fetchSchedules(), fetchLocale()]);
    const locale = buildLocaleLookup(localeData);

    const lastUpdatedEl = document.getElementById('last-updated');
    lastUpdatedEl.textContent = `最終更新: ${new Date().toLocaleString('ja-JP')}`;

    const schedules = parseSchedules(data);
    render(schedules, locale);
  } catch (err) {
    console.error('スケジュールの取得に失敗しました:', err);
    document.getElementById('current-shift-content').innerHTML =
      '<p class="error">データの取得に失敗しました。しばらくしてから再度お試しください。</p>';
  }
}

main();
