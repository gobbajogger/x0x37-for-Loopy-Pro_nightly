# Discovery r2 fake endpoint checks

These original reviewed scripts are retained unchanged. From this directory:

```sh
node run-handshake.mjs matrix ../../web/x0x_breaks.html /tmp/r2-handshake.json
node run-harness.mjs matrix ../../web/x0x_breaks.html /tmp/r2-discovery.json
```

The original boundary script expects the original packet layout. To replay against this checkout, create `candidate` as a symlink to the repository root and restore the baseline at `original/web/x0x_breaks.html` with `git show 18e8278031180854437f077f3afc356f567fad97:web/x0x_breaks.html`. Run `node review/independent-boundary.mjs`. Its output file is temporary replay evidence. The older independent-edge script is historical r1 evidence and is not an r2 acceptance command. `browser-proof.py` also expects the packet's original/candidate layout and an original generated page. All endpoints are fake; do not substitute real device access.

Exact original producer/reviewer results are under `docs/repair-evidence/sample-discovery-r2/`. Full original packet closure remains available through the retained Library version/hash.
