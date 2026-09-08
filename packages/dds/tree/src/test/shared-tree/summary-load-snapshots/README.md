# Summary load snapshots

This folder contains committed summary snapshots used by the summary load regression tests.

Each `singleTree-<TreeCompressionStrategy>-<minVersionForCollab>-<n>.json` file is a SharedTree summary produced with the given `TreeCompressionStrategy` and `minVersionForCollab`. The regression test loads every snapshot here to verify that summaries written by past versions still load with the current code.

To add or refresh snapshots, run `pnpm run test:snapshots:regen`.

See [`../summaryLoad.integration.ts`](../summaryLoad.integration.ts) for details on how these files are generated and consumed.
