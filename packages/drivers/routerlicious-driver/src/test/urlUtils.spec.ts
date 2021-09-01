/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { parseFluidUrl, replaceDocumentIdInPath } from "../urlUtils";

describe("UrlUtils", () => {
    const exampleFluidUrl1 = "fluid://orderer.examplehost.com/example-tenant/some-document?param1=value1";
    const exampleFluidUrl2 = "fluid://examplehost.com/other-tenant/";
    describe("parseFluidUrl()", () => {
        it("parses Fluid url", () => {
            const parsedUrl = parseFluidUrl(exampleFluidUrl1);
            assert.strictEqual(parsedUrl.host, "orderer.examplehost.com");
            assert.strictEqual(parsedUrl.hostname, "orderer.examplehost.com");
            assert.strictEqual(parsedUrl.pathname, "/example-tenant/some-document");
            assert.strictEqual(parsedUrl.query.param1, "value1");
            assert.strictEqual(parsedUrl.toString(), exampleFluidUrl1);
        });

        it("parses Fluid url with blank document id", () => {
            const parsedUrl = parseFluidUrl(exampleFluidUrl2);
            assert.strictEqual(parsedUrl.host, "examplehost.com");
            assert.strictEqual(parsedUrl.hostname, "examplehost.com");
            assert.strictEqual(parsedUrl.pathname, "/other-tenant/");
            assert.strictEqual(parsedUrl.toString(), exampleFluidUrl2);
        });

        it("updating pathname alters toString of parsedUrl", () => {
            const parsedUrl = parseFluidUrl(exampleFluidUrl2);
            parsedUrl.set("pathname", "/not-same");
            assert.strictEqual(parsedUrl.toString(), "fluid://examplehost.com/not-same");
        });
    });

    describe("replaceDocumentIdInPath()", () => {
        it("returns pathname with replacement", () => {
            const parsedUrl = parseFluidUrl(exampleFluidUrl1);
            assert.strictEqual(replaceDocumentIdInPath(parsedUrl.pathname, "otherdoc"), "/example-tenant/otherdoc");
        });
        it("returns pathname with replacement of blank documentId", () => {
            const parsedUrl = parseFluidUrl(exampleFluidUrl2);
            assert.strictEqual(replaceDocumentIdInPath(parsedUrl.pathname, "otherdoc"), "/other-tenant/otherdoc");
        });
        it("replaced pathname is altered in full URL", () => {
            const parsedUrl = parseFluidUrl(exampleFluidUrl1);
            parsedUrl.set("pathname", replaceDocumentIdInPath(parsedUrl.pathname, "otherdoc"));
            assert.strictEqual(parsedUrl.toString(), exampleFluidUrl1.replace("some-document", "otherdoc"));
        });
    });
});
