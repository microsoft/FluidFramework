/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import chai, { expect } from "chai";
import assertArrays from "chai-arrays";
import { describe, it } from "mocha";
import * as semver from "semver";
import { simpleGit } from "simple-git";

import { loadBuildProject, setDependencyRange } from "../buildProject.js";
import { findGitRootSync } from "../git.js";
import type { ReleaseGroupName, WorkspaceName } from "../types.js";

import { testRepoRoot } from "./init.js";

chai.use(assertArrays);

const git = simpleGit(testRepoRoot);

describe("loadBuildProject", () => {
	describe("testRepo", () => {
		it("loads correctly", () => {
			const repo = loadBuildProject(testRepoRoot);
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
			const repo = loadBuildProject(testRepoRoot);
			const mainReleaseGroup = repo.releaseGroups.get("main" as ReleaseGroupName);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test data (validated by another test) guarantees this has a value
			const actualDependencies = mainReleaseGroup!.releaseGroupDependencies;
			const names = actualDependencies.map((r) => r.name as string);

			expect(actualDependencies).to.not.be.undefined;
			expect(names).to.be.containingAllOf(["group2"]);
		});
	});

	describe("FluidFramework repo - tests backCompat config loading", () => {
		it("loads correctly", () => {
			// Load the root config
			const repo = loadBuildProject(findGitRootSync());
			expect(repo.workspaces.size).to.be.greaterThan(1);

			const client = repo.workspaces.get("client" as WorkspaceName);
			expect(client).to.not.be.undefined;
			expect(client?.packages.length).to.be.greaterThan(1);
			expect(client?.releaseGroups.size).to.be.greaterThan(0);

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
			const repo = loadBuildProject(findGitRootSync());
			const clientReleaseGroup = repo.releaseGroups.get("client" as ReleaseGroupName);
			assert(clientReleaseGroup !== undefined);

			const actualDependencies = clientReleaseGroup.releaseGroupDependencies;

			expect(actualDependencies).to.not.be.undefined;
			expect(actualDependencies).to.not.be.empty;
		});
	});
});

describe("setDependencyRange", () => {
	const repo = loadBuildProject(testRepoRoot);
	const main = repo.releaseGroups.get("main" as ReleaseGroupName);
	assert(main !== undefined);
	const mainPackages = new Set(main.packages);

	const group2 = repo.releaseGroups.get("group2" as ReleaseGroupName);
	assert(group2 !== undefined);
	const group2Packages = new Set(group2.packages);

	const mainWorkspace = repo.workspaces.get("main" as WorkspaceName);
	assert(mainWorkspace !== undefined);
	const mainWorkspacePackages = new Set(mainWorkspace.packages);

	afterEach(async () => {
		await git.checkout(["HEAD", "--", testRepoRoot]);
		repo.reload();
	});

	it("updates the dependency range to explicit version given group2 packages", async () => {
		const version = semver.parse("2.0.0");
		assert(version !== null);
		await setDependencyRange(mainPackages, group2Packages, version);

		const allCorrect = main.packages.every((pkg) => {
			const dependencies = pkg.packageJson.dependencies ?? {};

			const group2PkgDUpdated = (dependencies["@group2/pkg-d"] ?? "2.0.0") === "2.0.0";

			return group2PkgDUpdated;
		});
		expect(allCorrect).to.be.true;
	});

	it("updates the dependency range to explicit version given superset workspace", async () => {
		const version = semver.parse("2.0.0");
		assert(version !== null);
		await setDependencyRange(mainPackages, mainWorkspacePackages, version);

		const allCorrect = main.packages.every((pkg) => {
			const dependencies = pkg.packageJson.dependencies ?? {};

			const pkgbUpdated = (dependencies["pkg-b"] ?? "2.0.0") === "2.0.0";

			const pkgcUpdated = (dependencies["@private/pkg-c"] ?? "2.0.0") === "2.0.0";

			const sharedUpdated = (dependencies["@shared/shared"] ?? "2.0.0") === "2.0.0";

			const pkgdUpdated = (dependencies["@group2/pkg-d"] ?? "2.0.0") === "2.0.0";

			return pkgbUpdated && pkgcUpdated && sharedUpdated && pkgdUpdated;
		});
		expect(allCorrect).to.be.true;
	});

	it("updates the dependency range to explicit version given main packages", async () => {
		const version = semver.parse("2.0.0");
		assert(version !== null);
		await setDependencyRange(mainPackages, mainPackages, version);

		const allCorrect = main.packages.every((pkg) => {
			const dependencies = pkg.packageJson.dependencies ?? {};

			const pkgbUpdated = (dependencies["pkg-b"] ?? "2.0.0") === "2.0.0";

			const sharedUpdated = (dependencies["@shared/shared"] ?? "2.0.0") === "2.0.0";

			return pkgbUpdated && sharedUpdated;
		});
		expect(allCorrect).to.be.true;
	});
});
