// SPDX-License-Identifier: GPL-3.0-only
const modes = [['levels', 'Levels'], ['pan', 'Pan'], ['sends', 'Sends'], ['fx', 'FX'], ['master', 'Master / More']];

export function renderMixWorkspace({mode = 'levels', parts, master, fx, tape = ''}) {
  if (!modes.some(([key]) => key === mode)) throw Error('Unknown Mix view');

  const buttons = modes.map(([key, label]) =>
    `<button type="button" data-mix-mode="${key}" aria-pressed="${key === mode}">${label}</button>`
  ).join('');
  const navigation = `<nav class="mix-modes" aria-label="Mix controls">${buttons}</nav>`;
  if (mode === 'master') {
    return `${navigation}<section class="mix-master-panel mix-master-destination" data-mix-view="master" aria-label="Master controls">${master}</section>`;
  }
  const controls = mode === 'fx'
    ? `<div class="mix-effects">${fx}<section class="mix-panel mix-fx-sends"><h3>Part sends</h3>${parts}</section>${tape}</div>`
    : `<section class="mix-parts-panel"><h3>Parts</h3>${parts}</section>`;
  return `${navigation}<div class="mix-workspace" data-mix-view="${mode}">${controls}<aside class="mix-master-panel">${master}</aside></div>`;
}
