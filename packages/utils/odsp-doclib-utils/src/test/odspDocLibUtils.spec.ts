/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { getAadTenant } from "../odspDocLibUtils";

describe("getAadTenant", () => {
    test("returns `onmicrosoft` tenant if ODSP personal site url is passed", async () => {
        const result = getAadTenant("https://contoso-my.sharepoint.com");
        assert.strictEqual(result, "contoso.onmicrosoft.com");
    });

    test("returns `onmicrosoft` tenant if ODSP admin site url is passed", async () => {
        const result = getAadTenant("https://contoso-admin.sharepoint.com");
        assert.strictEqual(result, "contoso.onmicrosoft.com");
    });

    test("returns `onmicrosoft` tenant if ODSP group site url is passed", async () => {
        const result = getAadTenant("https://contoso.sharepoint.com");
        assert.strictEqual(result, "contoso.onmicrosoft.com");
    });

    test("returns `onmicrosoft` tenant if ODSP dogfood personal site url is passed", async () => {
        const result = getAadTenant("https://contoso-my.sharepoint-df.com");
        assert.strictEqual(result, "contoso.onmicrosoft.com");
    });

    test("returns `onmicrosoft` tenant if ODSP dogfood admin site url is passed", async () => {
        const result = getAadTenant("https://contoso-admin.sharepoint-df.com");
        assert.strictEqual(result, "contoso.onmicrosoft.com");
    });

    test("returns `onmicrosoft` tenant if ODSP dogfood group site url is passed", async () => {
        const result = getAadTenant("https://contoso.sharepoint-df.com");
        assert.strictEqual(result, "contoso.onmicrosoft.com");
    });

    test("returns unchanged url if vanity site url is passed", async () => {
        const result = getAadTenant("https://vanity.com");
        assert.strictEqual(result, "https://vanity.com");
    });
});
