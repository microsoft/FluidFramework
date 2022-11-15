/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ChannelFactoryRegistry,
    createAndAttachContainer,
    ITestFluidObject,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";

const mapId = "map";
const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
    runtimeOptions: {
        summaryOptions: {
            // currently these tests will break if we load from a summary that was too recent
            disableSummaries: true,
        },
    },
};

// This is a regression test for https://github.com/microsoft/FluidFramework/issues/9163
describeNoCompat("t9s issue regression test", (getTestObjectProvider) => {
    it("handles long logtail", async function() {
        const provider = getTestObjectProvider();
        const loader1 = provider.makeTestLoader(testContainerConfig);
        const container1 = await createAndAttachContainer(
            provider.defaultCodeDetails,
            loader1,
            provider.driver.createCreateNewRequest(provider.documentId));
        provider.updateDocumentId(container1.resolvedUrl);
        const url = await container1.getAbsoluteUrl("");
        assert(typeof url === "string");
        console.log(url);
        const dataStore1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        const map1 = await dataStore1.getSharedObject<SharedMap>(mapId);

        const container2 = await provider.loadTestContainer(testContainerConfig);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        if (!(container2 as any).connected) {
            await new Promise((resolve) => container2.on("connected", resolve));
        }
        [...Array(60).keys()].map((i) => map2.set(`test op ${i}`, i));
        await provider.ensureSynchronized();
        await provider.opProcessingController.pauseProcessing(container2);
        assert(dataStore2.runtime.deltaManager.outbound.paused);
        map2.set("a key", "a value");
        await provider.ensureSynchronized();
        container2.close();

        map1.set("some key", "some value");
        await provider.ensureSynchronized();

        // use a new loader so we don't get a cached container
        const loader2 = provider.makeTestLoader(testContainerConfig);
        const container3 = await loader2.resolve({ url });
        if (!(container3 as any).connected) {
            console.log("waiting");
            await new Promise((resolve) => container3.on("connected", resolve));
        }
    });
});
