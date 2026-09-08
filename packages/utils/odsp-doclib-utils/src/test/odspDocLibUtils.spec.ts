/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { getAadTenant, isOdspHostname } from "../odspDocLibUtils.js";

describe("getAadTenant", () => {
	it("returns `onmicrosoft` tenant if ODSP personal site url is passed", () => {
		const result = getAadTenant("contoso-my.sharepoint.com");
		assert.strictEqual(result, "contoso.onmicrosoft.com");
	});

	it("returns `onmicrosoft` tenant if ODSP admin site url is passed", () => {
		const result = getAadTenant("contoso-admin.sharepoint.com");
		assert.strictEqual(result, "contoso.onmicrosoft.com");
	});

	it("returns `onmicrosoft` tenant if ODSP group site url is passed", () => {
		const result = getAadTenant("contoso.sharepoint.com");
		assert.strictEqual(result, "contoso.onmicrosoft.com");
	});

	it("returns `onmicrosoft` tenant if ODSP dogfood personal site url is passed", () => {
		const result = getAadTenant("contoso-my.sharepoint-df.com");
		assert.strictEqual(result, "contoso.onmicrosoft.com");
	});

	it("returns `onmicrosoft` tenant if ODSP dogfood admin site url is passed", () => {
		const result = getAadTenant("contoso-admin.sharepoint-df.com");
		assert.strictEqual(result, "contoso.onmicrosoft.com");
	});

	it("returns `onmicrosoft` tenant if ODSP dogfood group site url is passed", () => {
		const result = getAadTenant("contoso.sharepoint-df.com");
		assert.strictEqual(result, "contoso.onmicrosoft.com");
	});

	it("returns unchanged url if vanity site url is passed", () => {
		const result = getAadTenant("vanity.com");
		assert.strictEqual(result, "vanity.com");
	});
});

describe("isOdspHostname", () => {
	for (const server of [
		"sharepoint.com",
		"contoso.sharepoint.com",
		"contoso-my.sharepoint.com",
		"sharepoint-df.com",
		"contoso.sharepoint-df.com",
		"CONTOSO.SharePoint.com",
		"https://contoso.sharepoint.com/sites/foo",
		"contoso.sharepoint.com:443",
	]) {
		it(`accepts ODSP host "${server}"`, () => {
			assert.strictEqual(isOdspHostname(server), true);
		});
	}

	for (const server of [
		"evilsharepoint.com",
		"notsharepoint-df.com",
		"attacker.com",
		"contoso.sharepoint.com.evil.com",
		"sharepoint.com.evil.com",
		"",
	]) {
		it(`rejects non-ODSP host "${server}"`, () => {
			assert.strictEqual(isOdspHostname(server), false);
		});
	}
});
