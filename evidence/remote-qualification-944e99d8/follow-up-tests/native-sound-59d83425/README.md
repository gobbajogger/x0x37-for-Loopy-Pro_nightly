# Native Sound browser verification

Product commit `59d8342569d494dc587cafde456ed71b5130978d`. The standard build checker verified all 303 shipped assets before each attempt. The test used the published WASM and AudioWorklet through Chromium. It did not operate physical hardware.

| Run | Viewport | Exit | Result |
| --- | --- | ---: | --- |
| unfiltered original | all three | 1 | 1440x900 passed, 390x844 failed, 844x390 unreached |
| instrumented diagnostic | 390x844 | 1 | Page.wait_for_function: Timeout 30000ms exceeded. |
| instrumented diagnostic | 844x390 | 1 | Locator.evaluate: Timeout 30000ms exceeded. |
| final unmodified single-size | 390x844 | 0 | passed |
| final unmodified single-size | 844x390 | 0 | passed |

The full invocation stopped on its first failed viewport. Each final single-size run executes the same viewport case with its original Playwright actions and deadlines. The separate diagnostic runs instrumented the Undo selector and are recorded independently.

Each passing proof records 40 scalar controls, parameter 17 at both ends for both voices, 17 native edits, 16 native Undo operations, unchanged Draft export bytes after Undo and Redo in both slots, and zero Web MIDI calls. Raw screenshots, requests and proof data are stored under the corresponding run.

To reproduce, build this commit with the pinned provider, set the same provider and Playwright environment variables, and invoke `python3 tests/product-remote/native-sound-browser.py` from its root. The included `run.py` reuses a byte-checked product build. `final-size.py` selects a single published case. The provider identities and duration of each recorded run appear in `summary.json`.

[Complete outcomes](summary.json) · [All five run records and captured states](59d83425-native-sound-browser.zip)
