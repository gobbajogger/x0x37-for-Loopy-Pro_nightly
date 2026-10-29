// SPDX-License-Identifier: GPL-3.0-only
// Synthetic device capability/watch only. Existing fixture slot commands remain
// observable by their original assertions; all additional control frames are
// exposed in .frames/.operations and covered by the EC-026 boundary tests.
// Firmware parser/main-loop correctness is tested separately against actual C.
export const SNAPSHOT_INFO = [...new TextEncoder().encode('X0X test'), 0,
  0, 0, 0, 16, 0, 0, 0x58, 0x53, 0x47, 1, 48];
export function withInstallSnapshot(link, updater = null, shared = null) {
  const state = shared || { frames: [], operations: [], token: null, ticket: 0, dirty: false,
    consumed: false, commits: 0, changed() { this.dirty = true; } };
  const send = link.send.bind(link), read = link.read.bind(link), drain = link.drain.bind(link);
  const replies = [];
  link.drain = () => { replies.length = 0; drain(); };
  link.read = async (...args) => replies.length ? replies.shift() : read(...args);
  link.send = frame => {
    state.frames.push(Array.from(frame));
    if (frame[1] !== 0x7D || frame[2] !== 0x46 || frame[3] !== 0x4C) return send(frame);
    const cmd = frame[4], a = frame.slice(5, -1);
    let payload;
    if (cmd === 1) payload = SNAPSHOT_INFO;
    else if (cmd === 48) {
      const op = a[0], token = a.slice(1, 17);
      let ticket = a.slice(17).reduce((n, b, k) => n + b * 2 ** (7 * k), 0), rc = 0;
      state.operations.push(op);
      if (op === 1) {
        if (state.token && token.every((b, k) => state.token[k] === b))
          rc = state.consumed ? 3 : state.dirty ? 4 : 0;
        else { state.token = token; state.ticket++; state.dirty = state.consumed = false; }
        ticket = state.ticket;
      } else if (!state.token || !token.every((b, k) => state.token[k] === b) ||
        ticket !== state.ticket || state.consumed) rc = 3;
      else if (op === 2) state.consumed = true;
      else if (op === 3) {
        rc = state.dirty ? 4 : 0; state.consumed = true;
        if (!rc) state.commits++;
      } else rc = 1;
      payload = [op, rc, ...token, ...Array.from({ length: 4 }, (_, k) => (ticket >>> (7 * k)) & 127)];
    } else {
      if ([11, 12, 13, 14].includes(cmd)) state.changed();
      return send(frame);
    }
    replies.push([0xF0, 0x7D, 0x46, 0x4C, cmd, ...payload, 0xF7]);
    return true;
  };
  if (updater) {
    const install = updater.install.bind(updater);
    updater.install = async (image, product, step, start) => {
      if (start) await start({ link });
      return install(image, product, step);
    };
  }
  return state;
}
