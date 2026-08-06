/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { unlink } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { expect } from "chai";
import { readJson, writeJson } from "fs-extra/esm";
import { describe, it } from "mocha";
import { CleanOptions, type SimpleGit, simpleGit } from "simple-git";

import { loadBuildProject } from "../buildProject.js";
import { NotInGitRepository } from "../errors.js";
import {
	findGitRootSync,
	getChangedSinceRef,
	getFiles,
	getMergeBaseRemote,
	getPackageDirs,
	getRemote,
	isFileInPackageDir,
	listPackageJsonPaths,
} from "../git.js";
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

describe("isFileInPackageDir", () => {
	const packageDirs = new Set(["packages/alive"]);

	it("detects file inside known package dir", () => {
		expect(isFileInPackageDir("packages/alive/src/x.ts", packageDirs)).to.equal(true);
	});

	it("walks up from deeply nested paths", () => {
		expect(isFileInPackageDir("packages/alive/src/deep/nested/x.ts", packageDirs)).to.equal(
			true,
		);
	});

	it("returns false for root-only changes", () => {
		expect(isFileInPackageDir("README.md", packageDirs)).to.equal(false);
	});

	it("returns false for unrelated sibling directory", () => {
		expect(isFileInPackageDir("packages/other/src.ts", packageDirs)).to.equal(false);
	});

	it("returns false for empty input", () => {
		expect(isFileInPackageDir("", packageDirs)).to.equal(false);
	});

	it("does not treat root pseudo-dir as a per-package hit", () => {
		expect(isFileInPackageDir("some-root-file.md", new Set([".", "packages/alive"]))).to.equal(
			false,
		);
	});
});

/**
 * Builds a partial `SimpleGit` mock for unit-testing functions that only call `raw` and `fetch`.
 * Each entry in `rawResponses` is matched against the args of a `git.raw(...)` call in order.
 */
function makeGitMock(options: {
	rawResponses: ((args: readonly string[]) => string | Promise<string>)[];
	onFetch?: (args: readonly string[]) => void | Promise<void>;
}): SimpleGit {
	let rawCallIndex = 0;
	return {
		raw: async (...args: unknown[]): Promise<string> => {
			// `git.raw` is overloaded: callers may pass varargs or a single array.
			const flat: readonly string[] = (
				args.length === 1 && Array.isArray(args[0]) ? args[0] : args
			) as readonly string[];
			const responder = options.rawResponses[rawCallIndex++];
			if (responder === undefined) {
				throw new Error(
					`Unexpected git.raw call #${rawCallIndex} with args: ${flat.join(" ")}`,
				);
			}
			return responder(flat);
		},
		fetch: async (...args: unknown[]): Promise<unknown> => {
			const flat: readonly string[] = (
				args.length === 1 && Array.isArray(args[0]) ? args[0] : args
			) as readonly string[];
			await options.onFetch?.(flat);
			return undefined;
		},
	} as unknown as SimpleGit;
}

describe("getMergeBaseRemote", () => {
	it("deepens shallow clone and retries when merge-base is missing", async () => {
		const fetchCalls: string[][] = [];
		const statusMessages: string[] = [];
		const mock = makeGitMock({
			rawResponses: [
				// First merge-base attempt fails (e.g. shallow clone too shallow).
				(args) => {
					expect(args).to.deep.equal(["merge-base", "refs/remotes/origin/main", "HEAD"]);
					throw new Error("fatal: Not a valid object name");
				},
				// rev-parse --is-shallow-repository
				(args) => {
					expect(args).to.deep.equal(["rev-parse", "--is-shallow-repository"]);
					return "true\n";
				},
				// Retried merge-base after fetch --deepen
				(args) => {
					expect(args).to.deep.equal(["merge-base", "refs/remotes/origin/main", "HEAD"]);
					return "abc123\n";
				},
			],
			onFetch: (args) => {
				fetchCalls.push([...args]);
			},
		});

		const sha = await getMergeBaseRemote(mock, "main", "origin", "HEAD", (msg) =>
			statusMessages.push(msg),
		);

		expect(sha).to.equal("abc123");
		// First fetch is the initial `git.fetch([remote])`; second is the deepen.
		expect(fetchCalls).to.deep.equal([["origin"], ["--deepen", "1000", "origin", "main"]]);
		expect(statusMessages).to.have.lengthOf(1);
		expect(statusMessages[0]).to.match(/deepening and retrying/);
	});

	it("rethrows the original error when the repo is not shallow", async () => {
		const original = new Error("fatal: Not a valid object name");
		const mock = makeGitMock({
			rawResponses: [
				// merge-base refs/remotes/origin/main HEAD
				(args) => {
					expect(args).to.deep.equal(["merge-base", "refs/remotes/origin/main", "HEAD"]);
					throw original;
				},
				// rev-parse --is-shallow-repository
				(args) => {
					expect(args).to.deep.equal(["rev-parse", "--is-shallow-repository"]);
					return "false\n";
				},
			],
		});

		try {
			await getMergeBaseRemote(mock, "main", "origin");
			expect.fail("expected getMergeBaseRemote to throw");
		} catch (err) {
			expect(err).to.equal(original);
		}
	});

	it("rethrows the original error when no remote is provided", async () => {
		const original = new Error("fatal: Not a valid object name");
		const fetchCalls: string[][] = [];
		const statusMessages: string[] = [];
		const mock = makeGitMock({
			rawResponses: [
				// merge-base main HEAD
				(args) => {
					expect(args).to.deep.equal(["merge-base", "main", "HEAD"]);
					throw original;
				},
			],
			onFetch: (args) => {
				fetchCalls.push([...args]);
			},
		});

		try {
			await getMergeBaseRemote(mock, "main", undefined, "HEAD", (msg) =>
				statusMessages.push(msg),
			);
			expect.fail("expected getMergeBaseRemote to throw");
		} catch (err) {
			expect(err).to.equal(original);
		}
		expect(fetchCalls).to.deep.equal([]);
		expect(statusMessages).to.have.lengthOf(1);
		expect(statusMessages[0]).to.match(/no remote was provided/);
	});
});

describe("listPackageJsonPaths", () => {
	it("filters ls-files output to only package.json entries (no ref)", async () => {
		const mock = makeGitMock({
			rawResponses: [
				// ls-files
				(args) => {
					expect(args).to.deep.equal(["ls-files"]);
					return [
						"package.json",
						"packages/foo/package.json",
						"packages/foo/src/index.ts",
						"packages/foo/bar/baz/package.json",
						"README.md",
					].join("\n");
				},
			],
		});

		const result = await listPackageJsonPaths(mock);
		expect(result).to.deep.equal([
			"package.json",
			"packages/foo/package.json",
			"packages/foo/bar/baz/package.json",
		]);
	});

	it("filters ls-tree output to only package.json entries (with ref)", async () => {
		const mock = makeGitMock({
			rawResponses: [
				// ls-tree -r --name-only abc123
				(args) => {
					expect(args).to.deep.equal(["ls-tree", "-r", "--name-only", "abc123"]);
					return [
						"package.json",
						"packages/foo/package.json",
						"packages/foo/src/index.ts",
					].join("\n");
				},
			],
		});

		const result = await listPackageJsonPaths(mock, "abc123");
		expect(result).to.deep.equal(["package.json", "packages/foo/package.json"]);
	});

	it("excludes paths that merely end with .json or contain package.json as a substring", async () => {
		const mock = makeGitMock({
			rawResponses: [
				// ls-files
				(args) => {
					expect(args).to.deep.equal(["ls-files"]);
					return [
						"not-a-package.json.bak",
						"package.jsonc",
						"docs/package.json.md",
						"packages/foo/package.json",
					].join("\n");
				},
			],
		});

		const result = await listPackageJsonPaths(mock);
		expect(result).to.deep.equal(["packages/foo/package.json"]);
	});
});

describe("listPackageJsonPaths: staged deletion (local)", () => {
	// Root simpleGit at testRepoRoot so git's output paths come back testRepo-relative; the
	// underlying repo is still the main FF repo (testRepo is a directory inside it, not its
	// own git repo), so `ls-files` / `ls-tree HEAD` work as usual.
	const git = simpleGit(testRepoRoot);
	const targetPkgRel = "packages/group3/pkg-g/package.json";
	const targetPkgAbs = path.join(testRepoRoot, targetPkgRel);
	const targetDir = path.posix.dirname(targetPkgRel);

	beforeEach(async () => {
		// Stage the deletion of an existing tracked package.json.
		await git.rm([targetPkgAbs]);
	});

	afterEach(async () => {
		// Restore both the index entry and the working-tree file.
		await git.reset(["HEAD", "--", targetPkgAbs]);
		await git.checkout(["HEAD", "--", targetPkgAbs]);
	});

	it("excludes a staged-for-deletion package.json from the no-ref listing", async () => {
		const paths = await listPackageJsonPaths(git);
		expect(paths).to.not.include(targetPkgRel);
	});

	it("still lists the deleted package.json at HEAD", async () => {
		const paths = await listPackageJsonPaths(git, "HEAD");
		expect(paths).to.include(targetPkgRel);
	});

	it("excludes the staged-for-deletion package dir from getPackageDirs (no ref)", async () => {
		const dirs = await getPackageDirs(git);
		expect(dirs.has(targetDir)).to.equal(false);
	});

	it("still includes the package dir at HEAD", async () => {
		const dirs = await getPackageDirs(git, "HEAD");
		expect(dirs.has(targetDir)).to.equal(true);
	});
});

describe("getPackageDirs", () => {
	it("returns dirnames of all package.json paths and excludes only the repo root", async () => {
		const mock = makeGitMock({
			rawResponses: [
				// ls-files
				(args) => {
					expect(args).to.deep.equal(["ls-files"]);
					return [
						"package.json",
						"packages/foo/package.json",
						"packages/bar/package.json",
						"server/package.json",
					].join("\n");
				},
			],
		});

		const result = await getPackageDirs(mock);
		expect([...result].sort()).to.deep.equal(["packages/bar", "packages/foo", "server"]);
	});
});
