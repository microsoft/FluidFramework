/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    createLoader,
    ITestFluidObject,
    timeoutPromise,
} from "@fluidframework/test-utils";

import {generatePairwiseOptions} from "@fluidframework/test-pairwise-generator";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISharedMap, IValueChanged, SharedMap } from "@fluidframework/map";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";

//these points are all after creation of all object at which any object can be attached
const sharedPoints = [3, 4, 5];

const testConfigs =
    generatePairwiseOptions({
        containerAttachPoint:[0, 1, ... sharedPoints],
        containerSaveAfterAttach: [true, false],
        datastoreAttachPoint: [1, ... sharedPoints],
        datastoreSaveAfterAttach: [true, false],
        ddsAttachPoint: [2, ... sharedPoints],
        ddsSaveAfterAttach: [true, false],
    });

describeFullCompat("Validate Attach lifecycle", (getTestObjectProvider) => {
    for(const testConfig of testConfigs) {
        it(`Validate attach orders: ${JSON.stringify(testConfig ?? "undefined")}`, async function() {
            // setup shared states
            const provider  = getTestObjectProvider();
            let containerUrl: IResolvedUrl | undefined;

            // act code block
            {
                const initLoader = createLoader(
                    [[provider.defaultCodeDetails, provider.createFluidEntryPoint()]],
                    provider.documentServiceFactory,
                    provider.urlResolver,
                );

                const initContainer = await initLoader.createDetachedContainer(provider.defaultCodeDetails);
                const attachContainer = async ()=>{
                    const attachP =  initContainer.attach(provider.driver.createCreateNewRequest(provider.documentId))
                    if(testConfig.containerSaveAfterAttach){
                        await attachP;
                    }
                }
                if(testConfig.containerAttachPoint === 0) {
                    // point 0 - at container create, datastore and dss don't exist
                    await attachContainer();
                }   

                const initDataObject = await requestFluidObject<ITestFluidObject>(initContainer, "default");

                const ds = await initDataObject.context.containerRuntime.createDataStore("default");
                const newDataObj = await requestFluidObject<ITestFluidObject>(ds, "/");
                const attachDatastore = async ()=>{
                    initDataObject.root.set("ds", newDataObj.handle);
                    while(testConfig.datastoreSaveAfterAttach
                        && initContainer.isDirty 
                        && initContainer.attachState !== AttachState.Detached){
                        await timeoutPromise<void>(
                            (resolve)=>initContainer.once("saved", ()=>resolve()),
                            {durationMs: this.timeout() / 2,errorMsg:"datastoreSaveAfterAttach timeout"});
                    }
                }
                if(testConfig.datastoreAttachPoint === 1) {
                    // point 1 - at datastore create, dds does not exist
                    await attachDatastore()
                }
                if(testConfig.containerAttachPoint === 1){
                    // point 1 - datastore exists as least locally, but dds does not.
                    await attachContainer();
                }

                const newMap = SharedMap.create(newDataObj.runtime);
                const attachDds= async()=>{
                    newDataObj.root.set("map",newMap.handle);
                    while(testConfig.ddsSaveAfterAttach 
                        && initContainer.isDirty 
                        && initContainer.attachState !== AttachState.Detached){
                            await timeoutPromise<void>(
                                (resolve)=>initContainer.once("saved", ()=>resolve()),
                                {durationMs: this.timeout() / 2,errorMsg:"ddsSaveAfterAttach timeout"});
                    }
                }
                if(testConfig.ddsAttachPoint === 2) {
                    // point 2 - at dds create
                    await attachDds();
                }

                // all objects, container, datastore, and dds are created, at least in memory at this point
                // so now we can attach whatever is not in the presence of all the others
                for(const i of sharedPoints) {
                    // also send an op at these points
                    // we'll use these to validate
                    newMap.set(i.toString(),i);

                    if(testConfig.containerAttachPoint === i) {
                        await attachContainer();
                    }
                    if(testConfig.datastoreAttachPoint === i) {
                        await attachDatastore()
                    }
                    if(testConfig.ddsAttachPoint === i) {
                        await attachDds();
                    }
                }
                while(initContainer.isDirty 
                    || initContainer.attachState !== AttachState.Attached){
                    await timeoutPromise<void>(
                        (resolve)=>initContainer.once("saved", ()=>resolve()),
                        {durationMs: this.timeout() / 2, errorMsg:"final save timeout"});
                }
                containerUrl = initContainer.resolvedUrl;

                initContainer.close();
            }

            // validation code block
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

                const newDatastore =await (await waitKey<IFluidHandle<ITestFluidObject>>(
                    initDataObject.root,"ds", this.timeout())).get();
                
                const newMap = await (await waitKey<IFluidHandle<ISharedMap>>(
                    newDatastore.root,"map", this.timeout())).get();
                
                for(const i of sharedPoints) {
                    assert.equal(
                        await waitKey<number>(newMap, i.toString(), this.timeout()),
                        i);
                }
            }
        });
    }
});


async function waitKey<T>(map: ISharedMap, key:string, testTimeout: number): Promise<T>{
    return timeoutPromise<T>((resolve)=>{
        if(map.has(key)){
            resolve(map.get<T>(key)!)
        }
        const waitFunc = (changed: IValueChanged)=>{
            if(changed.key === key){
                map.off("valueChanged", waitFunc);
                resolve(map.get<T>(key)!);
            }
        }
        map.on("valueChanged", waitFunc);
        
    },
    {durationMs: testTimeout / 2,errorMsg:`${key} not available before timeout`});
}