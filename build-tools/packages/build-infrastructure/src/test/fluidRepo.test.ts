/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { expect } from "chai";
import { describe, it } from "mocha";

import { loadFluidRepo } from "../fluidRepo.js";
import { findGitRootSync } from "../git.js";
import type { ReleaseGroupName, WorkspaceName } from "../types.js";

import { testRepoRoot } from "./init.js";

describe("loadFluidRepo", () => {
	describe("testRepo", () => {
		it("loads correctly", () => {
			const repo = loadFluidRepo(testRepoRoot);
			assert.strictEqual(
				repo.workspaces.size,
				2,
				`Expected 2 workspaces, found ${repo.workspaces.size}`,
			);

			const main = repo.workspaces.get("main" as WorkspaceName);
			expect(main).to.not.be.undefined;
			expect(main?.packages.length).to.equal(
				9,
				"main workspace has the wrong number of packages",
			);
			expect(main?.releaseGroups.size).to.equal(
				3,
				"main workspace has the wrong number of release groups",
			);

			const mainReleaseGroup = repo.releaseGroups.get("main" as ReleaseGroupName);
			expect(mainReleaseGroup).to.not.be.undefined;
			expect(mainReleaseGroup?.packages.length).to.equal(
				5,
				"main release group has the wrong number of packages",
			);

			const second = repo.workspaces.get("second" as WorkspaceName);
			expect(second).to.not.be.undefined;
			expect(second?.packages.length).to.equal(
				3,
				"second workspace has the wrong number of packages",
			);
			expect(second?.releaseGroups.size).to.equal(
				1,
				"second workspace has the wrong number of release groups",
			);
		});

		it("releaseGroupDependencies", async () => {
			const repo = loadFluidRepo(testRepoRoot);
			const mainReleaseGroup = repo.releaseGroups.get("main" as ReleaseGroupName);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const actualDependencies = mainReleaseGroup!.releaseGroupDependencies;
			const names = actualDependencies.map((r) => r.name as string);

			expect(actualDependencies).to.not.be.undefined;
			expect(names).to.be.containingAllOf(["group2"]);
		});
	});

	describe("FluidFramework repo", () => {
		describe("loadFluidRepo", () => {
			it("loads correctly", () => {
				// Load the root config
				const repo = loadFluidRepo(findGitRootSync());
				assert.strictEqual(
					repo.workspaces.size,
					14,
					`Expected 14 workspaces, found ${repo.workspaces.size}`,
				);

				const client = repo.workspaces.get("client" as WorkspaceName);
				expect(client).to.not.be.undefined;
				expect(client?.packages.length).to.equal(
					155,
					"client workspace has the wrong number of packages",
				);
				expect(client?.releaseGroups.size).to.equal(
					1,
					"client workspace has the wrong number of release groups",
				);

				const buildTools = repo.workspaces.get("build-tools" as WorkspaceName);
				expect(buildTools).to.not.be.undefined;
				expect(buildTools?.packages.length).to.equal(
					6,
					"build-tools workspace has the wrong number of packages",
				);
				expect(buildTools?.releaseGroups.size).to.equal(
					1,
					"build-tools workspace has the wrong number of release groups",
				);
			});

			it("releaseGroupDependencies", async () => {
				const repo = loadFluidRepo(findGitRootSync());
				const clientReleaseGroup = repo.releaseGroups.get("client" as ReleaseGroupName);
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const actualDependencies = clientReleaseGroup!.releaseGroupDependencies;
				const names = actualDependencies.map((r) => r.name as string);

				expect(actualDependencies).to.not.be.undefined;
				expect(names).to.be.containingAllOf([]);
			});
		});
	});
});
