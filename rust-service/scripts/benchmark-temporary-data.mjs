/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";

const temporaryRoot = realpathSync("/tmp");

/**
 * Creates one owned benchmark data directory on the host temporary filesystem.
 *
 * The returned cleanup operation removes only the exact directory created here.
 */
export function createTemporaryBenchmarkData(prefix) {
	assert.match(prefix, /^[a-z0-9-]+$/u, "temporary data prefix");
	const path = mkdtempSync(resolve(temporaryRoot, `${prefix}-`));
	const ownedRelativePath = relative(temporaryRoot, path);
	assert.ok(
		ownedRelativePath !== "" &&
			!ownedRelativePath.startsWith("..") &&
			!ownedRelativePath.includes("/"),
		"temporary data directory must be an immediate child of /tmp",
	);
	const provenance = {
		path,
		root: temporaryRoot,
		filesystem: execFileSync("findmnt", ["-T", path, "-n", "-o", "FSTYPE"], {
			encoding: "utf8",
		}).trim(),
		mountSource: execFileSync("findmnt", ["-T", path, "-n", "-o", "SOURCE"], {
			encoding: "utf8",
		}).trim(),
		device: execFileSync("stat", ["-c", "%d", path], { encoding: "utf8" }).trim(),
		temporary: true,
	};
	let removed = false;
	const removeOwnedPath = () => {
		assert.equal(relative(temporaryRoot, path), ownedRelativePath);
		rmSync(path, { recursive: true });
		removed = true;
	};
	const removeOnExit = () => {
		if (removed) return;
		try {
			removeOwnedPath();
		} catch (error) {
			console.error(`Failed to remove owned benchmark data ${path}: ${error}`);
			process.exitCode = 1;
		}
	};
	process.once("exit", removeOnExit);
	return {
		path,
		provenance,
		remove() {
			if (removed) return;
			removeOwnedPath();
			process.off("exit", removeOnExit);
		},
	};
}
