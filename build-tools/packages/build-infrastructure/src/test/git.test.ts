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

import { NotInGitRepository } from "../errors.js";
import { loadFluidRepo } from "../fluidRepo.js";
import { findGitRootSync, getChangedSinceRef, getRemote } from "../git.js";
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

describe("getChangedSinceRef", () => {
	const git = simpleGit(process.cwd());
	const repo = loadFluidRepo(testRepoRoot);
	let remote: string;

	beforeEach(async () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		remote = (await getRemote(git, "microsoft/FluidFramework"))!;

		// set up
		await unlink(path.join(testRepoRoot, "packages/group3/pkg-f/src/index.mjs"));
		const pkgJson = path.join(testRepoRoot, "packages/group3/pkg-f/package.json");
		const json = (await readJson(pkgJson)) as PackageJson;
		json.author = "edited field";
		await writeJson(pkgJson, json);
		await writeJson(path.join(testRepoRoot, "second/newFile.json"), '{"foo": "bar"}');
	});

	afterEach(async () => {
		await git.checkout(["HEAD", "--", testRepoRoot]);
		await git.clean(CleanOptions.FORCE, [testRepoRoot]);
	});

	it("returns correct files", async () => {
		const { files } = await getChangedSinceRef(repo, "HEAD", remote);

		// files
		expect(files).to.be.ofSize(1);
		expect(files).to.be.containingAllOf(["/packages/group3/pkg-f/package.json"]);
	});
});
