/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runCommand } from "@oclif/test";
import { expect } from "chai";
import { describe, it } from "mocha";

import { normalizeTargetBranch } from "../../../library/branches.js";
import { testRepoRoot } from "../../init.js";

describe("normalizeTargetBranch", () => {
	it("strips refs/heads prefix", () => {
		expect(normalizeTargetBranch("refs/heads/main")).to.equal("main");
	});

	it("passes plain branch names through", () => {
		expect(normalizeTargetBranch("next")).to.equal("next");
	});

	it("preserves slashes after the prefix", () => {
		expect(normalizeTargetBranch("refs/heads/release/2.x")).to.equal("release/2.x");
	});

	it("returns empty string for empty input", () => {
		expect(normalizeTargetBranch("")).to.equal("");
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
