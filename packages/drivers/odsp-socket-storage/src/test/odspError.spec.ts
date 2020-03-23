/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { createOdspNetworkError } from "../odspUtils";

describe("Odsp Error", () => {

    it("Error Property exists", async () => {
        const error1: any = createOdspNetworkError("Error", 400, true, "xxx-xxx");
        const errorBag = { ...error1.getCustomProperties() };
        assert.equal("xxx-xxx", errorBag.sprequestguid, "Property do not match!!");
        assert.equal(true, errorBag.canRetry, "Property absent!!");
    });

    it("Error Property absent", async () => {
        const error1: any = createOdspNetworkError("Error", 400, true);
        const errorBag = { ...error1.getCustomPropertiesX() };
        assert.equal(undefined, errorBag.sprequestguid, "Property present!!");
    });
});
