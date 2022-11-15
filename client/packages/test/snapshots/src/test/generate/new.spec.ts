/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mode, processContent } from "../../replayMultipleFiles";

describe("Create snapshots", function() {
    this.timeout(300000);

    it("Create snapshots", async () => {
        await processContent(Mode.NewSnapshots);
    });
});
