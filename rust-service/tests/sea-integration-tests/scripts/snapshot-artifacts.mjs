/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Identifies the generated client binary selected by the browser's remote transport. */
export function snapshotClientArtifact(root, { transport, compression }) {
	assert.ok(["webtransport", "websocket"].includes(transport));
	assert.equal(typeof compression, "boolean");
	assert.ok(
		transport !== "websocket" || !compression,
		"WebSocket artifact does not support compression",
	);
	const target =
		transport === "websocket"
			? "websocket"
			: compression
				? "webtransport-compression"
				: "webtransport";
	const wasmPath = `rust-service/packages/sea-typescript/generated/${target}/web/sea_wasm_bg.wasm`;
	return {
		wasmPath,
		wasmSha256: createHash("sha256")
			.update(readFileSync(resolve(root, wasmPath)))
			.digest("hex"),
	};
}
