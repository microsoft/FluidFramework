/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { newOdspNetworkError } from "../odspUtils";

describe("Odsp Error", () => {

    it("Error Property exists", async () => {
        const error1 = newOdspNetworkError("Error", 400, true, "xxx-xxx");
        const errorBag: any = { ...error1.getCustomProperties() };
        assert.equal("xxx-xxx", errorBag.sprequestguid, "Property do not match!!");
        assert.equal(true, errorBag.canRetry, "Property absent!!");
    });

    it("Error Property absent", async () => {
        const error1 = newOdspNetworkError("Error", 400, true);
        const errorBag: any = { ...error1.getCustomProperties() };
        assert.equal(undefined, errorBag.sprequestguid, "Property present!!");
    });
});
