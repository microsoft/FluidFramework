/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createResponseError } from "../dataStoreHelpers";

describe("createResponseError", () => {
    it("Strip URL query param ", () => {
        const response = createResponseError(400, "SomeValue", { url: "http://foo.com?a=b"});
        assert.strictEqual(response.value, "SomeValue: http://foo.com");
    });
});
