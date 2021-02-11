/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestFluidObject, timeoutPromise } from "@fluidframework/test-utils";
import {
    generateNonCompatTest,
    ITestObjectProvider,
} from "./compatUtils";

async function ensureConnected(container: Container) {
    if (!container.connected) {
        await timeoutPromise((resolve, rejected) => container.on("connected", resolve));
    }
}

const tests = (argsFactory: () => ITestObjectProvider) => {
    let args: ITestObjectProvider;
    let container1: Container;
    let dataObject1: ITestFluidObject;
    beforeEach(async () => {
        args = argsFactory();
        container1 = await args.makeTestContainer() as Container;
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        await ensureConnected(container1);
    });
    afterEach(() => {
        args.reset();
    });

    it("Create and load", async () => {
        // after detach create, we are in view only mode
        assert(!container1.deltaManager.active);

        // shouldn't be a leader in view only mode
        assert(!dataObject1.context.leader);

        const container2 = await args.loadTestContainer() as Container;
        await ensureConnected(container2);
        await args.opProcessingController.process();
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        assert(container2.deltaManager.active);
        assert(dataObject2.context.leader);
    });

    interface ListenerConfig { dataObject: ITestFluidObject, name: string, leader: boolean, notleader: boolean }
    const setupListener = (config: ListenerConfig) => {
        config.dataObject.runtime.on("leader", () => {
            assert(config.leader, `leader event not expected in ${config.name}`);
            config.leader = false;
        });

        config.dataObject.runtime.on("notleader", () => {
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
        await args.opProcessingController.process();

        checkExpected(config);
        assert(dataObject1.context.leader);
    });

    it("force read only", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await args.opProcessingController.process();

        const config = { dataObject: dataObject1, name: "dataObject1", leader: false, notleader: true };
        setupListener(config);

        container1.forceReadonly(true);
        await args.opProcessingController.process();

        checkExpected(config);
        assert(!dataObject1.context.leader);
    });

    it("Events on close", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");

        const container2 = await args.loadTestContainer() as Container;
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        await ensureConnected(container2);
        await args.opProcessingController.process();

        assert(dataObject1.context.leader);
        assert(!dataObject2.context.leader);

        const config1 = { dataObject: dataObject1, name: "dataObject1", leader: false, notleader: true };
        const config2 = { dataObject: dataObject2, name: "dataObject2", leader: true, notleader: false };
        setupListener(config1);
        setupListener(config2);

        container1.close();

        await args.opProcessingController.process();

        checkExpected(config1);
        checkExpected(config2);
        assert(!dataObject1.context.leader);
        assert(dataObject2.context.leader);
    });

    it("Concurrent update", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await args.opProcessingController.process();
        assert(dataObject1.context.leader);

        const container2 = await args.loadTestContainer() as Container;
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        const container3 = await args.loadTestContainer() as Container;
        const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "default");

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        await Promise.all([ensureConnected(container2), ensureConnected(container3)]);
        await args.opProcessingController.process();

        assert(dataObject1.context.leader);
        assert(!dataObject2.context.leader);
        assert(!dataObject3.context.leader);

        await args.opProcessingController.pauseProcessing();

        const config2 = { dataObject: dataObject2, name: "dataObject2", leader: false, notleader: false };
        const config3 = { dataObject: dataObject3, name: "dataObject3", leader: false, notleader: false };
        setupListener(config2);
        setupListener(config3);

        container1.close();

        // Process all the leave message
        await args.opProcessingController.processIncoming();

        // No one should be a leader yet
        assert(!dataObject1.context.leader);
        assert(!dataObject2.context.leader);
        assert(!dataObject3.context.leader);

        config2.leader = true;
        config3.leader = true;

        await args.opProcessingController.process();
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
};

describe("Leader", () => {
    generateNonCompatTest(tests);
});
