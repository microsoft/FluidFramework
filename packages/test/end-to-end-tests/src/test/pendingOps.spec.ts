/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ChannelFactoryRegistry, createAndAttachContainer, ITestFluidObject } from "@fluidframework/test-utils";
import {
    DataObjectFactoryType,
    generateTest,
    ICompatLocalTestObjectProvider,
    ITestContainerConfig,
} from "./compatUtils";

const mapId = "map";
const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

const getSnapshot = (container): any =>
        container.context.runtime.pendingStateManager.snapshot();

const tests = (args: ICompatLocalTestObjectProvider) => {
    it("asdf", async function() {
        const testKey = "test key";
        const testValue = "test value";
        const loader = args.makeTestLoader(testContainerConfig);
        const container1 = await createAndAttachContainer(
            "defaultDocumentId",
            args.defaultCodeDetails,
            loader,
            args.urlResolver);
        container1.on("op", (op) => {
            console.log(op.type, op);
            if (op.type === "op") {
                console.log("------------------------------------------------------------------------------------------------------------------------------")
                console.log(op?.contents?.contents);
                console.log("------------------------------------------------------------------------------------------------------------------------------")
                console.log(op?.contents?.contents?.contents?.content);
            }
            console.log("******************************************************************************************************************************")
        });
        const dataStore1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        const map1 = await dataStore1.getSharedObject<SharedMap>(mapId);

        const container2 = await args.loadTestContainer(testContainerConfig);
        // const container2 = await loader.resolve(
        //     { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
        // );
        // args.opProcessingController.addDeltaManagers(container2.deltaManager as any);
        await args.opProcessingController.pauseProcessing(container2.deltaManager as any);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        assert(dataStore2.runtime.deltaManager.outbound.paused);
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        map2.set(testKey, testValue);
        const pendingOps = getSnapshot(container2);
        console.log(pendingOps);
        container2.close();

        const container3 = await (loader as any).resolveWithPendingOps(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
            // JSON.parse('[{"type":"message","messageType":"component","clientSequenceNumber":1,"content":{"address":"default","contents":{"content":{"address":"map","contents":{"key":"test key","type":"set","value":{"type":"Plain","value":"test value"}}},"type":"op"}},"localOpMetadata":0}]'),
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        console.log(map3.get(testKey));
        console.log(await map1.wait(testKey));
        assert.strictEqual(await map1.wait(testKey), testValue);
        // console.log(await map3.wait(testKey)); // fails
    });
};

describe("asdf", () => {
    // TODO: add back compat test once N-2 is 0.28
    generateTest(tests);
});
