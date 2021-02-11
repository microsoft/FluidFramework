/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TaskManager } from "@fluidframework/agent-scheduler";
import { IContainer } from "@fluidframework/container-definitions";
import { taskSchedulerId } from "@fluidframework/container-runtime";
import { IAgentScheduler } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { generateTest, ITestObjectProvider, TestDataObject } from "./compatUtils";
import * as oldTypes from "./oldVersionTypes";

const tests = (argsFactory: () => ITestObjectProvider) => {
    let args: ITestObjectProvider;
    beforeEach(() => {
        args = argsFactory();
    });
    afterEach(() => {
        args.reset();
    });

    const leader = "leader";
    describe("Single client", () => {
        let scheduler: IAgentScheduler;

        beforeEach(async () => {
            const container = await args.makeTestContainer();
            scheduler = await requestFluidObject<TaskManager>(container, taskSchedulerId)
                .then((taskManager) => taskManager.IAgentScheduler);

            const dataObject = await requestFluidObject<TestDataObject>(container, "default");

            // Set a key in the root map. The Container is created in "read" mode and so it cannot currently pick
            // tasks. Sending an op will switch it to "write" mode.
            dataObject._root.set("tempKey", "tempValue");

            while (!container.deltaManager.active) {
                await args.opProcessingController.process();
            }
        });

        it("No tasks initially", async () => {
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
        });

        it("Can pick tasks", async () => {
            await scheduler.pick("task1", async () => { });
            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader, "task1"]);
        });

        it("Can pick and release tasks", async () => {
            await scheduler.pick("task1", async () => { });
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader, "task1"]);
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
        });

        it("Can register task without picking up", async () => {
            await scheduler.register("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
        });

        it("Duplicate picking fails", async () => {
            await scheduler.pick("task1", async () => { });
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader, "task1"]);
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
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader, "task1"]);
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
            await scheduler.pick("task1", async () => { });
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader, "task1"]);
        });

        it("Single client must be the leader", async () => {
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
            await scheduler.pick("task1", async () => { });
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
        });
    });

    describe("Multiple clients", () => {
        let container1: IContainer | oldTypes.IContainer;
        let container2: IContainer | oldTypes.IContainer;
        let scheduler1: IAgentScheduler;
        let scheduler2: IAgentScheduler;

        beforeEach(async () => {
            // Create a new Container for the first document.
            container1 = await args.makeTestContainer();
            scheduler1 = await requestFluidObject<TaskManager>(container1, taskSchedulerId)
                .then((taskManager) => taskManager.IAgentScheduler);
            const dataObject1 = await requestFluidObject<TestDataObject>(container1, "default");

            // Set a key in the root map. The Container is created in "read" mode and so it cannot currently pick
            // tasks. Sending an op will switch it to "write" mode.
            dataObject1._root.set("tempKey1", "tempValue1");
            while (!container1.deltaManager.active) {
                await args.opProcessingController.process();
            }
            // Load existing Container for the second document.
            container2 = await args.loadTestContainer();
            scheduler2 = await requestFluidObject<TaskManager>(container2, taskSchedulerId)
                .then((taskManager) => taskManager.IAgentScheduler);
            const dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");

            // Set a key in the root map. The Container is created in "read" mode and so it cannot currently pick
            // tasks. Sending an op will switch it to "write" mode.
            dataObject2._root.set("tempKey2", "tempValue2");
            while (!container2.deltaManager.active) {
                await args.opProcessingController.process();
            }
        });

        it("No tasks initially", async () => {
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), []);
        });

        it("Clients agree on picking tasks sequentially", async () => {
            await scheduler1.pick("task1", async () => { });

            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), []);
            await scheduler2.pick("task2", async () => { });

            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task2"]);
        });

        it("Picking same tasks are exclusive and agreed upon", async () => {
            await scheduler1.pick("task1", async () => { });
            await scheduler1.pick("task2", async () => { });
            await scheduler1.pick("task3", async () => { });
            await scheduler2.pick("task2", async () => { });
            await scheduler2.pick("task3", async () => { });
            await scheduler2.pick("task4", async () => { });

            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task3"]);
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

            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task5"]);
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

            await args.opProcessingController.process();
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

            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task5"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4", "task6"]);
            await scheduler1.release("task2", "task1", "task5");

            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader]);

            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler2.pickedTasks().sort(), ["task1", "task2", "task4", "task5", "task6"]);
            await scheduler1.pick("task1", async () => { });
            await scheduler1.pick("task2", async () => { });
            await scheduler1.pick("task5", async () => { });
            await scheduler1.pick("task6", async () => { });
            await scheduler2.release("task2", "task1", "task4", "task5", "task6");

            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler1.pickedTasks().sort(),
                [leader, "task1", "task2", "task4", "task5", "task6"]);
        });

        it("Releasing leadership should automatically elect a new leader", async () => {
            await scheduler1.release(leader);

            await args.opProcessingController.process();
            assert.deepStrictEqual(scheduler1.pickedTasks(), []);
            assert.deepStrictEqual(scheduler2.pickedTasks(), [leader]);
        });
    });
};

describe("AgentScheduler", () => {
    generateTest(tests);
});
