/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe } from "mocha";
import { Mode, processContent } from "../replayMultipleFiles";

describe("Snapshots", function() {
    this.timeout(300000);

    it("Stress Test", async () => {
        await processContent(Mode.Stress);
    });

    it("Backward Compat", async () => {
        await processContent(Mode.Compare);
    });
});
