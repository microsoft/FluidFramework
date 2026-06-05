/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as semver from "semver";

import {
	checkpointResolutionRange,
	checkpoints,
	compatibilityCheckpointsDocRelativePath,
	findRepoRoot,
	fullCompatibilityWindowSize,
	getCurrentCheckpoint,
	getInWindowPriorCheckpoints,
	injectCheckpointsTable,
} from "../checkpoints.js";

describe("checkpoints", () => {
	describe("data", () => {
		it("has unique, contiguous 1-based indexes with matching names", () => {
			checkpoints.forEach((c, i) => {
				assert.strictEqual(c.index, i + 1, `${c.name} index`);
				assert.strictEqual(c.name, `CC-${c.index}`, `${c.name} name`);
			});
		});

		it("has valid semver lowerBoundVersions in strictly increasing order", () => {
			checkpoints.forEach((c, i) => {
				assert.ok(semver.valid(c.lowerBoundVersion), `${c.name} semver`);
				if (i > 0) {
					const prev = checkpoints[i - 1];
					assert.ok(prev !== undefined, "prev defined");
					assert.ok(
						semver.gt(c.lowerBoundVersion, prev.lowerBoundVersion),
						`${c.name} > ${prev.name}`,
					);
				}
			});
		});

		it("has ISO YYYY-MM-DD startDates", () => {
			for (const c of checkpoints) {
				assert.match(c.startDate, /^\d{4}-\d{2}-\d{2}$/, `${c.name} startDate`);
			}
		});
	});

	describe("getCurrentCheckpoint", () => {
		it("maps an exact lowerBoundVersion to its checkpoint", () => {
			assert.strictEqual(getCurrentCheckpoint("1.4.0").name, "CC-1");
			assert.strictEqual(getCurrentCheckpoint("2.0.0").name, "CC-2");
			assert.strictEqual(getCurrentCheckpoint("2.60.0").name, "CC-3");
			assert.strictEqual(getCurrentCheckpoint("2.100.0").name, "CC-4");
		});

		it("maps a version between two lower bounds to the lower checkpoint", () => {
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

		it("maps a prerelease at a lowerBoundVersion MMP to that checkpoint (boundary)", () => {
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

		it("round-trips each checkpoint's lowerBoundVersion to itself", () => {
			for (const c of checkpoints) {
				assert.strictEqual(getCurrentCheckpoint(c.lowerBoundVersion).name, c.name);
			}
		});
	});

	describe("getInWindowPriorCheckpoints", () => {
		it("returns up to fullCompatibilityWindowSize prior checkpoints, newest first", () => {
			const cc4 = checkpoints.find((c) => c.name === "CC-4");
			assert(cc4 !== undefined, "CC-4 expected in checkpoints");
			const priors = getInWindowPriorCheckpoints(cc4);
			assert.deepStrictEqual(
				priors.map((c) => c.name),
				["CC-3", "CC-2", "CC-1"],
			);
		});

		it("returns fewer than fullCompatibilityWindowSize entries near the start of the list", () => {
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

		it("returns indexes strictly descending, contiguous, and below current", () => {
			for (const current of checkpoints) {
				const priors = getInWindowPriorCheckpoints(current);
				assert.ok(priors.length <= fullCompatibilityWindowSize, `${current.name} length`);
				priors.forEach((p, i) => {
					assert.strictEqual(p.index, current.index - (i + 1), `${current.name} prior[${i}]`);
				});
			}
		});
	});

	describe("checkpointResolutionRange", () => {
		it("returns a tilde range pinned to the checkpoint's lowerBoundVersion", () => {
			for (const c of checkpoints) {
				assert.strictEqual(checkpointResolutionRange(c), `~${c.lowerBoundVersion}`);
			}
		});
	});

	describe("injectCheckpointsTable", () => {
		const start = "<!-- GENERATED-TABLE-START -->";
		const end = "<!-- GENERATED-TABLE-END -->";

		it("replaces only the content between the sentinels and preserves surrounding prose", () => {
			const doc = `# Title\n\nbefore prose\n\n${start}\nold contents\n${end}\n\nafter prose\n`;
			const updated = injectCheckpointsTable(doc);
			assert.ok(updated.startsWith("# Title\n\nbefore prose\n\n"), "prose before preserved");
			assert.ok(updated.endsWith("\n\nafter prose\n"), "prose after preserved");
			assert.ok(updated.includes(start) && updated.includes(end), "sentinels preserved");
			assert.ok(!updated.includes("old contents"), "old contents replaced");
			// Running again produces the same output.
			assert.strictEqual(injectCheckpointsTable(updated), updated);
		});

		it("throws if either sentinel is missing", () => {
			assert.throws(() => injectCheckpointsTable(`no markers here`));
			assert.throws(() => injectCheckpointsTable(`only ${start} here`));
			assert.throws(() => injectCheckpointsTable(`only ${end} here`));
		});
	});

	describe("findRepoRoot", () => {
		it("locates an ancestor directory containing `.git`", () => {
			const tmp = mkdtempSync(path.join(tmpdir(), "ff-findroot-"));
			try {
				const root = path.join(tmp, "repo");
				const nested = path.join(root, "a", "b", "c");
				mkdirSync(nested, { recursive: true });
				writeFileSync(path.join(root, ".git"), "");
				assert.strictEqual(findRepoRoot(nested), root);
				assert.strictEqual(findRepoRoot(root), root);
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
		});

		it("throws when no ancestor contains `.git`", () => {
			const tmp = mkdtempSync(path.join(tmpdir(), "ff-findroot-"));
			try {
				assert.throws(() => findRepoRoot(tmp));
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
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
					"`pnpm --filter @fluid-private/test-version-utils run update-compat-versions`.",
			);
		});
	});
});
