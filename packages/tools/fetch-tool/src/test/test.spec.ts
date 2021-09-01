/* eslint-disable max-len */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fetchArgs from "../fluidFetchArgs";
import { fluidFetchInit } from "../fluidFetchInit";
import { fluidFetchMessages } from "../fluidFetchMessages";

// const paramURL = `${hostUrl}?auth=2&action=edit&driver=${driveId}&item=${itemId}&file=${fileName}&siteUrl=${siteUrl}`;
const paramURL = "https://www.office.com/launch/fluid/content?auth=2&home=1&action=edit&siteUrl=https:%2F%2Fmicrosoft-my.sharepoint-df.com%2Fpersonal%2Fchensi_microsoft_com&drive=b!oawYwRoNW0KS94bXPoujHaqq57rBNC1AqKDH2f6aOeCxkzDDbiAMSI9Znzc7q5A4&item=01QCFOW6WLA2SMCVYDQ5A3S2OM7BUBDCBH&file=https:%2F%2Fmicrosoft-my.sharepoint-df.com%2Fpersonal%2Fchensi_microsoft_com%2FDocuments%2FUntitled.fluid";
const args = {
    saveDir: "ops/",
    paramURL,
    dumpMessages: true,
};

describe("fetch tool", () => {
    it("dump rawmessage", async () => {
        fetchArgs.setArguments(args);
        const doc = await fluidFetchInit(paramURL);
        await fluidFetchMessages(doc, fetchArgs.paramSaveDir);
    });
});
