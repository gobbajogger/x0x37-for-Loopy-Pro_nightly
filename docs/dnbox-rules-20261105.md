# Controller licensing description correction — 2026-11-05

Trigger: The owner asked dot to reconcile DnBOX's contradictory rules while Grok
owns development/delivery and its dedicated DnBOX Docs bot awaits maintenance.

Cause: `nightly-candidate-continuity.md` called the Bluetooth controller closed
source, while the pinned firmware `LICENSING.md` says this blanket classification
was not established by component-specific evidence.

Effect: Link the actual component-specific licensing record. Keep actual rights,
source availability, immutable artifacts, existing package exceptions, all native
and installer gates, sole publisher ownership and separate production hardware
approval. The correction grants no redistribution or publication permission and
changes no software, catalog, package or served bytes.

Check: Exact baseline/delta bytes, relative link targets and whitespace, plus one
bounded independent review of the documentation patch. No firmware/npm/browser
or device check is needed for this prose-only correction. Raw evidence, checks,
review and exact source pins remain in the durable DnBOX docs cleanup handoff.

Grok retains delivery ownership. Dot remains this cleanup's sole writer until
handoff; DnBOX Docs is the intended future rules-maintenance owner. No original
review, role registry, queue, scheduler or review budget was changed.
