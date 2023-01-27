/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { getAadTenant } from "../odspDocLibUtils";

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
