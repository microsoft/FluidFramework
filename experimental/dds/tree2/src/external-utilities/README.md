# External Utilities

This folder contains customer-facing entrypoints for pay-to-play (in the bundle-size sense) `SharedTree` features.

To keep features pay-to-play, exports should not be used by `SharedTree` production code,
which should be enforced by avoiding this folder as a valid import in other modules' `fence.json`.
