/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import * as fetchArgs from "../fluidFetchArgs";
import { fluidFetchInit } from "../fluidFetchInit";
import { fluidFetchMessages } from "../fluidFetchMessages";

const paramURL = "https://www.office.com/launch/fluid/content?auth=2&siteUrl=https:%2F%2Fmicrosoft-my.sharepoint-df.com%2Fpersonal%2Fanthonm_microsoft_com&drive=b!_XnMGqtB_EyzUvxXY3p7BUP07bmr8R1EjfELBvCmYllNhl5eInKQSZqCPXPSbmqp&item=01TOL2ZGOU43SP4KNMDVHJQDEAIRIN7ERZ&file=https:%2F%2Fmicrosoft-my.sharepoint-df.com%2Fpersonal%2Fanthonm_microsoft_com%2FDocuments%2FFluid%2520Framework%2520Summer%2520Vacation.fluid%3Fweb%3D1";
const args = {
    saveDir: "ops/",
    paramURL,
    dumpMessages: false,
    overWrite: true,
};

describe("fetch tool", () => {
    it("dump rawmessage", async () => {
        fetchArgs.setArguments(args);
        const doc = await fluidFetchInit(paramURL);
        await fluidFetchMessages(doc, fetchArgs.paramSaveDir);
    });
});
