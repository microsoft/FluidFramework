/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
	checkpoints,
	compatibilityCheckpointsDocRelativePath,
	findRepoRoot,
	getCurrentCheckpoint,
	getInWindowPriorCheckpoints,
	injectCheckpointsTable,
} from "../checkpoints.js";

describe("checkpoints", () => {
	describe("getCurrentCheckpoint", () => {
		it("maps an exact opening version to its checkpoint", () => {
			assert.strictEqual(getCurrentCheckpoint("1.4.0").name, "CC-1");
			assert.strictEqual(getCurrentCheckpoint("2.0.0").name, "CC-2");
			assert.strictEqual(getCurrentCheckpoint("2.60.0").name, "CC-3");
			assert.strictEqual(getCurrentCheckpoint("2.100.0").name, "CC-4");
		});

		it("maps a version between two openings to the lower checkpoint", () => {
			assert.strictEqual(getCurrentCheckpoint("1.4.5").name, "CC-1");
			assert.strictEqual(getCurrentCheckpoint("2.0.9").name, "CC-2");
			assert.strictEqual(getCurrentCheckpoint("2.39.0").name, "CC-2");
			assert.strictEqual(getCurrentCheckpoint("2.59.0").name, "CC-3");
			assert.strictEqual(getCurrentCheckpoint("2.99.0").name, "CC-4");
			assert.strictEqual(getCurrentCheckpoint("2.101.0").name, "CC-4");
		});

		it("maps `2.0.0-internal*` and `2.0.0-rc*` to CC-1 via additionalRanges", () => {
			assert.strictEqual(getCurrentCheckpoint("2.0.0-internal.1.0.0").name, "CC-1");
			assert.strictEqual(getCurrentCheckpoint("2.0.0-internal.7.3.0").name, "CC-1");
			assert.strictEqual(getCurrentCheckpoint("2.0.0-rc.1.0.0").name, "CC-1");
			assert.strictEqual(getCurrentCheckpoint("2.0.0-rc.5.0.8").name, "CC-1");
		});

		it("maps a prerelease at an opening MMP to that checkpoint (boundary)", () => {
			assert.strictEqual(getCurrentCheckpoint("2.100.0-rc.0").name, "CC-4");
			assert.strictEqual(getCurrentCheckpoint("2.100.0-12345-test").name, "CC-4");
			assert.strictEqual(getCurrentCheckpoint("2.60.0-rc.0").name, "CC-3");
			assert.strictEqual(getCurrentCheckpoint("1.4.0-beta.1").name, "CC-1");
		});

		it("throws for versions below the earliest checkpoint", () => {
			assert.throws(() => getCurrentCheckpoint("1.3.99"));
			assert.throws(() => getCurrentCheckpoint("1.0.0"));
			assert.throws(() => getCurrentCheckpoint("0.59.0"));
			assert.throws(() => getCurrentCheckpoint("0.0.0-110039-test"));
		});

		it("throws for invalid semver", () => {
			assert.throws(() => getCurrentCheckpoint(""));
			assert.throws(() => getCurrentCheckpoint("not-a-version"));
			assert.throws(() => getCurrentCheckpoint("2"));
		});
	});

	describe("getInWindowPriorCheckpoints", () => {
		it("returns up to windowRadius prior checkpoints, newest first", () => {
			const cc4 = checkpoints.find((c) => c.name === "CC-4");
			assert(cc4 !== undefined, "CC-4 expected in checkpoints");
			const priors = getInWindowPriorCheckpoints(cc4);
			assert.deepStrictEqual(
				priors.map((c) => c.name),
				["CC-3", "CC-2", "CC-1"],
			);
		});

		it("returns fewer than windowRadius entries near the start of the list", () => {
			const cc1 = checkpoints.find((c) => c.name === "CC-1");
			const cc2 = checkpoints.find((c) => c.name === "CC-2");
			const cc3 = checkpoints.find((c) => c.name === "CC-3");
			assert(cc1 !== undefined && cc2 !== undefined && cc3 !== undefined);
			assert.deepStrictEqual(getInWindowPriorCheckpoints(cc1), []);
			assert.deepStrictEqual(
				getInWindowPriorCheckpoints(cc2).map((c) => c.name),
				["CC-1"],
			);
			assert.deepStrictEqual(
				getInWindowPriorCheckpoints(cc3).map((c) => c.name),
				["CC-2", "CC-1"],
			);
		});
	});

	describe("CompatibilityCheckpoints.md", () => {
		it("is up to date with the checkpoint data (single source of truth)", () => {
			const repoRoot = findRepoRoot(fileURLToPath(import.meta.url));
			const docPath = path.join(repoRoot, compatibilityCheckpointsDocRelativePath);
			const committed = readFileSync(docPath, "utf8");
			assert.strictEqual(
				committed,
				injectCheckpointsTable(committed),
				`${compatibilityCheckpointsDocRelativePath} table is out of date. Regenerate it with ` +
					"`pnpm --filter @fluid-private/test-version-utils run generate-checkpoints-doc`.",
			);
		});
	});
});
