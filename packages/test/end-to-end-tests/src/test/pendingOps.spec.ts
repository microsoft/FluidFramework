/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ChannelFactoryRegistry, createAndAttachContainer, ITestFluidObject } from "@fluidframework/test-utils";
import {
    DataObjectFactoryType,
    generateLocalNonCompatTest,
    ITestContainerConfig,
    ITestObjectProvider,
} from "./compatUtils";

const mapId = "map";
const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

const lots = 30;
const testKey = "test key";
const testKey2 = "another test key";
const testValue = "test value";

type MapCallback = (container: IContainer, dataStore: ITestFluidObject, map: SharedMap) => void;

// load container, pause, create (local) ops from callback, then optionally send ops before closing container
const getPendingOps = async (args: ITestObjectProvider, send: boolean, cb: MapCallback) => {
    const container = await args.loadTestContainer(testContainerConfig) as IContainer;
    await args.opProcessingController.process();
    await args.opProcessingController.pauseProcessing(container.deltaManager as any);
    const dataStore = await requestFluidObject<ITestFluidObject>(container, "default");
    assert(dataStore.runtime.deltaManager.outbound.paused);
    const map = await dataStore.getSharedObject<SharedMap>(mapId);
    cb(container, dataStore, map);
    const pendingOps = container.getPendingLocalState();
    if (send) {
        await args.opProcessingController.process();
    }
    container.close();
    assert.ok(pendingOps);
    return pendingOps;
};

const tests = (args: ITestObjectProvider) => {
    let loader: ILoader;
    let container1: IContainer;
    let map1: SharedMap;

    beforeEach(async () => {
        loader = args.makeTestLoader(testContainerConfig) as ILoader;
        container1 = await createAndAttachContainer(
            "defaultDocumentId",
            args.defaultCodeDetails,
            loader,
            args.urlResolver);
        args.opProcessingController.addDeltaManagers((container1 as any).deltaManager);
        const dataStore1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        map1 = await dataStore1.getSharedObject<SharedMap>(mapId);
    });

    it("resends op", async function() {
        const pendingOps = await getPendingOps(args, false, (c, d, map) => {
            map.set(testKey, testValue);
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        assert.strictEqual(await map1.wait(testKey), testValue);
        assert.strictEqual(await map3.wait(testKey), testValue);
    });

    it("doesn't resend successful op", async function() {
        const pendingOps = await getPendingOps(args, true, (c, d, map) => {
            map.set(testKey, "something unimportant");
        });

        map1.set(testKey, testValue);
        await args.opProcessingController.process();

        // load with pending ops, which it should not resend because they were already sent successfully
        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);

        await args.opProcessingController.process();

        assert.strictEqual(await map1.wait(testKey), testValue);
        assert.strictEqual(await map3.wait(testKey), testValue);
    });

    it("resends a lot of ops", async function() {
        const pendingOps = await getPendingOps(args, false, (c, d, map) => {
            [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
        });

        // load container with pending ops, which should resend the ops not sent by previous container
        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map1.wait(i.toString()), i)));
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map3.wait(i.toString()), i)));
    });

    it("doesn't resend a lot of successful ops", async function() {
        const pendingOps = await getPendingOps(args, true, (c, d, map) => {
            [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
        });

        // send a bunch from first container that should not be overwritten
        [...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
        await args.opProcessingController.process();

        // load container with pending ops, which should not resend the ops sent by previous container
        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        await args.opProcessingController.process();
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map1.wait(i.toString()), testValue)));
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map3.wait(i.toString()), testValue)));
    });

    it("resends batched ops", async function() {
        const pendingOps = await getPendingOps(args, false, (container, d, map) => {
            (container as any).context.runtime.orderSequentially(() => {
                [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
            });
        });

        // load container with pending ops, which should resend the ops not sent by previous container
        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map1.wait(i.toString()), i)));
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map3.wait(i.toString()), i)));
    });

    it("doesn't resend successful batched ops", async function() {
        const pendingOps = await getPendingOps(args, false, (container, d, map) => {
            (container as any).context.runtime.orderSequentially(() => {
                [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
            });
        });

        // send a bunch from first container that should not be overwritten
        [...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));

        // load container with pending ops, which should not resend the ops sent by previous container
        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        await args.opProcessingController.process();
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map1.wait(i.toString()), testValue)));
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map3.wait(i.toString()), testValue)));
    });

    it("resends chunked op", async function() {
        const bigString = "a".repeat(container1.deltaManager.maxMessageSize);

        const pendingOps = await getPendingOps(args, false, (c, d, map) => {
            map.set(testKey, bigString);
        });

        // load container with pending ops, which should resend the ops not sent by previous container
        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        assert.strictEqual(await map1.wait(testKey), bigString);
        assert.strictEqual(await map3.wait(testKey), bigString);
    });

    it("doesn't resend successful chunked op", async function() {
        const bigString = "a".repeat(container1.deltaManager.maxMessageSize);

        const pendingOps = await getPendingOps(args, false, (c, d, map) => {
            map.set(testKey, bigString);
            map.set(testKey2, bigString);
        });

        // set on first container which should not be overwritten
        map1.set(testKey, testValue);
        map1.set(testKey2, testValue);

        // load container with pending ops, which should resend the ops not sent by previous container
        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        await args.opProcessingController.process();
        assert.strictEqual(await map1.wait(testKey), testValue);
        assert.strictEqual(await map3.wait(testKey), testValue);
        assert.strictEqual(await map1.wait(testKey2), testValue);
        assert.strictEqual(await map3.wait(testKey2), testValue);
    });

    it("pending map clear resend", async function() {
        [...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
        await args.opProcessingController.process();

        const pendingOps = await getPendingOps(args, false, (c, d, map) => {
            map.clear();
        });

        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        await args.opProcessingController.process();
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map1.get(i.toString()), undefined)));
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map3.get(i.toString()), undefined)));
    });

    it("successful map clear no resend", async function() {
        const pendingOps = await getPendingOps(args, true, (c, d, map) => {
            map.clear();
        });

        [...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
        await args.opProcessingController.process();

        const container3 = await loader.resolve(
            { url: "http://localhost:3000/defaultDocumentId", headers: { "fluid-cache": false } },
            pendingOps,
        );
        args.opProcessingController.addDeltaManagers(container3.deltaManager as any);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        await args.opProcessingController.process();
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map1.get(i.toString()), testValue)));
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map3.get(i.toString()), testValue)));
    });
};

describe("asdf", () => {
    generateLocalNonCompatTest(tests);
});
