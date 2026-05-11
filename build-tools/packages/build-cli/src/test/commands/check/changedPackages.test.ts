/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runCommand } from "@oclif/test";
import { expect } from "chai";
import { describe, it } from "mocha";

import {
	anyChangedFileInPackages,
	buildPackageDirSet,
	checkFullRunPatterns,
	normalizeTargetBranch,
} from "../../../commands/check/changedPackages.js";
import { testRepoRoot } from "../../init.js";

describe("flub check changedPackages helpers", () => {
	it("normalizeTargetBranch strips refs/heads prefix", () => {
		expect(normalizeTargetBranch("refs/heads/main")).to.equal("main");
	});

	it("normalizeTargetBranch passes plain branch names through", () => {
		expect(normalizeTargetBranch("next")).to.equal("next");
	});

	it("normalizeTargetBranch preserves slashes after the prefix", () => {
		expect(normalizeTargetBranch("refs/heads/release/2.x")).to.equal("release/2.x");
	});

	it("normalizeTargetBranch returns empty string for empty input", () => {
		expect(normalizeTargetBranch("")).to.equal("");
	});

	for (const [file, expectedSource] of [
		["pnpm-lock.yaml", "^pnpm-lock\\.yaml$"],
		[".pnpmfile.cjs", "^\\.pnpmfile\\.cjs$"],
		[".npmrc", "^\\.npmrc$"],
		[".nvmrc", "^\\.nvmrc$"],
		["package.json", "^package\\.json$"],
	] as const) {
		it(`checkFullRunPatterns matches ${file}`, () => {
			const match = checkFullRunPatterns([file]);
			expect(match).to.not.equal(undefined);
			expect(match?.source).to.equal(expectedSource);
		});
	}

	it("checkFullRunPatterns matches tools prefix", () => {
		expect(checkFullRunPatterns(["tools/pipelines/build-client.yml"])).to.not.equal(undefined);
	});

	it("checkFullRunPatterns does not match nested package.json", () => {
		expect(checkFullRunPatterns(["packages/foo/package.json"])).to.equal(undefined);
	});

	it("checkFullRunPatterns matches root tsconfig only", () => {
		expect(checkFullRunPatterns(["tsconfig.base.json"])).to.not.equal(undefined);
		expect(checkFullRunPatterns(["packages/foo/tsconfig.json"])).to.equal(undefined);
	});

	it("checkFullRunPatterns returns undefined when nothing matches", () => {
		expect(checkFullRunPatterns(["packages/foo/src/x.ts"])).to.equal(undefined);
	});

	it("checkFullRunPatterns returns the first pattern hit when several qualify", () => {
		const match = checkFullRunPatterns(["pnpm-lock.yaml", "biome.jsonc"]);
		expect(match).to.not.equal(undefined);
		expect(match?.source).to.equal("^pnpm-lock\\.yaml$");
	});

	it("buildPackageDirSet unions historical and current packages", () => {
		const dirs = buildPackageDirSet(
			"sha",
			() => ["packages/old/package.json", "packages/shared/package.json"],
			() => ["packages/shared/package.json", "packages/new/package.json"],
		);
		expect([...dirs].sort()).to.deep.equal([
			"packages/new",
			"packages/old",
			"packages/shared",
		]);
	});

	it("buildPackageDirSet maps a root-level package.json to dot", () => {
		const dirs = buildPackageDirSet(
			"sha",
			() => ["package.json"],
			() => [],
		);
		expect([...dirs]).to.deep.equal(["."]);
	});

	it("buildPackageDirSet tolerates either package list being empty", () => {
		expect(
			buildPackageDirSet(
				"sha",
				() => [],
				() => [],
			).size,
		).to.equal(0);
		expect(
			buildPackageDirSet(
				"sha",
				() => ["packages/a/package.json"],
				() => [],
			).size,
		).to.equal(1);
	});

	const packageDirs = new Set(["packages/alive"]);

	it("anyChangedFileInPackages detects file inside known package dir", () => {
		expect(anyChangedFileInPackages(["packages/alive/src/x.ts"], packageDirs)).to.equal(true);
	});

	it("anyChangedFileInPackages returns false for root-only changes", () => {
		expect(anyChangedFileInPackages(["README.md"], packageDirs)).to.equal(false);
	});

	it("anyChangedFileInPackages returns false for unrelated sibling directory", () => {
		expect(anyChangedFileInPackages(["packages/other/src.ts"], packageDirs)).to.equal(false);
	});

	it("anyChangedFileInPackages ignores empty file entries", () => {
		expect(anyChangedFileInPackages(["", "packages/alive/src.ts"], packageDirs)).to.equal(
			true,
		);
	});

	it("anyChangedFileInPackages walks up from nested paths to find ancestor", () => {
		expect(
			anyChangedFileInPackages(["packages/alive/src/deeply/nested/x.ts"], packageDirs),
		).to.equal(true);
	});

	it("anyChangedFileInPackages does not treat root pseudo-dir as a per-package hit", () => {
		expect(
			anyChangedFileInPackages(["some-root-file.md"], new Set([".", "packages/alive"])),
		).to.equal(false);
	});
});

describe("flub check changedPackages", () => {
	it("falls back to a full test run when target branch is missing", async () => {
		const { stdout } = await runCommand(
			["check changedPackages", "--searchPath", testRepoRoot, "--quiet"],
			{ root: import.meta.url },
		);

		expect(stdout).to.contain("shouldRunTests=true");
		expect(stdout).to.contain("scopedPnpmFilter=");
		expect(stdout).to.contain(
			"##vso[task.setvariable variable=shouldRunTests;isOutput=true]true",
		);
		expect(stdout).to.contain(
			"##vso[task.setvariable variable=scopedPnpmFilter;isOutput=true]",
		);
	});

	it("returns structured JSON without throwing on safe fallback", async () => {
		const { stdout, error } = await runCommand(
			["check changedPackages", "--searchPath", testRepoRoot, "--json", "--quiet"],
			{ root: import.meta.url },
		);

		expect(error).to.equal(undefined);
		const output = JSON.parse(stdout) as {
			shouldRunTests: boolean;
			scopedPnpmFilter: string;
			changedPackageCount: number;
		};
		expect(output.shouldRunTests).to.equal(true);
		expect(output.scopedPnpmFilter).to.equal("");
		expect(output.changedPackageCount).to.equal(0);
	});
});
