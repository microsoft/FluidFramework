/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect, test } from "@oclif/test";

/**
 * This list of git tags is deliberately unordered since often the list provided to commands is unordered.
 */
const test_tags = [
	"client_v2.0.0-internal.1.0.0",
	"client_v1.2.4",
	"client_v1.2.3",
	"client_v2.0.0-rc.1.0.0",
	"client_v2.0.0-rc.1.0.1",
	"client_v2.0.0-rc.2.0.0",
	"build-tools_v0.5.2002",
	"build-tools_v0.4.2001",
	"build-tools_v0.4.2000",
	"build-tools_v0.4.1000",
	"build-tools_v0.3.2000",
];

describe("generate:buildVersion", () => {
	test.timeout(10000)
		.stdout()
		.command([
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
		])
		.it("outputs prerelease build number", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.0-12345");
		});

	test.timeout(10000)
		.env({
			VERSION_BUILDNUMBER: "88802",
		})
		.stdout()
		.command([
			"generate:buildVersion",
			"--fileVersion",
			"0.4.0",
			"--tag",
			"build-tools",
			"--release",
			"none",
			"--tags",
			...test_tags,
		])
		.it("reads build number from env variable", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.0-88802");
		});

	test.stdout()
		.command([
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
		])
		.it("calculates patch version number correctly", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.12345");
		});

	test.env({
		VERSION_PATCH: "true",
	})
		.stdout()
		.command([
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
		])
		.it("reads patch setting from env variable", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.12345");
		});

	test.stdout()
		.command([
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
		])
		.it("outputs isLatest=true when release is release", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.5.2002");
			expect(ctx.stdout).to.contain("isLatest=true");
		});

	test.stdout()
		.command([
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
		])
		.it("outputs isLatest=false when release is prerelease", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.5.2002-12345");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_RELEASE: "release",
	})
		.stdout()
		.command([
			"generate:buildVersion",
			"--build",
			"12345",
			"--fileVersion",
			"0.5.2002",
			"--tag",
			"build-tools",
			"--tags",
			...test_tags,
		])
		.it("reads release setting from env variable", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.5.2002");
			expect(ctx.stdout).to.contain("isLatest=true");
		});

	test.env({
		VERSION_TAGNAME: "build-tools",
	})
		.stdout()
		.command([
			"generate:buildVersion",
			"--build",
			"12345",
			"--fileVersion",
			"0.5.2002",
			"--release",
			"release",
			"--tags",
			...test_tags,
		])
		.it("reads tag name from env variable", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.5.2002");
			expect(ctx.stdout).to.contain("isLatest=true");
		});

	test.stdout()
		.command([
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
		])
		.it(
			"isLatest=false when including internal versions when determining what's latest",
			(ctx) => {
				expect(ctx.stdout).to.contain("version=1.2.4");
				expect(ctx.stdout).to.contain("isLatest=false");
			},
		);

	test.env({
		VERSION_INCLUDE_INTERNAL_VERSIONS: "True",
	})
		.stdout()
		.command([
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
		])
		.it("reads internal versions setting from env variable", (ctx) => {
			expect(ctx.stdout).to.contain("version=1.2.4");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.stdout()
		.command([
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
		])
		.it("calculates test build numbers correctly", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.0.0-12345-test");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		TEST_BUILD: "true",
	})
		.stdout()
		.command([
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
		])
		.it("reads test build setting from env variable", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.0.0-12345-test");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "tinylicious",
		TEST_BUILD: "false",
		VERSION_RELEASE: "release",
		VERSION_PATCH: "true",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
	})
		.stdout()
		.command([
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
		])
		.it("tinylicious test case from 2022-08-26", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.88879");
			expect(ctx.stdout).to.contain("isLatest=true");
		});

	test.env({
		VERSION_BUILDNUMBER: "100339",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
	})
		.stdout()
		.command([
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
		])
		.it("lts test case from 2022-10-13", (ctx) => {
			expect(ctx.stdout).to.contain("version=1.3.0-100339");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "212045",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
	})
		.stdout()
		.command([
			"generate:buildVersion",
			"--fileVersion",
			"2.0.0-rc.3.0.0",
			"--tag",
			"client",
			"--tags",
			...test_tags,
		])
		.it("RC version, prerelease", (ctx) => {
			expect(ctx.stdout).to.contain("version=2.0.0-dev-rc.3.0.0.212045");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "212045",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "true",
		VERSION_RELEASE: "prerelease",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
	})
		.stdout()
		.command([
			"generate:buildVersion",
			"--fileVersion",
			"2.0.0-rc.3.0.0",
			"--tag",
			"client",
			"--tags",
			...test_tags,
		])
		.it("RC version, test", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.0.0-212045-test");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "212045",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "release",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
	})
		.stdout()
		.command([
			"generate:buildVersion",
			"--fileVersion",
			"2.0.0-rc.3.0.0",
			"--tags",
			...test_tags,
		])
		.it("RC version, release", (ctx) => {
			expect(ctx.stdout).to.contain("version=2.0.0-rc.3.0.0");
			expect(ctx.stdout).to.contain("isLatest=false");
		});
});

describe("generate:buildVersion for alpha/beta", () => {
	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "alpha",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, types: alpha", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.0-88879-alpha-types");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "beta",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, types: beta", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.0-88879-beta-types");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "none",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, types: none", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.0-88879");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "public",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, types: public", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.0-88879");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "untrimmed",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, types: untrimmed", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.0-88879");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "release",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "untrimmed",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: release, types: untrimmed", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.0");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "release",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "public",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: release, types: public", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.4.0");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "true",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "alpha",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, test-build: true, types: alpha", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.0.0-88879-test-alpha-types");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "true",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "beta",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, test-build: true, types: beta", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.0.0-88879-test-beta-types");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "true",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "none",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, test-build: true, types: none", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.0.0-88879-test");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "true",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "public",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, test-build: true, types: public", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.0.0-88879-test");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "true",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "untrimmed",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "0.4.0"])
		.it("tagName: client, release: prerelease, test-build: true, types: untrimmed", (ctx) => {
			expect(ctx.stdout).to.contain("version=0.0.0-88879-test");
			expect(ctx.stdout).to.contain("isLatest=false");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "alpha",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "2.0.0-dev.7.1.0"])
		.it("tagName: client, release: prerelease, test-build: false, types: alpha", (ctx) => {
			expect(ctx.stdout).to.contain("version=2.0.0-dev.7.1.0.88879-alpha-types");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "beta",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "2.0.0-dev.7.1.0"])
		.it("tagName: client, release: prerelease, test-build: false, types: beta", (ctx) => {
			expect(ctx.stdout).to.contain("version=2.0.0-dev.7.1.0.88879-beta-types");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "public",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "2.0.0-dev.7.1.0"])
		.it("tagName: client, release: prerelease, test-build: false, types: public", (ctx) => {
			expect(ctx.stdout).to.contain("version=2.0.0-dev.7.1.0.88879");
		});

	test.env({
		VERSION_BUILDNUMBER: "88879",
		VERSION_TAGNAME: "client",
		TEST_BUILD: "false",
		VERSION_RELEASE: "prerelease",
		VERSION_PATCH: "False",
		VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
		PACKAGE_TYPES_FIELD: "untrimmed",
	})
		.stdout()
		.command(["generate:buildVersion", "--fileVersion", "2.0.0-dev.7.1.0"])
		.it("tagName: client, release: prerelease, test-build: false, types: untrimmed", (ctx) => {
			expect(ctx.stdout).to.contain("version=2.0.0-dev.7.1.0.88879");
		});
});
