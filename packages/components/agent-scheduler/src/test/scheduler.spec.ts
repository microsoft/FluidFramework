/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-console
// tslint:disable no-import-side-effect
import { TestHost } from "@microsoft/fluid-local-test-server";
import { IAgentScheduler } from "@microsoft/fluid-runtime-definitions";
import * as assert from "assert";
import "mocha";
import { AgentSchedulerFactory, TaskManager } from "../scheduler";

const AgentSchedulerType = "@microsoft/fluid-agent-scheduler";

describe("AgentScheduler", () => {
    /*
    const createEmptyTask = (id: string) => {
        return {
            callback: () => {},
            id,
        };
    }; */
    const leader = "leader";

    /*
    async function createScheduler(host: TestHost): Promise<TaskManager> {
        return host.createAndAttachComponent<TaskManager>("scheduler", AgentSchedulerType);
    } */

    describe("Single client", () => {
        let host: TestHost;

        beforeEach(() => {
            host = new TestHost([
                [AgentSchedulerType, Promise.resolve(new AgentSchedulerFactory())],
            ]);
        });

        afterEach(async () => { await host.close(); });

        let scheduler: IAgentScheduler;
        beforeEach(async () => {
            // scheduler = await createScheduler(host).then((taskmanager) => taskmanager.IAgentScheduler);
            scheduler = await host.getComponent<TaskManager>("_scheduler")
                .then((taskmanager) => taskmanager.IAgentScheduler);
        });

        it("No tasks initially", async () => {
            assert.deepStrictEqual(scheduler.pickedTasks(), []);
            console.log(scheduler.pickedTasks());
        });

        it("Can pick tasks", async () => {
            // await scheduler.pick(createEmptyTask("task1"));
            await scheduler.pick("task1");
            console.log(scheduler.pickedTasks());
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
        });

        it("Can pick and release tasks", async () => {
            await scheduler.pick("task1");
            console.log(scheduler.pickedTasks());
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
            await scheduler.release("task1");
            console.log(scheduler.pickedTasks());
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
        });

        it("Can register task without picking up", async () => {
            await scheduler.register("task1");
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader]);
        });

        it("Duplicate picking fails", async () => {
            await scheduler.pick("task1");
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
            await scheduler.pick("task1").catch((err) => {
                assert.deepStrictEqual(err, "task1 is already attempted");
            });
        });

        it("Unpicked task release should fail", async () => {
            await scheduler.pick("task1");
            await scheduler.release("task2").catch((err) => {
                assert.deepStrictEqual(err, "task2 was never registered");
            });
        });

        it("Should pick previously released task", async () => {
            await scheduler.pick("task1");
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
            await scheduler.pick("task1");
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
        });

        it("Single client must be the leader", async () => {
            assert(!scheduler.leader, "leader present");
            await scheduler.pick("task1");
            assert(scheduler.leader, "No leader present");
            await scheduler.release("task1");
            assert(scheduler.leader, "No leader present");
        });
    });

    describe("Multiple clients", () => {
        let host1: TestHost;
        let host2: TestHost;
        let scheduler1: IAgentScheduler;
        let scheduler2: IAgentScheduler;

        beforeEach(async () => {
            host1 = new TestHost([
                [AgentSchedulerType, Promise.resolve(new AgentSchedulerFactory())],
            ]);
            host2 = host1.clone();
            // scheduler1 = await host1.createAndAttachComponent<TaskManager>("scheduler", AgentSchedulerType)
            //     .then((taskmanager) => taskmanager.IAgentScheduler);
            // scheduler2 = await host2.waitComponent("scheduler");
            // scheduler2 = await host1.createAndAttachComponent<TaskManager>("scheduler", AgentSchedulerType)
            //     .then((taskmanager) => taskmanager.IAgentScheduler);
            // scheduler1 = await createScheduler(host1).then((taskmanager) => taskmanager.IAgentScheduler);
            scheduler1 = await host1.getComponent<TaskManager>("_scheduler")
                .then((taskmanager) => taskmanager.IAgentScheduler);
            scheduler2 = await host2.getComponent<TaskManager>("_scheduler")
                .then((taskmanager) => taskmanager.IAgentScheduler);
        });

        afterEach(async () => {
            await TestHost.sync(host1, host2);
            await host1.close();
            await host2.close();
        });

        it("No tasks initially", async () => {
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), []);
        });

        it("Clients agree on picking tasks sequentially", async () => {
            await scheduler1.pick("task1");
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), []);
            await scheduler2.pick("task2");
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task2"]);
        });

        it("Picking same tasks are exclusive and agreed upon", async () => {
            await scheduler1.pick("task1", "task2", "task3");
            await scheduler2.pick("task2", "task3", "task4");
            await TestHost.sync(host1, host2);
            console.log(scheduler1.pickedTasks());
            console.log(scheduler2.pickedTasks());
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task3"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4"]);
        });

        it("Concurrent task picking outcome should be deterministic", async () => {
            await scheduler1.pick("task1", "task2");
            await scheduler2.pick("task2", "task1", "task4");
            await scheduler1.pick("task4", "task5");
            await scheduler2.pick("task5", "task6");
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task5"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4", "task6"]);
        });

        it("Tasks not currently hold can not be released", async () => {
            await scheduler1.pick("task1", "task2");
            await scheduler2.pick("task2", "task1", "task4");
            await scheduler1.pick("task4", "task5");
            await scheduler2.pick("task5", "task6");
            await TestHost.sync(host1, host2);
            await scheduler1.release("task4").catch((err) => {
                assert.deepStrictEqual(err, "task4 was never picked");
            });
            await scheduler2.release("task1").catch((err) => {
                assert.deepStrictEqual(err, "task1 was never picked");
            });
            await scheduler2.release("task2").catch((err) => {
                assert.deepStrictEqual(err, "task2 was never picked");
            });
        });

        it("Released tasks are automatically picked up by interested clients", async () => {
            await scheduler1.pick("task1", "task2");
            await scheduler2.pick("task2", "task1", "task4");
            await scheduler1.pick("task4", "task5");
            await scheduler2.pick("task5", "task6");
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task5"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4", "task6"]);
            await scheduler1.release("task2", "task1", "task5");
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader]);
            await TestHost.sync(host2);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task1", "task2", "task4", "task5", "task6"]);
            await scheduler1.pick("task1", "task2", "task5", "task6");
            await scheduler2.release("task2", "task1", "task4", "task5", "task6");
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task4", "task5", "task6"]);
        });

        it("Releasing leadership should automatically elect a new leader", async () => {
            await scheduler1.release(leader);
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), []);
            assert.deepStrictEqual(scheduler2.pickedTasks(), [leader]);
        });
    });
});
// */
