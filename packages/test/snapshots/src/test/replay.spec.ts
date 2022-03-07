/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mode, processContent } from "../replayMultipleFiles";

describe("Snapshots", function() {
    this.timeout(300000);

    describe("Stress Test", async () => {
        await processContent(Mode.Stress);
    });

    describe("writes snapshot in correct format", async () => {
        await processContent(Mode.Compare);
    });

    describe("loads snapshots in old format", async () => {
        await processContent(Mode.Validate);
    });

    describe("loads snapshots in old format and writes in correct format", async () => {
        await processContent(Mode.BackCompat);
    });
});
