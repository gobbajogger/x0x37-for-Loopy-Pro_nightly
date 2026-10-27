EC009 identity envelope integrity repair

See receipt.json for exact bases, contract pins, actual checks, log digests and limitations. The original PR31 reproducer is retained without edits. Added malformed-frame and valid model/version cases exercise the production parser. Existing simulator identity frames were corrected to declare payload length and checksum, matching the production envelope.

Independent review and physical stock compatibility remain pending. This source change does not explain or certify any hardware recovery operation.
