/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-string-literal
import * as assert from "assert";
import { OdspNetworkError } from "../OdspUtils";

describe("Odsp Error", () => {

        it("Error Property exists", async () => {
            const error1 = new OdspNetworkError("Error", 400, true, 100, "xxx-xxx");
            const errorBag = { ...error1.getCustomProperties() };
            assert.equal("xxx-xxx", errorBag["sprequestguid"], "Property do not match!!");
            assert.equal(true, errorBag["canRetry"], "Property absent!!");
        });

        it("Error Property absent", async () => {
            const error1 = new OdspNetworkError("Error", 400, true, 100);
            const errorBag = { ...error1.getCustomProperties() };
            assert.equal(undefined, errorBag["sprequestguid"], "Property present!!");
        });
});
