/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider, ITestFluidObject, timeoutPromise } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

async function ensureConnected(container: Container) {
    if (!container.connected) {
        await timeoutPromise((resolve, rejected) => container.on("connected", resolve), { durationMs: 4000 });
    }
}

describeFullCompat("Leader", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let container1: Container;
    let dataObject1: ITestFluidObject;
    beforeEach(async () => {
        provider = getTestObjectProvider();
        container1 = await provider.makeTestContainer() as Container;
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        await ensureConnected(container1);
    });
    afterEach(() => {
        // Clean up all the listener
        registeredListeners.forEach(([target, name, handler]) => {
            target.off(name, handler);
        });
    });

    it("Create and load", async () => {
        // after detach create, we are in view only mode
        assert(!container1.deltaManager.active);

        // shouldn't be a leader in view only mode
        assert(!dataObject1.context.leader);

        const container2 = await provider.loadTestContainer() as Container;
        await ensureConnected(container2);
        await provider.ensureSynchronized();
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        assert(container2.deltaManager.active);
        if (!dataObject2.context.leader) {
            await timeoutPromise(
                (resolve) => { dataObject2.context.once("leader", () => { resolve(); }); },
                { durationMs: 4000 },
            );
        }
        assert(dataObject2.context.leader);
    });

    interface ListenerConfig { dataObject: ITestFluidObject, name: string, leader: boolean, notleader: boolean }
    const registeredListeners: [IFluidDataStoreRuntime, "leader" | "notleader", any][] = [];
    function registerListener(target: IFluidDataStoreRuntime, name: "leader" | "notleader", handler: () => void) {
        target.on(name, handler);
        registeredListeners.push([target, name, handler]);
    }
    const setupListener = (config: ListenerConfig) => {
        registerListener(config.dataObject.runtime, "leader", () => {
            assert(config.leader, `leader event not expected in ${config.name}`);
            config.leader = false;
        });

        registerListener(config.dataObject.runtime, "notleader", () => {
            assert(config.notleader, `notleader event not expected in ${config.name}`);
            config.notleader = false;
        });
    };

    const checkExpected = (config: ListenerConfig) => {
        assert(!config.leader, `Missing leader event on ${config.name}`);
        assert(!config.notleader, `Missing notleader event on ${config.name}`);
    };

    it("View to write mode", async () => {
        const config = { dataObject: dataObject1, name: "dataObject1", leader: true, notleader: false };
        setupListener(config);

        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await provider.ensureSynchronized();

        checkExpected(config);
        assert(dataObject1.context.leader);
    });

    it("force read only", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await provider.ensureSynchronized();

        const config = { dataObject: dataObject1, name: "dataObject1", leader: false, notleader: true };
        setupListener(config);

        container1.forceReadonly(true);
        await provider.ensureSynchronized();

        checkExpected(config);
        assert(!dataObject1.context.leader);
    });

    it("Events on close", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");

        // Make sure we reconnect as a writer and processed the op
        await provider.ensureSynchronized();

        const container2 = await provider.loadTestContainer() as Container;
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        await ensureConnected(container2);
        await provider.ensureSynchronized();

        assert(dataObject1.context.leader);
        assert(!dataObject2.context.leader);

        const config1 = { dataObject: dataObject1, name: "dataObject1", leader: false, notleader: true };
        const config2 = { dataObject: dataObject2, name: "dataObject2", leader: true, notleader: false };
        setupListener(config1);
        setupListener(config2);

        container1.close();

        await provider.ensureSynchronized();

        checkExpected(config1);
        checkExpected(config2);
        assert(!dataObject1.context.leader);
        assert(dataObject2.context.leader);
    });

    it("Concurrent update", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await provider.ensureSynchronized();
        assert(dataObject1.context.leader);

        const container2 = await provider.loadTestContainer() as Container;
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        const container3 = await provider.loadTestContainer() as Container;
        const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "default");

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        await Promise.all([ensureConnected(container2), ensureConnected(container3)]);
        await provider.ensureSynchronized();

        assert(dataObject1.context.leader);
        assert(!dataObject2.context.leader);
        assert(!dataObject3.context.leader);

        await provider.opProcessingController.pauseProcessing();

        const config2 = { dataObject: dataObject2, name: "dataObject2", leader: false, notleader: false };
        const config3 = { dataObject: dataObject3, name: "dataObject3", leader: false, notleader: false };
        setupListener(config2);
        setupListener(config3);

        container1.close();

        // Process all the leave message
        await provider.opProcessingController.processIncoming();

        // No one should be a leader yet
        assert(!dataObject1.context.leader);
        assert(!dataObject2.context.leader);
        assert(!dataObject3.context.leader);

        config2.leader = true;
        config3.leader = true;

        await provider.ensureSynchronized();
        assert((dataObject2.context.leader || dataObject3.context.leader) &&
            (!dataObject2.context.leader || !dataObject3.context.leader),
            "only one container should be the leader");

        if (dataObject2.context.leader) {
            assert(config3.leader);
            config3.leader = false;
        } else if (dataObject3.context.leader) {
            assert(config2.leader);
            config2.leader = false;
        }
        checkExpected(config2);
        checkExpected(config3);
    });
});
