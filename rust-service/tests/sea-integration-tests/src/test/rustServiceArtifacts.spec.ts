/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import { describe, it } from "mocha";

import { getRustServiceArtifacts } from "./rustServiceArtifacts.js";

describe("Rust benchmark artifact selection", () => {
	it("builds and launches from the same target despite inherited Cargo output", () => {
		const workspace = path.resolve("fixture workspace", "rust-service");
		const target = path.join(workspace, "target");
		const inheritedTarget = process.env.CARGO_TARGET_DIR;
		try {
			process.env.CARGO_TARGET_DIR = path.resolve("unrelated-cargo-output");
			const artifacts = getRustServiceArtifacts(workspace);
			assert.deepEqual(artifacts.buildArguments, [
				"build",
				"--locked",
				"-p",
				"sea-webtransport-server",
				"--release",
				"--features",
				"websocket-stream",
				"--target-dir",
				target,
			]);
			assert.equal(
				artifacts.executable,
				path.join(target, "release", "sea-webtransport-server"),
			);
			assert.notEqual(target, process.env.CARGO_TARGET_DIR);
		} finally {
			if (inheritedTarget === undefined) {
				delete process.env.CARGO_TARGET_DIR;
			} else {
				process.env.CARGO_TARGET_DIR = inheritedTarget;
			}
		}
	});
});
