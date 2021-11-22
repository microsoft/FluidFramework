/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mode, processContent } from "../../replayMultipleFiles";

describe("Update snapshots", function() {
    this.timeout(300000);

    it("Update snapshots", async () => {
        await processContent(Mode.UpdateSnapshots);
    });
});
