// SPDX-License-Identifier: GPL-3.0-only
// Edits one row of the local sixteen-step grid. The preview never mutates the Draft.
export class StepValueGesture {
  constructor({read, commit, paint, fromPosition, nudged, enabled = () => true}) {
    Object.assign(this, {read, commit, paint, fromPosition, nudged, enabled});
    this.gesture = null;
    this.pointers = new Set();
  }
  get values() { return this.gesture?.values ?? this.read() ?? Array(16).fill(null); }
  begin(owner, group) {
    this.pointers.add(owner);
    if (this.pointers.size !== 1) {
      this.gesture = null;
      this.paint();
      return false;
    }
    if (group && !this.enabled(group.step)) {
      this.pointers.delete(owner);
      return false;
    }
    this.gesture = {owner, values: [...this.values], last: null};
    return true;
  }
  preview(owner, position, step) {
    const g = this.gesture;
    if (!g || g.owner !== owner || !Number.isInteger(step) || step < 0 || step >= 16 || !Number.isFinite(position)) return;
    const from = g.last ?? {position, step};
    const distance = Math.abs(step - from.step), direction = Math.sign(step - from.step);
    for (let i = 0; i <= distance; i++) {
      const at = from.step + direction * i;
      if (!this.enabled(at)) continue;
      const p = distance ? from.position + (position - from.position) * i / distance : position;
      g.values[at] = this.fromPosition(p);
    }
    g.last = {position, step};
    this.paint();
  }
  end(owner) {
    this.pointers.delete(owner);
    if (this.gesture?.owner !== owner) return;
    const {values} = this.gesture;
    this.gesture = null;
    this.commit(values);
    this.paint();
  }
  nudge(group, kind, direction) {
    this.cancel();
    if (!this.enabled(group.step)) return;
    const values = [...this.values];
    values[group.step] = this.nudged(values[group.step], direction);
    this.commit(values);
    this.paint();
  }
  cancel() {
    this.pointers.clear();
    if (this.gesture) { this.gesture = null; this.paint(); }
  }
  cancelPointer(owner) {
    this.pointers.delete(owner);
    if (this.gesture?.owner === owner) { this.gesture = null; this.paint(); }
  }
}
