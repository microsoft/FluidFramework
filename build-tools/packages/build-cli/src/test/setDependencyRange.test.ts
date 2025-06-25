/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import {
	type ReleaseGroupName,
	type WorkspaceName,
	loadBuildProject,
} from "@fluid-tools/build-infrastructure";
import chai, { expect } from "chai";
import assertArrays from "chai-arrays";
import { describe, it } from "mocha";
import { parse } from "semver";
import { simpleGit } from "simple-git";

import { setDependencyRange } from "../../src/library/setDependencyRange.js";

import { testRepoRoot } from "./init.js";

chai.use(assertArrays);

const git = simpleGit(testRepoRoot);

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
		const version = parse("2.0.0");
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
		const version = parse("2.0.0");
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
		const version = parse("2.0.0");
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
