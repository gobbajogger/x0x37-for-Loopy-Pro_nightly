# DnBOX v3 bounded design challenge

Design research only, 2026-11-14. Implementation owner: parent agent. No product files changed. Read v2 `app.js`, `style.css`, `index.html`, `provenance/inspiration.md`, and relevant `provenance/journeys-20261114.md` evidence; visually inspected the unchanged `elite-909-lcd.png` capture. No prior review findings or scores were consumed.

Owner feedback consumed verbatim: “your explanation pages on how to use the firmware suck dry”. Treat this as a learning-design problem: a musician needs a reason to act, a control they can locate, an observable result, and a useful next move when the result differs. Shortening the existing prose alone will not fix it.

## What the present design gets in the way of

- `home()` repeats the same rectangle, large heading, paragraph and arrow grammar. The instrument becomes another panel instead of the center of an invitation to make something.
- `learn/beat` asks a beginner to read note names, infer their positions, inspect a capture, and then leave the page for the complete locator. Put the physical location beside the current action.
- Four kicks are the instructional goal, while `learn/listen` shows a separate Pro recording with one kick. The disclaimer is honest, but a novice still has to mentally separate target, proof and comparison. Keep the Elite four-kick capture as the goal image; label the Pro capture as a separate playing example, never a continuation.
- “Choose Chicago and place notes” is an example description, not an actionable beginner lesson. Do not turn those examples into tasks until exact supported controls and recovery are available.
- Save is treated as the last lesson page. It is also the action that gives a new musician permission to explore. Explain its consequence in one short strip, then offer the detailed message reader when needed.

## Direction A — “Four places to start” (recommended)

Story: a pulse becomes four visible places; those places belong to actual keys; a musician makes that pulse on their instrument; they hear it and keep it.

Page rhythm: an oversized editorial opening with a small honest capture label; a full-width sparse four-position rhythm notation, explicitly labelled “pattern guide”; a large actual instrument locator with the current key in focus; then a compact observation choice. Finish with an unboxed save strip and a small route to deeper help. Charcoal space and lime should establish hierarchy; the firmware capture keeps its authentic orange LCD colors.

Original interaction: “Show me the four keys” unfolds the keyboard locator directly below the musical idea. Four ordinary buttons labelled “Locate F3 / step 1”, “Locate C4 / step 5”, etc. change only a guide highlight and the accompanying location sentence. A permanent label says “Key locator · illustration, not instrument controls”. The LCD image stays unchanged. This turns a note-name lookup into a useful spatial task without pretending to play the device.

One task at a time:

1. **Give it a kick.** Show F#3 on the locator. “On your instrument: in 909 SEQ, press F#3, the black key above the fourth white key, to select BD.” Check: “Find BD selected on your screen.” Divergence: “Another screen?” opens the version-specific guide boundary; “No extra hit?” explains KEY SOUND = STOPPED during playback, without suggesting a wrong key.
2. **Leave three gaps.** Show the four mapped white keys together and the unchanged four-kick capture. “Tap F3, C4, G4 and D5 once where their steps are unlit.” Check: BD steps 1, 5, 9, 13 lit. Keep “Tapping a lit step removes it” beside the instruction, not in a hidden note. Buttons read “My four steps match” and “Mine looks different”; these are learner reports, never device detection.
3. **Hear the shape.** Locate SEQ PLAY in its actual lower row, second from right. On-instrument instruction, followed by “Are the steps advancing?” and “Can you hear the kicks?” If not advancing: clock guidance. If advancing but silent: listening connection, master/track levels and mutes. Keep the beat intact; do not recommend resets or repeated step taps.
4. **Keep the idea.** Show BT / SAVE in the actual upper row, far right. Stop playback, REC off, release notes/controls, short tap and release. Keep power on until SAVED/AUTOSAVED. Put live-chain persistence and separate BREAK sample backup consequences here, compactly. Message lookup remains available but starts with the musician’s observed message.

Pitfall: an interactive rhythm notation can be mistaken for a live sequencer. Do not add moving playheads, synthetic LCD cells, note toggles or a “Play” label unless there is a separately qualified actual recording. A static diagram that exposes key locations is already meaningful interaction.

## Direction B — “Look / touch / notice”

Story: introduce the real instrument with one large authenticated recorded view, then offer a brief guided inspection before the musician follows the actions on their own keyboard.

Page rhythm: a broad capture stage with a narrow annotation rail; next a bright, almost paper-like locator spread against the charcoal; then short alternating text strips for hear, save and continue. Drop repeated card borders. The interface feels like an annotated instrument sleeve rather than documentation categories.

Original interaction: three numbered callout controls outside the untouched capture: “BD”, “Four kick steps”, “UNSAVED”. Selecting one reveals a one-sentence explanation and a pointer in the surrounding margin. No screenshot pixels are fabricated or altered. A clear “Recorded Elite 0.0.25.1 screen · completed four-kick pattern · before playback” caption remains adjacent at every width. The same callout order becomes a vertical list on mobile.

Learning task: after inspecting “Four kick steps”, choose “Find these on my keyboard”. That reveals the exact white-key locator and the on-instrument task from A. After inspecting “UNSAVED”, show the save consequence before offering a variation. Dense engine, connection and installation information is reachable through small indexed rows lower down.

Pitfall: making people inspect all callouts before acting recreates a manual. No gated tour or completion badges. Primary action stays visible, and callouts are optional. Separate captures must not cross-fade as if they are a real performed sequence.

## Direction C — “An idea worth keeping”

Story: open on one authentic recorded musical example when rights, source and behavior are established. Ask the visitor to notice a concrete ingredient, then show its real screen and the controls that made it. Make “your first four kicks” the reachable hands-on branch; discovery visitors can continue through separate bass and BREAK examples.

Page rhythm: large listening transport or a clearly silent captured example; a thin ingredient list; a full-width physical-control spread; a compact make/hear/save task; a final branching line for another voice, connections or help. This has the most musical emotional entry if authorized sound is actually available.

Original interaction: a simple opt-in “Listen to this recorded example”, native/accessible pause and mute, and source/model/version provenance adjacent to the recording. Ingredient selectors change captions and separate captured examples only. They must not claim to solo parts, remix a recording, select an actual engine, or demonstrate an exact audio-screen relationship unless that correspondence is proved. If audio cannot qualify, use “Inspect the recorded pattern” and retain the same learning branch; do not fill the gap with generated or generic sound.

Pitfall: a polished player can overstate qualification more persuasively than a paragraph can retract it. “Recorded emulator output” needs to be explicit near the play action. Never imply #899 realtime acceptance, physical-device output, user-triggered firmware synthesis or a continuous multi-capture performance.

## Evidence constraints that should shape implementation

Existing source-backed mapping: in 909 SEQ, F#3 selects BD; F3/C4/G4/D5 place steps 1/5/9/13. The source evidence distinguishes the full C3–C6 keyboard from step span F3–G5. Use named keys because physical pad direction is not verified. BT / SAVE is upper row far right under the default mapping; SEQ PLAY is lower row second from right. Short SAVE press/release matters because holding can select a paste target.

The supplied unchanged Elite 0.0.25.1 four-kick capture shows 909 SEQ, BD, four orange steps, UNSAVED and 125 BPM. The Pro one-pad playback capture is a separate example. Chicago, Miami and BREAK captures are separate prepared examples; the BREAK CRAMEN material was separately loaded, not firmware-bundled. No task should silently convert these into successive states of one session.

The documented inspiration principles are useful: concise promise, visible real-product examples, control/display relationship and progressive depth. Borrow those principles only; the four-location interaction and observation-based learning grammar above are original to this design problem.

## Candid acceptance questions for the fresh reviewer

- Without a glossary, can a new musician state what they will make and point to the first physical control?
- Can they distinguish a locator illustration, a recorded firmware image and an on-instrument action?
- On narrow mobile, can they see the active control location and the action without repeated page changes or horizontal precision gestures?
- If they report an unlit/missing step, silence or a different view, do they get a useful next step that preserves their work?
- Does SAVE communicate success criteria and power-off consequences without becoming a separate lecture?

Recommendation: implement A as the instructional spine, borrow B’s untouched-capture inspection, and add C’s listening entry only after audio provenance is established. Avoid promising a fuller lesson catalog than the exact control and feedback evidence supports.
