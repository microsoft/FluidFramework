/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EOL } from "node:os";
import { runCommand } from "@oclif/test";
import { expect } from "chai";
import { afterEach, describe, it } from "mocha";
import mockedEnv from "mocked-env";

/**
 * This list of git tags is deliberately unordered since often the list provided to commands is unordered.
 */
const test_tags = [
	"client_v2.0.0-internal.1.0.0",
	"client_v1.2.4",
	"client_v1.2.3",
	"client_v2.0.0-rc.1.0.0",
	"client_v2.0.0",
	"client_v2.0.0-rc.1.0.1",
	"client_v2.0.1",
	"client_v2.0.0-rc.2.0.0",
	"client_v2.1.1",
	"client_v2.0.0-rc.5.0.0",
	"client_v2.0.0-rc.3.0.0",
	"client_v2.0.0-rc.4.0.0",
	"client_v2.1.0",
	"build-tools_v0.5.2001",
	"build-tools_v0.4.2001",
	"client_v2.0.0-rc.6.0.0",
	"build-tools_v0.4.1000",
	"build-tools_v0.3.2000",
	"build-tools_v0.4.2000",
];

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

describe("generate:buildVersion", () => {
	let restore = mockedEnv.default({}, { clear: true });

	afterEach(() => restore());

	it("outputs prerelease build number", async () => {
		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"0.4.0",
				"--tag",
				"build-tools",
				"--release",
				"none",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=0.4.0-12345");
	});

	it("reads build number from env variable", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "88802",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--fileVersion",
				"0.4.0",
				"--tag",
				"build-tools",
				"--release",
				"none",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=0.4.0-88802");
	});

	it("calculates patch version number correctly", async () => {
		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"0.4.0",
				"--tag",
				"build-tools",
				"--release",
				"none",
				"--patch",
				"true",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=0.4.12345");
	});

	it("reads patch setting from env variable", async () => {
		restore = mockedEnv.default(
			{
				VERSION_PATCH: "true",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"0.4.0",
				"--tag",
				"build-tools",
				"--release",
				"none",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=0.4.12345");
	});

	it("outputs isLatest=true when release is release", async () => {
		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"0.5.2002",
				"--tag",
				"build-tools",
				"--release",
				"release",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=0.5.2002");
		stdoutLineEquals(stdout, 2, "isLatest=true");
	});

	it("outputs isLatest=false when release is prerelease", async () => {
		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"0.5.2002",
				"--tag",
				"build-tools",
				"--release",
				"prerelease",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=0.5.2002-12345");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("reads release setting from env variable", async () => {
		restore = mockedEnv.default(
			{
				VERSION_RELEASE: "release",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"0.5.2002",
				"--tag",
				"build-tools",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=0.5.2002");
		stdoutLineEquals(stdout, 2, "isLatest=true");
	});

	it("reads tag name from env variable", async () => {
		restore = mockedEnv.default(
			{
				VERSION_TAGNAME: "build-tools",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"0.5.2002",
				"--release",
				"release",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=0.5.2002");
		stdoutLineEquals(stdout, 2, "isLatest=true");
	});

	it("isLatest=false when including internal versions when determining what's latest", async () => {
		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"1.2.4",
				"--tag",
				"client",
				"--release",
				"none",
				"--includeInternalVersions",
				"true",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 1, "version=1.2.4-12345");
		stdoutLineEquals(stdout, 3, "isLatest=false");
	});

	it("outputs prerelease build number", async () => {
		restore = mockedEnv.default(
			{
				VERSION_INCLUDE_INTERNAL_VERSIONS: "True",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"1.2.4",
				"--tag",
				"client",
				"--release",
				"none",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 1, "version=1.2.4-12345");
		stdoutLineEquals(stdout, 3, "isLatest=false");
	});

	it("calculates test build numbers correctly", async () => {
		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"1.2.4",
				"--tag",
				"client",
				"--release",
				"none",
				"--testBuild",
				"true",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 3, "version=0.0.0-12345-test");
		stdoutLineEquals(stdout, 5, "isLatest=false");
	});

	it("outputs prerelease build number", async () => {
		restore = mockedEnv.default(
			{
				TEST_BUILD: "true",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--build",
				"12345",
				"--fileVersion",
				"1.2.4",
				"--tag",
				"client",
				"--release",
				"none",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 3, "version=0.0.0-12345-test");
		stdoutLineEquals(stdout, 5, "isLatest=false");
	});

	it("tinylicious test case from 2022-08-26", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "88879",
				VERSION_TAGNAME: "tinylicious",
				TEST_BUILD: "false",
				VERSION_RELEASE: "release",
				VERSION_PATCH: "true",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--fileVersion",
				"0.4.0",
				"--tag",
				"tinylicious",
				"--tags",
				"tinylicious_v0.2.0",
				"tinylicious_v0.2.3810",
				"tinylicious_v0.3.10860",
				"tinylicious_v0.4.0",
				"tinylicious_v0.4.11798",
				"tinylicious_v0.4.13835",
				"tinylicious_v0.4.17169",
				"tinylicious_v0.4.18879",
				"tinylicious_v0.4.21640",
				"tinylicious_v0.4.34614",
				"tinylicious_v0.4.38350",
				"tinylicious_v0.4.45136",
				"tinylicious_v0.4.57763",
				"tinylicious_v0.4.86381",
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=0.4.88879");
		stdoutLineEquals(stdout, 2, "isLatest=true");
	});

	it("lts test case from 2022-10-13", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "100339",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "false",
				VERSION_RELEASE: "prerelease",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--fileVersion",
				"1.3.0",
				"--tags",
				"client_v1.0.0",
				"client_v1.0.1",
				"client_v1.0.2",
				"client_v1.1.0",
				"client_v1.1.1",
				"client_v1.1.2",
				"client_v1.2.0",
				"client_v1.2.1",
				"client_v1.2.2",
				"client_v1.2.3",
				"client_v1.2.4",
				"client_v1.2.5",
				"client_v1.2.6",
				"client_v1.2.7",
				"client_v2.0.0-internal.1.0.0",
				"client_v2.0.0-internal.1.0.1",
				"client_v2.0.0-internal.1.1.0",
				"client_v2.0.0-internal.1.1.1",
				"client_v2.0.0-internal.1.1.2",
				"client_v2.0.0-internal.1.1.3",
				"client_v2.0.0-internal.1.1.4",
				"client_v2.0.0-internal.1.2.0",
				"client_v2.0.0-internal.1.2.1",
				"client_v2.0.0-internal.1.2.2",
				"client_v2.0.0-internal.1.4.0",
				"client_v2.0.0-internal.1.4.1",
				"client_v2.0.0-internal.1.4.2",
			],
			{ root: import.meta.url },
		);
		stdoutLineEquals(stdout, 0, "version=1.3.0-100339");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("RC version, prerelease", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "212045",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "false",
				VERSION_RELEASE: "prerelease",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--fileVersion",
				"2.0.0-rc.3.0.0",
				"--tag",
				"client",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 1, "version=2.0.0-dev-rc.3.0.0.212045");
		stdoutLineEquals(stdout, 3, "isLatest=false");
	});

	it("RC version, test", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "212045",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "true",
				VERSION_RELEASE: "prerelease",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			[
				"generate:buildVersion",
				"--fileVersion",
				"2.0.0-rc.3.0.0",
				"--tag",
				"client",
				"--tags",
				...test_tags,
			],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 3, "version=0.0.0-212045-test");
		stdoutLineEquals(stdout, 5, "isLatest=false");
	});

	it("RC version, release", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "212045",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "false",
				VERSION_RELEASE: "release",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "2.0.0-rc.7.0.0", "--tags", ...test_tags],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=2.0.0-rc.7.0.0");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("major version, release", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "212045",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "false",
				VERSION_RELEASE: "release",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "3.0.0", "--tags", ...test_tags],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=3.0.0");
		stdoutLineEquals(stdout, 2, "isLatest=true");
	});

	it("major version, prerelease", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "212045",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "false",
				VERSION_RELEASE: "prerelease",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "3.0.0", "--tags", ...test_tags],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=3.0.0-212045");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("major version, test", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "212045",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "true",
				VERSION_RELEASE: "prerelease",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "3.0.0", "--tags", ...test_tags],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 2, "version=0.0.0-212045-test");
		stdoutLineEquals(stdout, 4, "isLatest=false");
	});

	it("next unpublished patch version on latest minor (2.1.2) returns isLatest true", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "212045",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "false",
				VERSION_RELEASE: "release",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "True",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "2.1.2", "--tags", ...test_tags],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=2.1.2");
		stdoutLineEquals(stdout, 2, "isLatest=true");
	});

	it("next unpublished patch version on non-latest minor (2.0.2) returns isLatest false", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "212045",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "false",
				VERSION_RELEASE: "release",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "True",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "2.0.2", "--tags", ...test_tags],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=2.0.2");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("next unpublished minor version (2.2.0) returns isLatest true", async () => {
		restore = mockedEnv.default(
			{
				VERSION_BUILDNUMBER: "212045",
				VERSION_TAGNAME: "client",
				TEST_BUILD: "false",
				VERSION_RELEASE: "release",
				VERSION_INCLUDE_INTERNAL_VERSIONS: "True",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "2.2.0", "--tags", ...test_tags],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=2.2.0");
		stdoutLineEquals(stdout, 2, "isLatest=true");
	});
});

describe("generate:buildVersion for alpha/beta", () => {
	let restore = mockedEnv.default({}, { clear: true });

	afterEach(() => restore());

	const defaultEnv = {
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
	};

	it("tagName: client, release: prerelease, types: alpha", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				PACKAGE_TYPES_FIELD: "alpha",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 0, "version=0.4.0-88879-alpha-types");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("tagName: client, release: prerelease, types: beta", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				PACKAGE_TYPES_FIELD: "beta",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 0, "version=0.4.0-88879-beta-types");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("tagName: client, release: prerelease, types: none", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				PACKAGE_TYPES_FIELD: "none",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 0, "version=0.4.0-88879");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("tagName: client, release: prerelease, types: public", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				PACKAGE_TYPES_FIELD: "public",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 0, "version=0.4.0-88879");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("tagName: client, release: prerelease, types: untrimmed", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				PACKAGE_TYPES_FIELD: "untrimmed",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 0, "version=0.4.0-88879");
		stdoutLineEquals(stdout, 2, "isLatest=false");
	});

	it("tagName: client, release: release, types: untrimmed", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				VERSION_RELEASE: "release",
				PACKAGE_TYPES_FIELD: "untrimmed",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 0, "version=0.4.0");
	});

	it("tagName: client, release: release, types: public", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				VERSION_RELEASE: "release",
				PACKAGE_TYPES_FIELD: "public",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 0, "version=0.4.0");
	});

	it("tagName: client, release: prerelease, test-build: true, types: alpha", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				TEST_BUILD: "true",
				PACKAGE_TYPES_FIELD: "alpha",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 2, "version=0.0.0-88879-test-alpha-types");
		stdoutLineEquals(stdout, 4, "isLatest=false");
	});

	it("tagName: client, release: prerelease, test-build: true, types: beta", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				TEST_BUILD: "true",
				PACKAGE_TYPES_FIELD: "beta",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 2, "version=0.0.0-88879-test-beta-types");
		stdoutLineEquals(stdout, 4, "isLatest=false");
	});

	it("tagName: client, release: prerelease, test-build: true, types: none", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				TEST_BUILD: "true",
				PACKAGE_TYPES_FIELD: "none",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 2, "version=0.0.0-88879-test");
		stdoutLineEquals(stdout, 4, "isLatest=false");
	});

	it("tagName: client, release: prerelease, test-build: true, types: public", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				TEST_BUILD: "true",
				PACKAGE_TYPES_FIELD: "public",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(["generate:buildVersion", "--fileVersion", "0.4.0"], {
			root: import.meta.url,
		});
		stdoutLineEquals(stdout, 2, "version=0.0.0-88879-test");
		stdoutLineEquals(stdout, 4, "isLatest=false");
	});

	it("tagName: client, release: prerelease, test-build: false, types: alpha", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				PACKAGE_TYPES_FIELD: "alpha",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "2.0.0-dev.7.1.0"],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=2.0.0-dev.7.1.0.88879-alpha-types");
	});

	it("tagName: client, release: prerelease, test-build: false, types: beta", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				PACKAGE_TYPES_FIELD: "beta",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "2.0.0-dev.7.1.0"],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=2.0.0-dev.7.1.0.88879-beta-types");
	});

	it("tagName: client, release: prerelease, test-build: false, types: public", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				PACKAGE_TYPES_FIELD: "public",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "2.0.0-dev.7.1.0"],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=2.0.0-dev.7.1.0.88879");
	});

	it("tagName: client, release: prerelease, test-build: false, types: untrimmed", async () => {
		restore = mockedEnv.default(
			{
				...defaultEnv,
				PACKAGE_TYPES_FIELD: "untrimmed",
			},
			{ clear: true },
		);

		const { stdout } = await runCommand(
			["generate:buildVersion", "--fileVersion", "2.0.0-dev.7.1.0"],
			{
				root: import.meta.url,
			},
		);
		stdoutLineEquals(stdout, 0, "version=2.0.0-dev.7.1.0.88879");
	});
});
