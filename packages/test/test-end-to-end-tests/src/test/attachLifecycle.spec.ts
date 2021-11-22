/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    createLoader,
    ITestFluidObject,
    timeoutAwait,
} from "@fluidframework/test-utils";

import {generatePairwiseOptions} from "@fluidframework/test-pairwise-generator";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { IFluidHandle } from "@fluidframework/core-interfaces";

const sharedPoints = [3,4,5];
const testConfigs =
    generatePairwiseOptions({
        containerAttachPoint:[0, ... sharedPoints],
        datastoreAttachPoint: [1,... sharedPoints],
        ddsAttachPoint: [2,... sharedPoints],
    });

describeFullCompat("Validate Attach lifecycle", (getTestObjectProvider) => {
    for(const testConfig of testConfigs.filter((tc)=>
        tc.containerAttachPoint !== tc.datastoreAttachPoint
        && tc.containerAttachPoint !== tc.ddsAttachPoint
        && tc.datastoreAttachPoint !== tc.ddsAttachPoint)) {
        it.only(`Validate attach orders: ${JSON.stringify(testConfig ?? "undefined")}`, async function() {
            const provider  = getTestObjectProvider();
            let containerUrl: IResolvedUrl | undefined;
            {
                const initLoader = createLoader(
                    [[provider.defaultCodeDetails, provider.createFluidEntryPoint()]],
                    provider.documentServiceFactory,
                    provider.urlResolver,
                );

                const initContainer = await initLoader.createDetachedContainer(provider.defaultCodeDetails);
                if(testConfig.containerAttachPoint === 0) {
                    // point 0
                    await initContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
                    containerUrl = initContainer.resolvedUrl;
                }

                const initDataObject = await requestFluidObject<ITestFluidObject>(initContainer, "default");

                const ds = await initDataObject.context.containerRuntime.createDataStore("default");
                const newDataObj = await requestFluidObject<ITestFluidObject>(ds, "/");
                if(testConfig.datastoreAttachPoint === 1) {
                    // point 1
                    initDataObject.root.set("ds", newDataObj.handle);
                }

                const newMap = SharedMap.create(newDataObj.runtime);
                if(testConfig.ddsAttachPoint === 2) {
                    // point 2
                    newDataObj.root.set("map",newMap.handle);
                }

                for(const i of sharedPoints) {
                    // also send an op at these points
                    // we'll use these to validate
                    newMap.set(i.toString(),i);

                    if(testConfig.containerAttachPoint === i) {
                        await initContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
                        containerUrl = initContainer.resolvedUrl;
                    }
                    if(testConfig.datastoreAttachPoint === i) {
                        initDataObject.root.set("ds", newDataObj.handle);
                    }
                    if(testConfig.ddsAttachPoint === i) {
                        newDataObj.root.set("map",newMap.handle);
                    }
                }
                initContainer.close();
            }
            {
                const validationLoader = createLoader(
                    [[provider.defaultCodeDetails, provider.createFluidEntryPoint()]],
                    provider.documentServiceFactory,
                    provider.urlResolver,
                );
                const validationContainer = await validationLoader.resolve({
                    url: await provider.driver.createContainerUrl(provider.documentId, containerUrl),
                });

                const initDataObject = await requestFluidObject<ITestFluidObject>(validationContainer, "default");
                const newds = await (await timeoutAwait(
                        initDataObject.root.wait<IFluidHandle<ITestFluidObject>>("ds"),
                        {durationMs: this.timeout() / 2,errorMsg:"Datastore not available before timeout"})
                    ).get();
                const newMap = await (await timeoutAwait(
                        newds.root.wait<IFluidHandle<ISharedMap>>("map"),
                        {durationMs: this.timeout() / 2,errorMsg:"Map not available before timeout"})
                    ).get();

                for(const i of sharedPoints) {
                    assert.equal(
                        await timeoutAwait(
                            newMap.wait<number>(i.toString()),
                            {durationMs: this.timeout() / 2,errorMsg:"Key not available before timeout"}),
                        i);
                }
            }
        });
    }
});
