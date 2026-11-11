/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { snapshotClientArtifact } from "./snapshot-artifacts.mjs";

test("snapshot provenance follows the selected client binary", () => {
	const root = mkdtempSync(join(tmpdir(), "sea-snapshot-artifacts-"));
	try {
		for (const [transport, compression, target] of [
			["webtransport", false, "webtransport"],
			["webtransport", true, "webtransport-compression"],
			["websocket", false, "websocket"],
		]) {
			const wasmPath = `rust-service/packages/sea-typescript/generated/${target}/web/sea_wasm_bg.wasm`;
			mkdirSync(dirname(join(root, wasmPath)), { recursive: true });
			for (const bytes of [Buffer.from(target), Buffer.from(`${target}-changed`)]) {
				writeFileSync(join(root, wasmPath), bytes);
				assert.deepEqual(snapshotClientArtifact(root, { transport, compression }), {
					wasmPath,
					wasmSha256: createHash("sha256").update(bytes).digest("hex"),
				});
			}
		}
		assert.throws(() =>
			snapshotClientArtifact(root, { transport: "websocket", compression: true }),
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
