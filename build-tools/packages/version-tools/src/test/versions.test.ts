/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, expect } from "chai";
import * as semver from "semver";

import { getVersionRange } from "../internalVersionScheme";
import { generateLegacyCompatRange, getIsLatest, getSimpleVersion } from "../versions";

// Deliberately not sorted here; highest version is 0.59.3000
const test_tags = [
	"client_v0.59.1001-62246",
	"client_v0.59.2000-63294",
	"client_v0.59.2002",
	"client_v0.59.1000",
	"client_v0.59.3000-67119",
	"client_v0.59.3000",
	"client_v0.59.2001",
	"client_v0.59.3000-66610",
	"client_v0.59.2000",
	"client_v0.59.1001",
];

describe("getSimpleVersion", () => {
	it("version with id, no prerelease", () => {
		assert.equal(getSimpleVersion("0.15.0", "12345.0", false, true), "0.15.12345");
		assert.equal(getSimpleVersion("0.15.0", "12345.0", true, true), "0.15.12345");
	});

	it("version with id, with prerelease", () => {
		assert.equal(getSimpleVersion("0.15.0-rc", "12345.0", false, true), "0.15.12345-rc");
		assert.equal(
			getSimpleVersion("0.15.0-alpha.1", "12345.0", false, true),
			"0.15.12345-alpha.1",
		);
		assert.equal(
			getSimpleVersion("0.15.0-beta.2.1", "12345.0", false, true),
			"0.15.12345-beta.2.1",
		);
		assert.equal(getSimpleVersion("0.15.0-beta", "12345.0", true, true), "0.15.12345-beta");
	});

	it("version no id, no prerelease", () => {
		assert.equal(getSimpleVersion("0.16.0", "12345.0", false, false), "0.16.0-12345.0");
		assert.equal(getSimpleVersion("0.16.0", "12345.0", true, false), "0.16.0");
	});

	it("version no id, with prerelease", () => {
		assert.equal(getSimpleVersion("0.16.0-rc", "12345.0", false, false), "0.16.0-rc.12345.0");
		assert.equal(
			getSimpleVersion("0.16.0-alpha.1", "12345.0", false, false),
			"0.16.0-alpha.1.12345.0",
		);
		assert.equal(
			getSimpleVersion("0.16.0-beta.2.1", "12345.0", false, false),
			"0.16.0-beta.2.1.12345.0",
		);
		assert.equal(getSimpleVersion("0.16.0-beta", "12345.0", true, false), "0.16.0-beta");
	});

	describe("Fluid internal versions", () => {
		it("dev/PR build versions", () => {
			const input = "2.0.0-internal.1.3.0";
			const expected = "2.0.0-dev.1.3.0.93923";
			const result = getSimpleVersion(input, "93923", false, false);
			expect(result).to.equal(expected);

			const range = getVersionRange("2.0.0-internal.1.3.0", "^");
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			expect(semver.satisfies(result, range)).to.be.false;
		});

		it("release versions", () => {
			const input = "2.0.0-internal.1.3.0";
			const expected = "2.0.0-internal.1.3.0";
			const result = getSimpleVersion(input, "93923", true, false);
			expect(result).to.equal(expected);

			const range = getVersionRange("2.0.0-internal.1.3.0", "^");
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			expect(semver.satisfies(result, range)).to.be.true;
		});

		it("simple patch scheme should throw with Fluid internal versions", () => {
			const input = "2.0.0-internal.1.3.0";
			expect(() => getSimpleVersion(input, "93923", false, true)).to.throw();
		});

		it("release + simple patch scheme should throw with Fluid internal versions", () => {
			const input = "2.0.0-internal.1.3.0";
			expect(() => getSimpleVersion(input, "93923", true, true)).to.throw();
		});
	});
});

describe("getIsLatest", () => {
	it("basic functionality", () => {
		assert.isTrue(getIsLatest("client", "0.59.4000", test_tags));
		assert.isFalse(getIsLatest("client", "0.59.4000-1234", test_tags));
	});

	it("highest version should be 0.59.3000", () => {
		assert.isTrue(getIsLatest("client", "0.59.4000", test_tags));
		assert.isTrue(getIsLatest("client", "0.59.3001", test_tags));
		assert.isFalse(getIsLatest("client", "0.59.4000-1234", test_tags));
		assert.isFalse(getIsLatest("client", "0.60.1000-1234", test_tags));
	});

	it("highest version should be 0.60.2000", () => {
		// Add a higher version tag to simulate a release
		// Highest version is now 0.60.2000
		test_tags.push("client_v0.60.1000", "client_v0.60.2000");
		assert.isTrue(getIsLatest("client", "0.60.3000", test_tags));
		assert.isFalse(getIsLatest("client", "0.59.4000", test_tags));
		assert.isFalse(getIsLatest("client", "0.60.1001", test_tags));
		assert.isFalse(getIsLatest("client", "0.59.4001-1234", test_tags));
		assert.isFalse(getIsLatest("client", "0.60.3000-1234", test_tags));
	});

	// Add a Fluid internal release version
	// Deliberately not sorted here; highest version is 2.0.0-internal.1.0.0
	const post1_tags = [
		"client_v1.0.0",
		"client_v1.2.3",
		"client_v1.2.3-63294",
		"client_v2.0.0-internal.1.0.0",
		"client_v2.0.0-internal.1.0.1.12345",
		"client_v0.59.1000",
		"client_v0.59.3000-67119",
		"client_v0.59.3000",
		"client_v0.59.2001",
		"client_v0.59.3000-66610",
		"client_v0.59.2000",
		"client_v0.59.1001",
	];

	it("includeInternalVersions === true", () => {
		// By default, getIsLatest filters out Fluid internal versions. This can be changed with an argument, so these
		// tests check that isLatest returns
		it("2.0.0-internal.1.0.0 is latest", () => {
			assert.isTrue(getIsLatest("client", "2.0.0-internal.1.0.0", post1_tags, true));
		});

		it("1.2.3 is not latest", () => {
			assert.isFalse(getIsLatest("client", "1.2.3", post1_tags, true));
		});

		it("2.0.0-internal.1.0.1.12345 is not latest", () => {
			assert.isTrue(getIsLatest("client", "2.0.0-internal.1.0.1.12345", post1_tags, true));
		});

		it("pre 1.0 builds are not latest", () => {
			assert.isFalse(getIsLatest("client", "0.59.4000", post1_tags, true));
			assert.isFalse(getIsLatest("client", "0.59.3001", post1_tags, true));
		});

		assert.isFalse(getIsLatest("client", "1.2.3", post1_tags, true));
	});
});

describe("legacy compat ranges", () => {
	it("legacy compat: 2.0.9 and compat version interval 10", () => {
		const input = `2.0.9`;
		const expected = `>=2.0.9 <2.10.0`;
		const range = generateLegacyCompatRange(input, 10);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.8.10 and compat version interval 10", () => {
		const input = `2.8.10`;
		const expected = `>=2.8.10 <2.10.0`;
		const range = generateLegacyCompatRange(input, 10);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.0.9 and compat version interval 20", () => {
		const input = `2.0.9`;
		const expected = `>=2.0.9 <2.20.0`;
		const range = generateLegacyCompatRange(input, 20);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.8.10 and compat version interval 20", () => {
		const input = `2.8.10`;
		const expected = `>=2.8.10 <2.20.0`;
		const range = generateLegacyCompatRange(input, 20);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.18.10 and compat version interval 20", () => {
		const input = `2.18.10`;
		const expected = `>=2.18.10 <2.20.0`;
		const range = generateLegacyCompatRange(input, 20);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.0.10 and compat version interval 20", () => {
		const input = `2.0.10`;
		const expected = `>=2.0.10 <2.20.0`;
		const range = generateLegacyCompatRange(input, 20);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.10.0 and compat version interval 20", () => {
		const input = `2.10.0`;
		const expected = `>=2.10.0 <2.20.0`;
		const range = generateLegacyCompatRange(input, 20);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.0.10 and compat version interval 25", () => {
		const input = `2.0.10`;
		const expected = `>=2.0.10 <2.25.0`;
		const range = generateLegacyCompatRange(input, 25);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.10.0 and compat version interval 25", () => {
		const input = `2.10.0`;
		const expected = `>=2.10.0 <2.25.0`;
		const range = generateLegacyCompatRange(input, 25);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.25.0 and compat version interval 25", () => {
		const input = `2.25.0`;
		const expected = `>=2.25.0 <2.50.0`;
		const range = generateLegacyCompatRange(input, 25);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.0.10 and compat version interval 40", () => {
		const input = `2.0.10`;
		const expected = `>=2.0.10 <2.40.0`;
		const range = generateLegacyCompatRange(input, 40);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.10.0 and compat version interval 40", () => {
		const input = `2.10.0`;
		const expected = `>=2.10.0 <2.40.0`;
		const range = generateLegacyCompatRange(input, 40);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.39.10 and compat version interval 40", () => {
		const input = `2.39.10`;
		const expected = `>=2.39.10 <2.40.0`;
		const range = generateLegacyCompatRange(input, 40);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.40.10 and compat version interval 40", () => {
		const input = `2.40.10`;
		const expected = `>=2.40.10 <2.80.0`;
		const range = generateLegacyCompatRange(input, 40);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.0.10 and compat version interval 30", () => {
		const input = `2.0.10`;
		const expected = `>=2.0.10 <2.30.0`;
		const range = generateLegacyCompatRange(input, 30);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.10.0 and compat version interval 30", () => {
		const input = `2.10.0`;
		const expected = `>=2.10.0 <2.30.0`;
		const range = generateLegacyCompatRange(input, 30);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.0.10 and compat version interval 50", () => {
		const input = `2.0.10`;
		const expected = `>=2.0.10 <2.50.0`;
		const range = generateLegacyCompatRange(input, 50);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.10.0 and compat version interval 50", () => {
		const input = `2.10.0`;
		const expected = `>=2.10.0 <2.50.0`;
		const range = generateLegacyCompatRange(input, 50);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.0.10 and compat version interval 200", () => {
		const input = `2.0.10`;
		const expected = `>=2.0.10 <2.200.0`;
		const range = generateLegacyCompatRange(input, 200);
		assert.strictEqual(range, expected);
	});

	it("legacy compat: 2.10.0 and compat version interval 200", () => {
		const input = `2.10.0`;
		const expected = `>=2.10.0 <2.200.0`;
		const range = generateLegacyCompatRange(input, 200);
		assert.strictEqual(range, expected);
	});
});
