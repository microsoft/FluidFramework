/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mode, processContent, testCollateralExists } from "../replayMultipleFiles";

describe("Snapshots", function() {
    this.timeout(300000);

    function skipIfCollateralDoesNotExist(itFnScope) {
        if (!testCollateralExists()) {
            itFnScope.skip();
        }
    }

    it("Stress Test", async function() {
        skipIfCollateralDoesNotExist(this);
        await processContent(Mode.Stress);
    });

    it("writes snapshot in correct format", async function() {
        skipIfCollateralDoesNotExist(this);
        await processContent(Mode.Compare);
    });

    it("loads snapshots in old format", async function() {
        skipIfCollateralDoesNotExist(this);
        await processContent(Mode.Validate);
    });

    it("loads snapshots in old format and writes in correct format", async function() {
        skipIfCollateralDoesNotExist(this);
        await processContent(Mode.BackCompat);
    });
});
