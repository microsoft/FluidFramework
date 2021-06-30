/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AgentSchedulerFactory, IAgentScheduler, TaskSubscription } from "@fluidframework/agent-scheduler";
import { IContainer, IProvideRuntimeFactory } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestObjectProvider,
    TestContainerRuntimeFactory,
} from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";

const runtimeFactory: IProvideRuntimeFactory = {
    IRuntimeFactory: new TestContainerRuntimeFactory(AgentSchedulerFactory.type, new AgentSchedulerFactory()),
};

// By default, the container loads in read mode.  However, pick() attempts silently fail if not in write
// mode.  To overcome this and test pick(), we can register a fake task (which always tries to perform
// a write) so we get nack'd and bumped into write mode.
const forceWriteMode = async (scheduler: IAgentScheduler): Promise<void> => scheduler.register("makeWriteMode");

describeFullCompat("AgentScheduler", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;

    const createContainer = async (): Promise<IContainer> =>
        provider.createContainer(runtimeFactory);

    const loadContainer = async (): Promise<IContainer> =>
        provider.loadContainer(runtimeFactory);

    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    describe("Single client", () => {
        let scheduler: IAgentScheduler;

        beforeEach(async () => {
            const container = await createContainer();
            scheduler = await requestFluidObject<IAgentScheduler>(container, "default");
            await forceWriteMode(scheduler);
        });

        it("No tasks initially", async () => {
            assert.deepStrictEqual(scheduler.pickedTasks(), []);
        });

        it("Can pick tasks", async () => {
            await scheduler.pick("task1", async () => { });
            await provider.ensureSynchronized();
            assert.deepStrictEqual(scheduler.pickedTasks(), ["task1"]);
        });

        it("Can pick and release tasks", async () => {
            await scheduler.pick("task1", async () => { });
            assert.deepStrictEqual(scheduler.pickedTasks(), ["task1"]);
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), []);
        });

        it("Can register task without picking up", async () => {
            await scheduler.register("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), []);
        });

        it("Duplicate picking fails", async () => {
            await scheduler.pick("task1", async () => { });
            assert.deepStrictEqual(scheduler.pickedTasks(), ["task1"]);
            await scheduler.pick("task1", async () => { }).catch((err) => {
                assert.deepStrictEqual(err.message, "task1 is already attempted");
            });
        });

        it("Unpicked task release should fail", async () => {
            await scheduler.pick("task1", async () => { });
            await scheduler.release("task2").catch((err) => {
                assert.deepStrictEqual(err.message, "task2 was never registered");
            });
        });

        it("Should pick previously released task", async () => {
            await scheduler.pick("task1", async () => { });
            assert.deepStrictEqual(scheduler.pickedTasks(), ["task1"]);
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), []);
            await scheduler.pick("task1", async () => { });
            assert.deepStrictEqual(scheduler.pickedTasks(), ["task1"]);
        });
    });

    describe("Multiple clients", () => {
        let container1: IContainer;
        let container2: IContainer;
        let scheduler1: IAgentScheduler;
        let scheduler2: IAgentScheduler;

        beforeEach(async () => {
            // Create a new Container for the first document.
            container1 = await createContainer();
            scheduler1 = await requestFluidObject<IAgentScheduler>(container1, "default");
            await forceWriteMode(scheduler1);

            // Load existing Container for the second document.
            container2 = await loadContainer();
            scheduler2 = await requestFluidObject<IAgentScheduler>(container2, "default");
            await forceWriteMode(scheduler2);

            // const dataObject2 = await requestFluidObject<ITestDataObject>(container2, "default");

            // // Set a key in the root map. The Container is created in "read" mode and so it cannot currently pick
            // // tasks. Sending an op will switch it to "write" mode.
            // dataObject2._root.set("tempKey2", "tempValue2");
            await provider.ensureSynchronized();
        });

        it("No tasks initially", async () => {
            assert.deepStrictEqual(scheduler1.pickedTasks(), []);
            assert.deepStrictEqual(scheduler2.pickedTasks(), []);
        });

        it("Clients agree on picking tasks sequentially", async () => {
            await scheduler1.pick("task1", async () => { });

            await provider.ensureSynchronized();
            assert.deepStrictEqual(scheduler1.pickedTasks(), ["task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), []);
            await scheduler2.pick("task2", async () => { });

            await provider.ensureSynchronized();
            assert.deepStrictEqual(scheduler1.pickedTasks(), ["task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task2"]);
        });

        it("Picking same tasks are exclusive and agreed upon", async () => {
            await scheduler1.pick("task1", async () => { });
            await scheduler1.pick("task2", async () => { });
            await scheduler1.pick("task3", async () => { });
            await scheduler2.pick("task2", async () => { });
            await scheduler2.pick("task3", async () => { });
            await scheduler2.pick("task4", async () => { });

            await provider.ensureSynchronized();
            assert.deepStrictEqual(scheduler1.pickedTasks(), ["task1", "task2", "task3"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4"]);
        });

        it("Concurrent task picking outcome should be deterministic", async () => {
            await scheduler1.pick("task1", async () => { });
            await scheduler1.pick("task2", async () => { });
            await scheduler2.pick("task2", async () => { });
            await scheduler2.pick("task1", async () => { });
            await scheduler2.pick("task4", async () => { });
            await scheduler1.pick("task4", async () => { });
            await scheduler1.pick("task5", async () => { });
            await scheduler2.pick("task5", async () => { });
            await scheduler2.pick("task6", async () => { });

            await provider.ensureSynchronized();
            assert.deepStrictEqual(scheduler1.pickedTasks(), ["task1", "task2", "task5"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4", "task6"]);
        });

        it("Tasks not currently hold can not be released", async () => {
            await scheduler1.pick("task1", async () => { });
            await scheduler1.pick("task2", async () => { });
            await scheduler2.pick("task2", async () => { });
            await scheduler2.pick("task1", async () => { });
            await scheduler2.pick("task4", async () => { });
            await scheduler1.pick("task4", async () => { });
            await scheduler1.pick("task5", async () => { });
            await scheduler2.pick("task5", async () => { });
            await scheduler2.pick("task6", async () => { });

            await provider.ensureSynchronized();
            await scheduler1.release("task4").catch((err) => {
                assert.deepStrictEqual(err.message, "task4 was never picked");
            });
            await scheduler2.release("task1").catch((err) => {
                assert.deepStrictEqual(err.message, "task1 was never picked");
            });
            await scheduler2.release("task2").catch((err) => {
                assert.deepStrictEqual(err.message, "task2 was never picked");
            });
        });

        it("Released tasks are automatically picked up by interested clients", async () => {
            await scheduler1.pick("task1", async () => { });
            await scheduler1.pick("task2", async () => { });
            await scheduler2.pick("task2", async () => { });
            await scheduler2.pick("task1", async () => { });
            await scheduler2.pick("task4", async () => { });
            await scheduler1.pick("task4", async () => { });
            await scheduler1.pick("task5", async () => { });
            await scheduler2.pick("task5", async () => { });
            await scheduler2.pick("task6", async () => { });

            await provider.ensureSynchronized();
            assert.deepStrictEqual(scheduler1.pickedTasks(), ["task1", "task2", "task5"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4", "task6"]);
            await scheduler1.release("task2", "task1", "task5");

            await provider.ensureSynchronized();
            assert.deepStrictEqual(scheduler1.pickedTasks(), []);

            await provider.ensureSynchronized();
            assert.deepStrictEqual(scheduler2.pickedTasks().sort(), ["task1", "task2", "task4", "task5", "task6"]);
            await scheduler1.pick("task1", async () => { });
            await scheduler1.pick("task2", async () => { });
            await scheduler1.pick("task5", async () => { });
            await scheduler1.pick("task6", async () => { });
            await scheduler2.release("task2", "task1", "task4", "task5", "task6");

            await provider.ensureSynchronized();
            assert.deepStrictEqual(scheduler1.pickedTasks().sort(),
                ["task1", "task2", "task4", "task5", "task6"]);
        });
    });

    describe("State transitions", () => {
        let container1: Container;
        let container2: Container;
        let scheduler1: IAgentScheduler;
        let scheduler2: IAgentScheduler;

        beforeEach(async () => {
            container1 = await createContainer() as Container;
            scheduler1 = await requestFluidObject<IAgentScheduler>(container1, "default");

            container2 = await loadContainer() as Container;
            scheduler2 = await requestFluidObject<IAgentScheduler>(container2, "default");
        });

        it("Tasks picked while in read mode are assigned after switching to write mode", async () => {
            const taskSubscription = new TaskSubscription(scheduler1, "task1");
            taskSubscription.volunteer();

            await provider.ensureSynchronized();

            // Since we start in read mode, we shouldn't be able to successfully get the task even after volunteering
            assert.strict(!taskSubscription.haveTask(), "Got task in read mode");

            await forceWriteMode(scheduler1);

            await provider.ensureSynchronized();

            assert.strict(taskSubscription.haveTask(), "Did not get task after switching to write mode");
        });

        it("Tasks are released after forcing read mode", async () => {
            // Start in write mode
            await forceWriteMode(scheduler1);

            const taskSubscription = new TaskSubscription(scheduler1, "task1");
            taskSubscription.volunteer();

            await provider.ensureSynchronized();

            // Since we start in read mode, we shouldn't be able to successfully get the task even after volunteering
            assert.strict(taskSubscription.haveTask(), "Failed to get task in write mode");

            // Forcing readonly should cause us to drop the task
            container1.forceReadonly(true);
            await provider.ensureSynchronized();

            assert.strict(!taskSubscription.haveTask(), "Still have task after forcing readonly");
        });

        it("Tasks are released after closing the container", async () => {
            // Start in write mode
            await forceWriteMode(scheduler1);
            const taskSubscription1 = new TaskSubscription(scheduler1, "task1");
            taskSubscription1.volunteer();
            await provider.ensureSynchronized();

            await forceWriteMode(scheduler2);
            const taskSubscription2 = new TaskSubscription(scheduler2, "task1");
            taskSubscription2.volunteer();
            await provider.ensureSynchronized();

            assert.strict(taskSubscription1.haveTask(), "Container 1 should have task");
            assert.strict(!taskSubscription2.haveTask(), "Container 2 should not have task");

            container1.close();
            await provider.ensureSynchronized();

            assert.strict(!taskSubscription1.haveTask(), "Container 1 should not have task");
            assert.strict(taskSubscription2.haveTask(), "Container 2 should have task");
        });
    });
});
