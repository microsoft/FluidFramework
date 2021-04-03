/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { IAgentScheduler } from "@fluidframework/agent-scheduler";
import { Container } from "@fluidframework/container-loader";
import { agentSchedulerId } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider, ITestFluidObject, timeoutPromise } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";

async function ensureConnected(container: Container) {
    if (!container.connected) {
        await timeoutPromise((resolve, rejected) => container.on("connected", resolve), { durationMs: 4000 });
    }
}

class LeaderWatcher extends EventEmitter {
    public get leader() {
        return this.agentScheduler.pickedTasks().includes("leader");
    }

    constructor(private readonly agentScheduler: IAgentScheduler) {
        super();
        agentScheduler.on("picked", (taskId: string) => {
            if (taskId === "leader") {
                this.emit("leader");
            }
        });
        agentScheduler.on("lost", (taskId: string) => {
            if (taskId === "leader") {
                this.emit("notleader");
            }
        });
    }
}

describeFullCompat("Leader", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let container1: Container;
    let dataObject1: ITestFluidObject;
    let leaderWatcher1: LeaderWatcher;
    beforeEach(async () => {
        provider = getTestObjectProvider();
        container1 = await provider.makeTestContainer() as Container;
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        const scheduler1 = await requestFluidObject<IAgentScheduler>(container1, agentSchedulerId);
        leaderWatcher1 = new LeaderWatcher(scheduler1);
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
        assert(!leaderWatcher1.leader);

        const container2 = await provider.loadTestContainer() as Container;
        const scheduler2 = await requestFluidObject<IAgentScheduler>(container2, agentSchedulerId);
        const leaderWatcher2 = new LeaderWatcher(scheduler2);
        await ensureConnected(container2);
        await provider.ensureSynchronized();

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        assert(container2.deltaManager.active);
        if (!leaderWatcher2.leader) {
            await timeoutPromise(
                (resolve) => { leaderWatcher2.once("leader", () => { resolve(); }); },
                { durationMs: 4000 },
            );
        }
        assert(leaderWatcher2.leader);
    });

    interface ListenerConfig { leaderWatcher: LeaderWatcher, name: string, leader: boolean, notleader: boolean }
    const registeredListeners: [LeaderWatcher, "leader" | "notleader", any][] = [];
    function registerListener(target: LeaderWatcher, name: "leader" | "notleader", handler: () => void) {
        target.on(name, handler);
        registeredListeners.push([target, name, handler]);
    }
    const setupListener = (config: ListenerConfig) => {
        registerListener(config.leaderWatcher, "leader", () => {
            assert(config.leader, `leader event not expected in ${config.name}`);
            config.leader = false;
        });

        registerListener(config.leaderWatcher, "notleader", () => {
            assert(config.notleader, `notleader event not expected in ${config.name}`);
            config.notleader = false;
        });
    };

    const checkExpected = (config: ListenerConfig) => {
        assert(!config.leader, `Missing leader event on ${config.name}`);
        assert(!config.notleader, `Missing notleader event on ${config.name}`);
    };

    it("View to write mode", async () => {
        const config = { leaderWatcher: leaderWatcher1, name: "leaderWatcher1", leader: true, notleader: false };
        setupListener(config);

        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await provider.ensureSynchronized();

        checkExpected(config);
        assert(leaderWatcher1.leader);
    });

    it("force read only", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await provider.ensureSynchronized();

        const config = { leaderWatcher: leaderWatcher1, name: "leaderWatcher1", leader: false, notleader: true };
        setupListener(config);

        container1.forceReadonly(true);
        await provider.ensureSynchronized();

        checkExpected(config);
        assert(!leaderWatcher1.leader);
    });

    it("Events on close", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");

        // Make sure we reconnect as a writer and processed the op
        await provider.ensureSynchronized();

        const container2 = await provider.loadTestContainer() as Container;
        const scheduler2 = await requestFluidObject<IAgentScheduler>(container2, agentSchedulerId);
        const leaderWatcher2 = new LeaderWatcher(scheduler2);

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        await ensureConnected(container2);
        await provider.ensureSynchronized();

        assert(leaderWatcher1.leader);
        assert(!leaderWatcher2.leader);

        const config1 = { leaderWatcher: leaderWatcher1, name: "leaderWatcher1", leader: false, notleader: true };
        const config2 = { leaderWatcher: leaderWatcher2, name: "leaderWatcher2", leader: true, notleader: false };
        setupListener(config1);
        setupListener(config2);

        container1.close();

        await provider.ensureSynchronized();

        checkExpected(config1);
        checkExpected(config2);
        assert(!leaderWatcher1.leader);
        assert(leaderWatcher2.leader);
    });

    it("Concurrent update", async () => {
        // write something to get out of view only mode and take leadership
        dataObject1.root.set("blah", "blah");
        await provider.ensureSynchronized();
        assert(leaderWatcher1.leader);

        const container2 = await provider.loadTestContainer() as Container;
        const scheduler2 = await requestFluidObject<IAgentScheduler>(container2, agentSchedulerId);
        const leaderWatcher2 = new LeaderWatcher(scheduler2);

        const container3 = await provider.loadTestContainer() as Container;
        const scheduler3 = await requestFluidObject<IAgentScheduler>(container3, agentSchedulerId);
        const leaderWatcher3 = new LeaderWatcher(scheduler3);

        // Currently, we load a container in write mode from the start. See issue #3304.
        // Once that is fix, this needs to change
        await Promise.all([ensureConnected(container2), ensureConnected(container3)]);
        await provider.ensureSynchronized();

        assert(leaderWatcher1.leader);
        assert(!leaderWatcher2.leader);
        assert(!leaderWatcher3.leader);

        await provider.opProcessingController.pauseProcessing();

        const config2 = { leaderWatcher: leaderWatcher2, name: "leaderWatcher2", leader: false, notleader: false };
        const config3 = { leaderWatcher: leaderWatcher3, name: "leaderWatcher3", leader: false, notleader: false };
        setupListener(config2);
        setupListener(config3);

        container1.close();

        // Process all the leave message
        await provider.opProcessingController.processIncoming();

        // No one should be a leader yet
        assert(!leaderWatcher1.leader);
        assert(!leaderWatcher2.leader);
        assert(!leaderWatcher3.leader);

        config2.leader = true;
        config3.leader = true;

        await provider.ensureSynchronized();
        assert((leaderWatcher2.leader || leaderWatcher3.leader) &&
            (!leaderWatcher2.leader || !leaderWatcher3.leader),
            "only one container should be the leader");

        if (leaderWatcher2.leader) {
            assert(config3.leader);
            config3.leader = false;
        } else if (leaderWatcher3.leader) {
            assert(config2.leader);
            config2.leader = false;
        }
        checkExpected(config2);
        checkExpected(config3);
    });
});
