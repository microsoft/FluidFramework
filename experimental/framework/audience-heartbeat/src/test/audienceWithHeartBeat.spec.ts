/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { AudienceWithHeartBeat } from "..";

describe(`AudienceWithHeartBeat`, () => {
    let audienceWithHeartBeat: AudienceWithHeartBeat;
    let dataStoreRuntime: MockFluidDataStoreRuntime;

    beforeEach(async () => {
        dataStoreRuntime = new MockFluidDataStoreRuntime();
        audienceWithHeartBeat = new AudienceWithHeartBeat(dataStoreRuntime);
        audienceWithHeartBeat.enableHeartBeat();
    });

    it("works", () => {

    });
});
