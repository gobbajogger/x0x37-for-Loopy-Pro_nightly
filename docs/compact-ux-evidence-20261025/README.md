# Compact installer review

Tested source: `5ff1a5ce7d05c4e85cb01307556158be9992bc65`, following PR22 candidate `08b7e2a9ff01bfcfe4edb439ad43302af8c8ad8d`.

Repeated status badges, beta/backup explanations and technical prose made the next action hard to find. The page now keeps one first-install loss warning and meaningful development-firmware consent at Install, with technical build context in Details. Phone navigation fits the three tasks in one row. Samples and projects use concise guidance and optional recovery details. Faithful screen artwork is larger and opens at original size; visible Setup follows Closer look on all routes.

Native build/tests and independent headless browser suites pass. The independent pixel review covers populated desktop and phone previews. Separate browser checks cover 320/390/768/1280px, keyboard navigation, synthetic connection/error paths, catalog/model/hash/consent rejection, sample/project interlocks and corrupt files. See the reports, logs and validation manifest here. The final copy repair makes whole-project/arrangement scope explicit without weakening the existing checks.

The review-only HTML uses a captured published catalog, a small Preview label, and disabled device operations/downloads. The final preview was independently checked for disabled actions, rejected fetch/MIDI in every frame and zero HTTP requests. It and the screenshots were delivered separately to Library. Neither the snapshot payload nor preview-only code is in this source branch. `preview-catalog.json`, `docs/versions.json`, build history and live downloads are unchanged.

Publication-ready handoff: apply this bounded follow-up after its PR22 base, with the authorized merger/publisher checking current protections and publication authority. Do not deploy the review HTML or empty source-preview catalog. Use the normal qualified publication path with current approved catalog data and check served bytes. No merge, public deployment, firmware qualification or real device mutation was performed here. Owner approval and publisher integration remain separate gates.
