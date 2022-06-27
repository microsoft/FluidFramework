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

import { generatePairwiseOptions } from "@fluidframework/test-pairwise-generator";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISharedMap, IValueChanged } from "@fluidframework/map";
import { SequenceDeltaEvent, SharedString, SharedStringFactory } from "@fluidframework/sequence";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";
import { IChannelFactory } from "@fluidframework/datastore-definitions";

// during these point succeeding objects won't even exist locally
const ContainerCreated = 0;
const DatastoreCreated = 1;
const DdsCreated = 2;

// these points are after all objects at least exist locally
const sharedPoints = [3, 4, 5];

const ddsKey = "string";

const testConfigs =
    generatePairwiseOptions({
        containerAttachPoint: [ContainerCreated, DatastoreCreated, ... sharedPoints],
        containerSaveAfterAttach: [true, false],
        datastoreAttachPoint: [DatastoreCreated, ... sharedPoints],
        datastoreSaveAfterAttach: [true, false],
        ddsAttachPoint: [DdsCreated, ... sharedPoints],
        ddsSaveAfterAttach: [true, false],
    });

describeFullCompat("Validate Attach lifecycle", (getTestObjectProvider) => {
    before(function() {
        const provider = getTestObjectProvider();
        switch (provider.driver.type) {
            case "local":
            case "tinylicious":
                break;
            default:
                this.skip();
        }
    });
    for (const testConfig of testConfigs) {
        it(`Validate attach orders: ${JSON.stringify(testConfig ?? "undefined")}`, async function() {
            // setup shared states
            const provider = getTestObjectProvider();
            const timeoutDurationMs = this.timeout() / 2;
            let containerUrl: IResolvedUrl | undefined;
            const channelFactoryRegistry: [string | undefined, IChannelFactory][] =
                [[SharedStringFactory.Type, SharedString.getFactory()]];
            const containerConfig = { registry: channelFactoryRegistry };

            // act code block
            {
                const initLoader = createLoader(
                    [[provider.defaultCodeDetails, provider.createFluidEntryPoint(containerConfig)]],
                    provider.documentServiceFactory,
                    provider.urlResolver,
                );

                const initContainer = await initLoader.createDetachedContainer(provider.defaultCodeDetails);
                const attachContainer = async () => {
                    const attachP = initContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
                    if (testConfig.containerSaveAfterAttach) {
                        await attachP;
                    }
                };
                if (testConfig.containerAttachPoint === ContainerCreated) {
                    // point 0 - at container create, datastore and dss don't exist
                    await attachContainer();
                }

                const initDataObject = await requestFluidObject<ITestFluidObject>(initContainer, "default");

                const ds = await initDataObject.context.containerRuntime.createDataStore("default");
                const newDataObj = await requestFluidObject<ITestFluidObject>(ds, "/");
                const attachDatastore = async () => {
                    initDataObject.root.set("ds", newDataObj.handle);
                    while (testConfig.datastoreSaveAfterAttach
                        && initContainer.isDirty
                        && initContainer.attachState !== AttachState.Detached) {
                        await timeoutPromise(
                            (resolve) => initContainer.once("saved", () => resolve()),
                            { durationMs: timeoutDurationMs, errorMsg: "datastoreSaveAfterAttach timeout" });
                    }
                };
                if (testConfig.datastoreAttachPoint === DatastoreCreated) {
                    // point 1 - at datastore create, dds does not exist
                    await attachDatastore();
                }
                if (testConfig.containerAttachPoint === DatastoreCreated) {
                    // point 1 - datastore exists as least locally, but dds does not.
                    await attachContainer();
                }

                const newString = SharedString.create(newDataObj.runtime);
                const attachDds = async () => {
                    newDataObj.root.set(ddsKey, newString.handle);
                    while (testConfig.ddsSaveAfterAttach
                        && initContainer.isDirty
                        && initContainer.attachState !== AttachState.Detached) {
                            await timeoutPromise(
                                (resolve) => initContainer.once("saved", () => resolve()),
                                { durationMs: timeoutDurationMs, errorMsg: "ddsSaveAfterAttach timeout" });
                    }
                };
                if (testConfig.ddsAttachPoint === 2) {
                    // point 2 - at dds create
                    await attachDds();
                }

                // all objects, container, datastore, and dds are created, at least in memory at this point
                // so now we can attach whatever is not in the presence of all the others
                for (const i of sharedPoints) {
                    // also send an op at these points
                    // we'll use these to validate
                    newString.insertText(convertSharedPointToPos(i), i.toString());

                    if (testConfig.containerAttachPoint === i) {
                        await attachContainer();
                    }
                    if (testConfig.datastoreAttachPoint === i) {
                        await attachDatastore();
                    }
                    if (testConfig.ddsAttachPoint === i) {
                        await attachDds();
                    }
                }

                while (initContainer.attachState !== AttachState.Attached) {
                    await timeoutPromise(
                        (resolve) => initContainer.once("attached", () => resolve()),
                        { durationMs: timeoutDurationMs, errorMsg: "container attach timeout" });
                }

                while (initContainer.isDirty) {
                    await timeoutPromise(
                        (resolve) => initContainer.once("saved", () => resolve()),
                        { durationMs: timeoutDurationMs, errorMsg: "final save timeout" });
                }
                containerUrl = initContainer.resolvedUrl;

                initContainer.close();
            }

            // validation code block
            {
                const validationLoader = createLoader(
                    [[provider.defaultCodeDetails, provider.createFluidEntryPoint(containerConfig)]],
                    provider.documentServiceFactory,
                    provider.urlResolver,
                );
                const validationContainer = await validationLoader.resolve({
                    url: await provider.driver.createContainerUrl(provider.documentId, containerUrl),
                });

                const initDataObject = await requestFluidObject<ITestFluidObject>(validationContainer, "default");

                const newDatastore = await (await waitKey<IFluidHandle<ITestFluidObject>>(
                    initDataObject.root, "ds", timeoutDurationMs)).get();

                const newString = await (await waitKey<IFluidHandle<SharedString>>(
                    newDatastore.root, ddsKey, timeoutDurationMs)).get();

                for (const i of sharedPoints) {
                    assert.equal(
                        await waitChar(newString, convertSharedPointToPos(i), timeoutDurationMs),
                        i.toString(), `No match at {i}`);
                }
            }
        });
    }
});

function convertSharedPointToPos(i: number) {
    return i - sharedPoints[0];
}

async function waitChar(sharedString: SharedString, pos: number, timeoutDurationMs: number): Promise<string> {
    return timeoutPromise<string>((resolve) => {
        const text = sharedString.getText();
        if (text.length > pos) {
            resolve(text[pos]);
        } else {
            const waitFunc = (event: SequenceDeltaEvent) => {
                const range = event.ranges.find((value) => value.position === pos);
                if (range) {
                    sharedString.off("sequenceDelta", waitFunc);
                    resolve(sharedString.getText()[pos]);
                }
            };
            sharedString.on("sequenceDelta", waitFunc);
        }
    },
    { durationMs: timeoutDurationMs, errorMsg: `${pos} not available before timeout` });
}

async function waitKey<T>(map: ISharedMap, key: string, timeoutDurationMs: number): Promise<T> {
    return timeoutPromise<T>((resolve) => {
        if (map.has(key)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            resolve(map.get<T>(key)!);
        } else {
            const waitFunc = (changed: IValueChanged) => {
                if (changed.key === key) {
                    map.off("valueChanged", waitFunc);
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    resolve(map.get<T>(key)!);
                }
            };
            map.on("valueChanged", waitFunc);
        }
    },
    { durationMs: timeoutDurationMs, errorMsg: `${key} not available before timeout` });
}
