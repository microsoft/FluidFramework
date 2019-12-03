/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// import * as assert from "assert";
import { describe } from "mocha";
import { Mode, processContent } from "../replayMultipleFiles";

describe("Snapshots", function() {
    this.timeout(300000);

    it("Stress Test", async () => {
        return processContent(Mode.Stress);
    });

    it("Backward Compat", async () => {
        return processContent(Mode.Compare);
    });
});
