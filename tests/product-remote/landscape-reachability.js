// SPDX-License-Identifier: GPL-3.0-only
() => {
  const documentBox = document.documentElement;
  const scope = document.querySelector('#connection-result:not([hidden])')
    || document.querySelector('dialog[open]') || document;
  function visible(element) {
    const box = element.getBoundingClientRect();
    return box.width > 1 && box.height > 1
      && element.checkVisibility({visibilityProperty: true, opacityProperty: true})
      && !element.closest('[hidden], [inert]')
      && (!element.closest('details:not([open])') || element.matches('summary'));
  }

  const selector = 'button, a[href], select, input:not([type=hidden]), summary, [role=slider]';
  const controls = [...scope.querySelectorAll(selector)]
    .filter(control => visible(control) && !control.matches(':disabled, [aria-disabled=true]'));
  const state = {
    viewport: [innerWidth, innerHeight],
    body: [documentBox.clientWidth, documentBox.scrollWidth, documentBox.scrollHeight],
    titles: [...scope.querySelectorAll('h1,h2,h3')].filter(visible).map(title => title.textContent.trim()),
    controlCount: controls.length, reachable: 0, blocked: [], nestedScroll: [], horizontalClips: [],
  };
  const roll = document.querySelector('#roll-scroll');
  if (roll && visible(roll)) {
    const row = parseFloat(getComputedStyle(documentBox).getPropertyValue('--row'));
    const viewport = roll.getBoundingClientRect();
    const labels = [...document.querySelectorAll('#pitch-rail .pitch')].map(pitch => {
      const text = document.createRange();
      text.selectNodeContents(pitch);
      return {label: pitch.textContent, box: pitch.getBoundingClientRect(), ink: text.getBoundingClientRect()};
    });
    const complete = labels.filter(pitch => pitch.box.top >= viewport.top && pitch.box.bottom <= viewport.bottom);
    const clipped = labels.filter(({ink}) => ink.bottom > viewport.top && ink.top < viewport.bottom &&
      (ink.top < viewport.top - 0.5 || ink.bottom > viewport.bottom + 0.5));
    state.roll = {
      completeRows: complete.length, clippedLabels: clipped.map(pitch => pitch.label),
      row, paneHeight: roll.clientHeight, firstRow: Math.ceil(roll.scrollTop / row),
      lastRow: Math.floor((roll.scrollTop + roll.clientHeight) / row) - 1,
    };
  }

  function ownsPoint(control, hit, x) {
    if (!hit) return false;
    if (control.contains(hit) || hit.closest('label')?.control === control) return true;
    // The Motion overlay delegates touches to a specific one of sixteen lanes.
    if (!control.hasAttribute('data-motion-step') || hit.id !== 'motion-grid') return false;
    const grid = hit.getBoundingClientRect();
    const step = Math.floor((x - grid.left) / grid.width * 16);
    return step === Number(control.dataset.motionStep);
  }

  const scrollPositions = [...document.querySelectorAll('*')]
    .filter(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
    .map(el => [el, el.scrollTop, el.scrollLeft]);
  for (const control of controls) {
    if (control.matches('a.skip')) control.focus();
    control.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
    const box = control.getBoundingClientRect();
    const fractions = [0.5, 0.15, 0.85];
    const reachable = fractions.some(fx => fractions.some(fy => {
      const x = box.left + fx * box.width;
      const y = box.top + fy * box.height;
      return ownsPoint(control, document.elementFromPoint(x, y), x);
    }));
    if (reachable) {
      state.reachable++;
    } else {
      state.blocked.push({
        label: control.getAttribute('aria-label') || control.textContent.trim().slice(0, 72) || control.id,
        tag: control.tagName, id: control.id, rect: box.toJSON(), outer: control.outerHTML.slice(0, 300),
      });
    }
  }
  for (const [element, top, left] of scrollPositions) {
    element.scrollTop = top;
    element.scrollLeft = left;
  }
  for (const element of document.querySelectorAll('main, section, dialog, table, nav, div, fieldset')) {
    if (!visible(element) || element.clientWidth < 8 || element.scrollWidth <= element.clientWidth + 2) continue;
    const overflow = getComputedStyle(element).overflowX;
    const item = {
      tag: element.tagName, id: element.id, cls: element.className,
      client: element.clientWidth, scroll: element.scrollWidth,
    };
    if (overflow === 'auto' || overflow === 'scroll') state.nestedScroll.push(item);
    if (['hidden', 'clip'].includes(overflow) && element.matches('main, section, dialog, fieldset')) {
      state.horizontalClips.push(item);
    }
  }
  return state;
}
