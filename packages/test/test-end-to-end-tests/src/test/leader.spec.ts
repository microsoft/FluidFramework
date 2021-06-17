/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IAgentScheduler, TaskSubscription } from "@fluidframework/agent-scheduler";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider, ITestFluidObject, timeoutPromise } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";

async function ensureConnected(container: Container) {
    if (!container.connected) {
        await timeoutPromise((resolve, rejected) => container.on("connected", resolve), { durationMs: 4000 });
    }
}

async function getLeadershipSubscriptionForContainer(container: Container) {
    const globalScheduler = await requestFluidObject<IAgentScheduler>(container, "_scheduler");
    const taskSubscription = new TaskSubscription(globalScheduler, "leader");
    taskSubscription.volunteer();
    return taskSubscription;
}

describeFullCompat("Leader", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let container1: Container;
    let dataObject1: ITestFluidObject;
    let taskSubscription1: TaskSubscription;
    beforeEach(async () => {
        provider = getTestObjectProvider();
        container1 = await provider.makeTestContainer({
            runtimeOptions: { addGlobalAgentSchedulerAndLeaderElection: true },
        }) as Container;
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        await ensureConnected(container1);
        taskSubscription1 = await getLeadershipSubscriptionForContainer(container1);
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
        assert(!taskSubscription1.haveTask());

        const container2 = await provider.loadTestContainer({
            runtimeOptions: { addGlobalAgentSchedulerAndLeaderElection: true },
        }) as Container;
        await ensureConnected(container2);
        const taskSubscription2 = await getLeadershipSubscriptionForContainer(container2);
        await provider.ensureSynchronized();

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        assert(container2.deltaManager.active);
        if (!taskSubscription2.haveTask()) {
            await timeoutPromise(
                (resolve) => { taskSubscription2.once("gotTask", () => { resolve(); }); },
                { durationMs: 4000 },
            );
        }
        assert(taskSubscription2.haveTask());
    });

    interface ListenerConfig { taskSubscription: TaskSubscription, name: string, gotTask: boolean, lostTask: boolean }
    const registeredListeners: [TaskSubscription, "gotTask" | "lostTask", any][] = [];
    function registerListener(target: TaskSubscription, name: "gotTask" | "lostTask", handler: () => void) {
        target.on(name, handler);
        registeredListeners.push([target, name, handler]);
    }
    const setupListener = (config: ListenerConfig) => {
        registerListener(config.taskSubscription, "gotTask", () => {
            assert(config.gotTask, `gotTask event not expected in ${config.name}`);
            config.gotTask = false;
        });

        registerListener(config.taskSubscription, "lostTask", () => {
            assert(config.lostTask, `lostTask event not expected in ${config.name}`);
            config.lostTask = false;
        });
    };

    const checkExpected = (config: ListenerConfig) => {
        assert(!config.gotTask, `Missing leader event on ${config.name}`);
        assert(!config.lostTask, `Missing lostTask event on ${config.name}`);
    };

    it("View to write mode", async () => {
        const config = {
            taskSubscription: taskSubscription1,
            name: "taskSubscription1",
            gotTask: true,
            lostTask: false,
        };
        setupListener(config);

        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await provider.ensureSynchronized();

        checkExpected(config);
        assert(taskSubscription1.haveTask());
    });

    it("force read only", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await provider.ensureSynchronized();

        const config = {
            taskSubscription: taskSubscription1,
            name: "taskSubscription1",
            gotTask: false,
            lostTask: true,
        };
        setupListener(config);

        container1.forceReadonly(true);
        await provider.ensureSynchronized();

        checkExpected(config);
        assert(!taskSubscription1.haveTask());
    });

    it("Events on close", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");

        // Make sure we reconnect as a writer and processed the op
        await provider.ensureSynchronized();

        const container2 = await provider.loadTestContainer({
            runtimeOptions: { addGlobalAgentSchedulerAndLeaderElection: true },
        }) as Container;

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        await ensureConnected(container2);
        const taskSubscription2 = await getLeadershipSubscriptionForContainer(container2);
        await provider.ensureSynchronized();

        assert(taskSubscription1.haveTask());
        assert(!taskSubscription2.haveTask());

        const config1 = {
            taskSubscription: taskSubscription1,
            name: "taskSubscription1",
            gotTask: false,
            lostTask: true,
        };
        const config2 = {
            taskSubscription: taskSubscription2,
            name: "taskSubscription2",
            gotTask: true,
            lostTask: false,
        };
        setupListener(config1);
        setupListener(config2);

        container1.close();

        await provider.ensureSynchronized();

        checkExpected(config1);
        checkExpected(config2);
        assert(!taskSubscription1.haveTask());
        assert(taskSubscription2.haveTask());
    });

    it("Concurrent update", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await provider.ensureSynchronized();
        assert(taskSubscription1.haveTask());

        const container2 = await provider.loadTestContainer({
            runtimeOptions: { addGlobalAgentSchedulerAndLeaderElection: true },
        }) as Container;

        const container3 = await provider.loadTestContainer({
            runtimeOptions: { addGlobalAgentSchedulerAndLeaderElection: true },
        }) as Container;

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        await Promise.all([ensureConnected(container2), ensureConnected(container3)]);
        const taskSubscription2 = await getLeadershipSubscriptionForContainer(container2);
        const taskSubscription3 = await getLeadershipSubscriptionForContainer(container3);
        await provider.ensureSynchronized();

        assert(taskSubscription1.haveTask());
        assert(!taskSubscription2.haveTask());
        assert(!taskSubscription3.haveTask());

        await provider.opProcessingController.pauseProcessing();

        const config2 = {
            taskSubscription: taskSubscription2,
            name: "taskSubscription2",
            gotTask: false,
            lostTask: false,
        };
        const config3 = {
            taskSubscription: taskSubscription3,
            name: "taskSubscription3",
            gotTask: false,
            lostTask: false,
        };
        setupListener(config2);
        setupListener(config3);

        container1.close();

        // Process all the leave message
        await provider.opProcessingController.processIncoming();

        // No one should be a leader yet
        assert(!taskSubscription1.haveTask());
        assert(!taskSubscription2.haveTask());
        assert(!taskSubscription3.haveTask());

        config2.gotTask = true;
        config3.gotTask = true;

        await provider.ensureSynchronized();
        assert((taskSubscription2.haveTask() || taskSubscription3.haveTask()) &&
            (!taskSubscription2.haveTask() || !taskSubscription3.haveTask()),
            "only one container should be the leader");

        if (taskSubscription2.haveTask()) {
            assert(config3.gotTask);
            config3.gotTask = false;
        } else if (taskSubscription3.haveTask()) {
            assert(config2.gotTask);
            config2.gotTask = false;
        }
        checkExpected(config2);
        checkExpected(config3);
    });
});
