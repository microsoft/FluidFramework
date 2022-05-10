/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Deferred } from "../..";

describe.only("Deferred", () => {
    it("reject rejects", async () => {
        const deferred = new Deferred();
        deferred.reject(new Error("Oh no!"));
        await assert.rejects(deferred.promise);
    });
    it("unhandledRejection protection", async () => {
        let rejectedWith: Error | undefined;

        // Passing this callback is required to avoid an unhandledRejection,
        // since the test doesn't await or .catch the promise
        const deferred = new Deferred((e) => { rejectedWith = e; });
        deferred.reject(new Error("Oh no!"));

        await Promise.resolve();
        assert(rejectedWith !== undefined && rejectedWith.message === "Oh no!");
    });
});
