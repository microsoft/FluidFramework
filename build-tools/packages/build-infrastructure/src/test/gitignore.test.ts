/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, it } from "mocha";
import { globSync } from "tinyglobby";

import {
	clearGitignoreRuleSetsCache,
	filterByGitignoreSync,
	globWithGitignore,
} from "../gitignore.js";

describe("gitignore utilities", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "build-infra-gitignore-"));
		await writeFile(path.join(tempDir, ".gitignore"), "root-ignored.ts\n");
		await writeFile(path.join(tempDir, "root-ignored.ts"), "export const ignored = true;\n");
		await writeFile(path.join(tempDir, "root-kept.ts"), "export const kept = true;\n");
		await writeFile(path.join(tempDir, "z-root.ts"), "export const root = true;\n");

		const nestedDir = path.join(tempDir, "a-nested");
		await mkdir(nestedDir, { recursive: true });
		await writeFile(path.join(nestedDir, ".gitignore"), "nested-ignored.ts\n");
		await writeFile(
			path.join(nestedDir, "nested-ignored.ts"),
			"export const nestedIgnored = true;\n",
		);
		await writeFile(
			path.join(nestedDir, "nested-kept.ts"),
			"export const nestedKept = true;\n",
		);

		clearGitignoreRuleSetsCache();
	});

	afterEach(async () => {
		clearGitignoreRuleSetsCache();
		await rm(tempDir, { recursive: true, force: true });
	});

	it("applies descendant .gitignore files when globbing", async () => {
		const results = await globWithGitignore(["**/*.ts"], { cwd: tempDir });
		const relativePaths = results.map((file) => path.relative(tempDir, file));

		assert.deepEqual(relativePaths, ["root-kept.ts", "z-root.ts", "a-nested/nested-kept.ts"]);
	});

	it("applies descendant .gitignore files when filtering synchronously", () => {
		const allFiles = globSync(["**/*.ts"], {
			cwd: tempDir,
			absolute: true,
			onlyFiles: true,
		});
		const filtered = filterByGitignoreSync(allFiles, tempDir);
		const relativePaths = filtered.map((file) => path.relative(tempDir, file)).sort();

		assert.deepEqual(
			relativePaths,
			["root-kept.ts", "z-root.ts", "a-nested/nested-kept.ts"].sort(),
		);
	});

	it("preserves root-before-nested traversal order", async () => {
		const results = await globWithGitignore(["**/*.ts"], {
			cwd: tempDir,
			gitignore: false,
		});
		const relativePaths = results.map((file) => path.relative(tempDir, file));
		const lastRootIndex = relativePaths.lastIndexOf("z-root.ts");
		const firstNestedIndex = relativePaths.indexOf("a-nested/nested-ignored.ts");

		assert(lastRootIndex >= 0, "Expected a root-level file in the results");
		assert(firstNestedIndex >= 0, "Expected a nested file in the results");
		assert(
			lastRootIndex < firstNestedIndex,
			`Expected root files to come before nested files, but got ${JSON.stringify(relativePaths)}`,
		);
	});
});
