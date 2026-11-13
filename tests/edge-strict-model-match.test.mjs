// SPDX-License-Identifier: GPL-3.0-only
// Strict model match ported from X0X37-for-Loopy-Pro #806 (62cf11e98): write only when the
// package model equals the reported model; no family/alias match; FM-1 is never flashed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameKeyboard } from "../web/fm1ota.js";

const page = readFileSync(new URL("../docs/install/index.html", import.meta.url), "utf8");

test("exact model only, ota- prefix and case ignored", () => {
  assert.equal(sameKeyboard("SMK-37 Elite", "SMK-37 Elite"), true);
  assert.equal(sameKeyboard("ota-SMK-37 Pro", "smk-37 pro"), true);
  assert.equal(sameKeyboard("SMK-37 Elite", "SMK-37 Pro"), false);
  assert.equal(sameKeyboard("ota-SMK-37 Pro", "SMK-37 Elite"), false);
  assert.equal(sameKeyboard("MKE-P37", "SMK-37 Pro"), false);
  assert.equal(sameKeyboard("STARRYKEY-37 PLAY", "SMK-37 Pro"), false);
  assert.equal(sameKeyboard("", ""), false);
});

test("FM-1 is never flashed", () => {
  assert.equal(sameKeyboard("FM-1", "FM-1"), false);
  assert.equal(sameKeyboard("ota-FM-1", "FM-1"), false);
  assert.equal(sameKeyboard("FM-1", "SMK-37 Pro"), false);
});

test("the served install page inlines the same strict rule and gates every write with it", () => {
  assert.match(page, /return name === "fm-1" \? null : name;/);
  assert.doesNotMatch(page, /starrykey-37 play" \|\| name === "starrykey-37" \? "smk-37 pro"/);
  assert.match(page, /if \(!sameKeyboard\(dev\.id\.model, model\)\) \{ dev\.link\.close\(\); throw fail\("model"/);
  assert.match(page, /if \(!product \|\| !sameKeyboard\(ota\.id\.model\.replace\(\/\^ota-\/i, ""\), product\.split\("_"\)\[0\]\)\)/);
});
