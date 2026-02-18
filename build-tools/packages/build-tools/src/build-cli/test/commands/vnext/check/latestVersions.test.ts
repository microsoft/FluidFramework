/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EOL } from "node:os";
import { runCommand } from "@oclif/test";
import { expect } from "chai";
import { describe, it } from "mocha";
import { testRepoRoot } from "../../../init.js";

/**
 * This list of git tags is deliberately unordered since often the list provided to commands is unordered.
 */
const test_tags = ["group2_v1.0.0", "group3_v1.2.3"];

/**
 * Convenience function to check if a particular line of stdout output equals the expected value.
 *
 * @param stdout - the complete stdout string.
 * @param lineIndex - the index of the line to check.
 * @param testValue - the value to test against
 * @returns An assertion that will fail if the line doesn't match the value and pass if it does.
 */
function stdoutLineEquals(stdout: string, lineIndex: number, testValue: string): void {
	const lines = stdout.split(EOL);
	if (lineIndex > lines.length) {
		console.error(lines);
		throw new Error(
			`stdout only split into ${lines.length} lines, but lineIndex is ${lineIndex}.`,
		);
	}
	expect(lines[lineIndex]).to.equal(testValue);
}

describe("vnext:check:latestVersions", () => {
	it("should set shouldDeploy to true if input version is the latest version", async () => {
		const version = "1.0.0";
		const releaseGroup = "group2";

		const { stdout } = await runCommand(
			[
				"vnext:check:latestVersions",
				"--releaseGroup",
				releaseGroup,
				"--version",
				version,
				"--tags",
				...test_tags,
				"--searchPath",
				testRepoRoot,
			],
			{
				root: import.meta.url,
			},
		);

		stdoutLineEquals(
			stdout,
			0,
			`Version ${version} is the latest version for major version 1`,
		);
		stdoutLineEquals(
			stdout,
			1,
			"##vso[task.setvariable variable=shouldDeploy;isoutput=true]true",
		);
	});

	it("should set shouldDeploy to false if input version is not the latest version", async () => {
		const version = "1.0.0";
		const releaseGroup = "group3";

		const { stdout } = await runCommand(
			[
				"vnext:check:latestVersions",
				"--releaseGroup",
				releaseGroup,
				"--version",
				version,
				"--tags",
				...test_tags,
				"--searchPath",
				testRepoRoot,
			],
			{
				root: import.meta.url,
			},
		);

		stdoutLineEquals(
			stdout,
			0,
			"##[warning]skipping deployment stage. input version 1.0.0 does not match the latest version 1.2.3",
		);
		stdoutLineEquals(
			stdout,
			1,
			"##vso[task.setvariable variable=shouldDeploy;isoutput=true]false",
		);
	});

	it("should set shouldDeploy to false if no versions are found", async () => {
		const version = "2.0.0";
		const releaseGroup = "group2";

		const { stdout } = await runCommand(
			[
				"vnext:check:latestVersions",
				"--releaseGroup",
				releaseGroup,
				"--version",
				version,
				"--tags",
				...test_tags,
				"--searchPath",
				testRepoRoot,
			],
			{
				root: import.meta.url,
			},
		);

		stdoutLineEquals(
			stdout,
			0,
			"##[warning]No major version found corresponding to input version 2.0.0",
		);
		stdoutLineEquals(
			stdout,
			1,
			"##vso[task.setvariable variable=shouldDeploy;isoutput=true]false",
		);
	});
});
