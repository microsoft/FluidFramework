/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// import {paramUrl, paramSaveDir, dumpMessages} from "../fluidFetchArgs";
import { fluidFetchMain } from "../fluidFetch";

const hostUrl = "https://www.office.com/launch/fluid/content";
const driveId = "b!ds24tNVRE0WBYcMdKaBftAmyDGSvsBZFpQk--gtiHm47NiCrRG-JQ74NDq0dnCdB";
const itemId = "01WEESQTANYKE2B6I2NFFLKJCQCH6A4UNZ";
const fileName = "https://microsoft-my.sharepoint-df.com/personal/vladris_microsoft_com";
const siteUrl = "https://microsoft-my.sharepoint-df.com/personal/vladris_microsoft_com%27";
var paramUrl = `${hostUrl}?auth=2&action=edit&driver=${driveId}&item=${itemId}&file=${fileName}&
        siteUrl=${siteUrl}`;

var paramSaveDir = "test";
var dumpMessages = true;


describe("fetch tool", () => {
    it("dump rawmessage", async () => {
        fluidFetchMain();
    });
});
