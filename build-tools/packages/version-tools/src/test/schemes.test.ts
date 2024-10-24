/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";

import { detectVersionScheme, getLatestReleaseFromList } from "../schemes";

const pre1VersionList = [
	"0.59.1000-61898",
	"0.59.3001",
	"0.59.3002",
	"0.59.3003",
	"0.59.4000-71128",
	"0.59.4000-71130",
	"0.59.4002",
	"0.60.1000-98765",
];

const post1VersionList = [
	"1.2.2",
	"1.2.3-83900",
	"2.0.0-internal.1.0.0.81589",
	"2.0.0-internal.1.0.0.81601",
	"2.0.0-internal.1.0.0.82159",
	"2.0.0-internal.1.0.0.82628",
	"2.0.0-internal.1.0.0.82693",
	"2.0.0-internal.1.0.0.83139",
	"2.0.0-internal.1.0.1.67543",
];

describe("detectVersionScheme", () => {
	it("detects 2.0.0-internal.1.0.0 is internal", () => {
		const input = `2.0.0-internal.1.0.0`;
		const expected = "internal";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects 2.0.0-internal.1.1.0 is internal", () => {
		const input = `2.0.0-internal.1.1.0`;
		const expected = "internal";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects 2.0.0-internal.1.0.0.85674 is internalPrerelease", () => {
		const input = `2.0.0-internal.1.0.0.85674`;
		const expected = "internalPrerelease";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects 2.0.0-dev.3.0.0.105091 is internalPrerelease", () => {
		const input = `2.0.0-dev.3.0.0.105091`;
		const expected = "internalPrerelease";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0 is internal", () => {
		const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0`;
		const expected = "internal";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects ~0.59.3002 is virtualPatch", () => {
		const input = `~0.59.3002`;
		const expected = "virtualPatch";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects ~0.59.1 is semver", () => {
		const input = `~0.59.1`;
		const expected = "semver";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects ^1.2.0 is semver", () => {
		const input = `^1.2.0`;
		const expected = "semver";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects ^0.24.0 is semver", () => {
		const input = `^0.24.0`;
		const expected = "semver";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects ~2.0.0-internal.1.0.0 is semver", () => {
		const input = `~2.0.0-internal.1.0.0`;
		const expected = "semver";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects 1.2.1001 is semver", () => {
		const input = `1.2.1001`;
		const expected = "semver";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects 0.0.0-105091-test is semver", () => {
		const input = `0.0.0-105091-test`;
		const expected = "semver";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects 2.1.0-281035-test is semver", () => {
		const input = `2.1.0-281035-test`;
		const expected = "semver";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects 2.4.3 is semver", () => {
		const input = `2.4.3`;
		const expected = "semver";
		assert.strictEqual(detectVersionScheme(input), expected);
	});
});

describe("getLatestReleaseFromList", () => {
	const versionList: string[] = [];
	versionList.push(...pre1VersionList, ...post1VersionList);

	it("detects 1.2.2 is latest release", () => {
		const expected = "1.2.2";
		const latest = getLatestReleaseFromList(versionList);
		assert.strictEqual(latest, expected);
	});

	it("detects 1.2.3 is latest release", () => {
		const expected = "1.2.3";
		versionList.push(expected);
		const latest = getLatestReleaseFromList(versionList);
		assert.strictEqual(latest, expected);
	});

	it("detects 2.0.0-internal.1.0.1 is latest release", () => {
		const expected = "2.0.0-internal.1.0.1";
		versionList.push(expected);
		const latest = getLatestReleaseFromList(versionList);
		assert.strictEqual(latest, expected);
	});

	it("detects 0.59.4002 is latest release (checks logic when list contains only pre-v1 versions)", () => {
		const expected = "0.59.4002";
		versionList.push(expected);
		const latest = getLatestReleaseFromList(pre1VersionList);
		assert.strictEqual(latest, expected);
	});
});
