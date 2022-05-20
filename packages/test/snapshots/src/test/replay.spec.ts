/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mode, processContent, testCollateralExists } from "../replayMultipleFiles";

describe("Snapshots", function() {
    this.timeout(300000);

    let collateralExists = false;

    before(() => {
        collateralExists = testCollateralExists();
    });

    beforeEach(function() {
        if (!collateralExists) {
            this.skip();
        }
    });

    it("Stress Test", async () => {
        await processContent(Mode.Stress);
    });

    it("writes snapshot in correct format", async () => {
        await processContent(Mode.Compare);
    });

    it("loads snapshots in old format", async () => {
        await processContent(Mode.Validate);
    });

    it("loads snapshots in old format and writes in correct format", async () => {
        await processContent(Mode.BackCompat);
    });
});
