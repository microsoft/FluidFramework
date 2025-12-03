/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { rm } from "node:fs/promises";
import path from "node:path";

import { expect } from "chai";
import { describe, it } from "mocha";

import { loadBuildProject } from "../buildProject.js";
import type { PackageName, WorkspaceName } from "../types.js";

import { testRepoRoot } from "./init.js";

describe("workspaces", () => {
	const repo = loadBuildProject(testRepoRoot);
	const workspace = repo.workspaces.get("main" as WorkspaceName);

	describe("lockfile outdated", () => {
		const pkg = repo.packages.get("@group2/pkg-e" as PackageName);
		assert(pkg !== undefined);

		beforeEach(async () => {
			pkg.packageJson.dependencies = {
				"empty-npm-package": "1.0.0",
			};
			await pkg.savePackageJson();
		});

		afterEach(async () => {
			pkg.packageJson.dependencies = {};
			await pkg.savePackageJson();
		});

		// TODO: Test will be enabled in a follow-up change
		// it("install succeeds when updateLockfile=true", async () => {
		// 	await assert.rejects(async () => {
		// 		await workspace?.install(true);
		// 	});
		// });

		it("install fails when updateLockfile=false", async () => {
			await assert.rejects(
				async () => {
					await workspace?.install(false);
				},
				{
					name: "Error",
					// Note: This assumes we are using pnpm as the package manager. Other package managers will throw different
					// errors.
					message: /.*ERR_PNPM_OUTDATED_LOCKFILE.*/,
				},
			);
		});
	});

	describe("not installed", () => {
		beforeEach(async () => {
			try {
				await rm(path.join(repo.root, "node_modules"), { recursive: true, force: true });
			} catch {
				// nothing
			}
		});

		it("checkInstall returns errors when node_modules is missing", async () => {
			const actual = await workspace?.checkInstall();
			expect(actual).not.to.be.true;
			expect(actual?.[0]).to.include(": node_modules not installed in");
		});

		it("install succeeds", async () => {
			await assert.doesNotReject(async () => {
				await workspace?.install(false);
			});
		});
	});
});
