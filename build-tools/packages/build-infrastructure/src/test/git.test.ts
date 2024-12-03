/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { unlink } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { expect } from "chai";
import { readJson, writeJson } from "fs-extra/esm";
import { describe, it } from "mocha";
import { CleanOptions, simpleGit } from "simple-git";

import { loadBuildProject } from "../buildProject.js";
import { NotInGitRepository } from "../errors.js";
import { findGitRootSync, getChangedSinceRef, getFiles, getRemote } from "../git.js";
import type { PackageJson } from "../types.js";

import { packageRootPath, testRepoRoot } from "./init.js";

describe("findGitRootSync", () => {
	it("finds root", () => {
		// This is the path to the current repo, because when tests are executed the working directory is
		// the root of this package: build-tools/packages/build-infrastructure
		const expected = path.resolve(packageRootPath, "../../..");
		const actual = findGitRootSync(process.cwd());
		assert.strictEqual(actual, expected);
	});

	it("throws outside git repo", () => {
		assert.throws(() => {
			findGitRootSync(os.tmpdir());
		}, NotInGitRepository);
	});
});

describe("getRemote", () => {
	const git = simpleGit(process.cwd());

	it("finds upstream remote", async () => {
		const actual = await getRemote(git, "microsoft/FluidFramework");
		expect(actual).not.to.be.undefined;
	});

	it("missing remote returns undefined", async () => {
		const actual = await getRemote(git, "foo/bar");
		expect(actual).to.be.undefined;
	});
});

describe("getChangedSinceRef: local", () => {
	const git = simpleGit(process.cwd());
	const repo = loadBuildProject(testRepoRoot);

	beforeEach(async () => {
		// create a file
		const newFile = path.join(testRepoRoot, "second/newFile.json");
		await writeJson(newFile, '{"foo": "bar"}');
		await git.add(newFile);

		// delete a file
		await unlink(path.join(testRepoRoot, "packages/group3/pkg-f/src/index.mjs"));

		// edit a file
		const pkgJson = path.join(testRepoRoot, "packages/group3/pkg-f/package.json");
		const json = (await readJson(pkgJson)) as PackageJson;
		json.author = "edited field";
		await writeJson(pkgJson, json);
	});

	afterEach(async () => {
		await git.reset(["HEAD", "--", testRepoRoot]);
		await git.checkout(["HEAD", "--", testRepoRoot]);
		await git.clean(CleanOptions.FORCE, [testRepoRoot]);
	});

	it("returns correct files", async () => {
		const { files } = await getChangedSinceRef(repo, "HEAD");

		expect(files).to.be.containingAllOf([
			"packages/group3/pkg-f/package.json",
			"packages/group3/pkg-f/src/index.mjs",
			"second/newFile.json",
		]);
		expect(files).to.be.ofSize(3);
	});

	it("returns correct dirs", async () => {
		const { dirs } = await getChangedSinceRef(repo, "HEAD");

		expect(dirs).to.be.containingAllOf([
			"packages/group3/pkg-f",
			"packages/group3/pkg-f/src",
			"second",
		]);
		expect(dirs).to.be.ofSize(3);
	});

	it("returns correct packages", async () => {
		const { packages } = await getChangedSinceRef(repo, "HEAD");

		expect(packages.map((p) => p.name)).to.be.containingAllOf([
			"@group3/pkg-f",
			"second-release-group-root",
		]);
		expect(packages).to.be.ofSize(2);
	});

	it("returns correct release groups", async () => {
		const { releaseGroups } = await getChangedSinceRef(repo, "HEAD");

		expect(releaseGroups.map((p) => p.name)).to.be.containingAllOf([
			"group3",
			"second-release-group",
		]);
		expect(releaseGroups).to.be.ofSize(2);
	});

	it("returns correct workspaces", async () => {
		const { workspaces } = await getChangedSinceRef(repo, "HEAD");

		expect(workspaces.map((p) => p.name)).to.be.containingAllOf(["main", "second"]);
		expect(workspaces).to.be.ofSize(2);
	});
});

describe("getFiles", () => {
	const git = simpleGit(process.cwd());
	const gitRoot = findGitRootSync();

	it("correct files with clean working directory", async () => {
		const actual = await getFiles(git, testRepoRoot);
		console.debug(testRepoRoot, actual);

		expect(actual).to.be.containingAllOf(
			[
				`${testRepoRoot}/.changeset/README.md`,
				`${testRepoRoot}/.changeset/bump-main-group-minor.md`,
				`${testRepoRoot}/.changeset/config.json`,
				`${testRepoRoot}/fluidBuild.config.cjs`,
				`${testRepoRoot}/package.json`,
				`${testRepoRoot}/packages/group2/pkg-d/package.json`,
				`${testRepoRoot}/packages/group2/pkg-e/package.json`,
				`${testRepoRoot}/packages/group3/pkg-f/package.json`,
				`${testRepoRoot}/packages/group3/pkg-f/src/index.mjs`,
				`${testRepoRoot}/packages/group3/pkg-g/package.json`,
				`${testRepoRoot}/packages/pkg-a/package.json`,
				`${testRepoRoot}/packages/pkg-b/package.json`,
				`${testRepoRoot}/packages/pkg-c/package.json`,
				`${testRepoRoot}/packages/shared/package.json`,
				`${testRepoRoot}/pnpm-lock.yaml`,
				`${testRepoRoot}/pnpm-workspace.yaml`,
				`${testRepoRoot}/second/package.json`,
				`${testRepoRoot}/second/packages/other-pkg-a/package.json`,
				`${testRepoRoot}/second/packages/other-pkg-b/package.json`,
				`${testRepoRoot}/second/pnpm-lock.yaml`,
				`${testRepoRoot}/second/pnpm-workspace.yaml`,
			].map((p) => path.relative(gitRoot, p)),
		);
	});
});
