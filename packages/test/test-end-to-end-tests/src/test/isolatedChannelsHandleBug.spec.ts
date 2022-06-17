/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { SharedDirectory } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestContainerConfig, ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject } from "@fluidframework/test-version-utils";
import { ISummarizer } from "@fluidframework/container-runtime";
// eslint-disable-next-line import/no-internal-modules
import { createSummarizer, summarizeNow, waitForContainerConnection } from "./gc/gcTestSummaryUtils";

describeNoCompat("Isolated channels handle generation", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let mainContainer: IContainer;
    let mainDataStore: ITestDataObject;

    /**
     * Waits for a summary with the current state of the document (including all in-flight changes). It basically
     * synchronizes all containers and waits for a summary that contains the last processed sequence number.
     * @returns the version of this summary. This version can be used to load a Container with the summary associated
     * with it.
     */
    async function waitForSummary(summarizer: ISummarizer): Promise<string> {
        await provider.ensureSynchronized();
        const summaryResult = await summarizeNow(summarizer);
        return summaryResult.summaryVersion;
    }

    const defaultGCConfig: ITestContainerConfig = {
        runtimeOptions: {
            summaryOptions: {
                disableSummaries: true,
                summaryConfigOverrides: { state: "disabled" },
            },
            gcOptions: { gcAllowed: false },
        },
    };

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        mainContainer = await provider.makeTestContainer(defaultGCConfig);
        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        mainDataStore._root.set("test", "value");
        await waitForContainerConnection(mainContainer);
    });

    it("correctly update handle paths when isolated channels are enabled / disabled across summaries", async () => {
        // Create a second DDS that will not change so a handle will be sent during summaries.
        const directory = SharedDirectory.create(mainDataStore._runtime);
        mainDataStore._root.set("dir", directory.handle);

        // Create summarizer1 with "disableIsolatedChannels = false". This will write a summary with data stores and
        // DDS under ".channels".
        const summarizer1 = await createSummarizer(provider, mainContainer);
        const summaryVersion1 = await waitForSummary(summarizer1);

        mainDataStore._root.set("key", "value");

        // Create summarizer2 with "disableIsolatedChannels = true". This will load from a summary that has ".channels"
        // and write a summary that does not have ".channels".
        summarizer1.close();
        const summarizer2 = await createSummarizer(
            provider, mainContainer, summaryVersion1, undefined, true /* disableIsolatedChannels */);
        await waitForSummary(summarizer2);

        // Create summarizer3 with "disableIsolatedChannels = false" and it loads from the summary created by the first
        // summarizer.
        // It will load from a summary with ".channels", get an ack for a summary that does not have ".channels" and
        // and write a summary with data stores and DDS without ".channels".
        summarizer2.close();
        const summarizer3 = await createSummarizer(provider, mainContainer, summaryVersion1);

        // Make a change to the data store so that it summarizes. Its second DDS does not change and will not summarize
        // but send a handle instead.
        mainDataStore._root.set("key", "value");

        /**
         * This summary fails to upload because of mismatch in handle path and the previous summary.
         * I am seeing that the handle for the second DDS is "/.channels/<dataStoreId>/.channels/<ddsId>". However, the
         * previous summary by summarizer2 did not have ".channels" because it had "disableIsolatedChannels = true".
         * Basically, the previous summary path for the DDS is not updated correctly mostly because the summary ack
         * from summarizer2 was not completely processed before the summary was submitted -
         * https://dev.azure.com/fluidframework/internal/_workitems/edit/779
         */
        const summaryVersion3 = await waitForSummary(summarizer3);
        assert(summaryVersion3 !== undefined);
    });
});
