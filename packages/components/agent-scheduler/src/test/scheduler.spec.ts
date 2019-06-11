// tslint:disable no-useless-files
/*
// tslint:disable no-import-side-effect
// tslint:disable no-empty
import { Component } from "@prague/app-component";
import { TestHost } from "@prague/local-test-server";
import * as assert from "assert";
import "mocha";
import { AgentScheduler } from "../";

const AgentSchedulerType = "@chaincode/agent-scheduler";

describe("AgentScheduler", () => {
    const createEmptyTask = (id: string) => {
        return {
            callback: () => {},
            id,
        };
    };
    const leader = "leader";

    describe("Single client", () => {
        let host: TestHost;

        before(() => {
            host = new TestHost([
                [AgentSchedulerType, Promise.resolve(Component.createComponentFactory(AgentScheduler))],
            ]);
        });

        after(async () => { await host.close(); });

        async function createScheduler() {
            return host.createAndOpenComponent("scheduler", AgentSchedulerType);
        }

        let scheduler: AgentScheduler;
        beforeEach(async () => {
            scheduler = await createScheduler() as AgentScheduler;
        });

        it("No tasks initially", async () => {
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
        });

        it("Can pick tasks", async () => {
            await scheduler.pick(createEmptyTask("task1"));
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
        });

        it("Can pick and release tasks", async () => {
            await scheduler.pick(createEmptyTask("task1"));
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
        });

        it("Can register task without picking up", async () => {
            await scheduler.register("task1");
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader]);
        });

        it("Duplicate picking fails", async () => {
            await scheduler.pick(createEmptyTask("task1"));
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
            await scheduler.pick(createEmptyTask("task1")).catch((err) => {
                assert.deepStrictEqual(err, "task1 is already attempted");
            });
        });
        it("Unpicked task release should fail", async () => {
            await scheduler.pick(createEmptyTask("task1"));
            await scheduler.release("task2").catch((err) => {
                assert.deepStrictEqual(err, "task2 was never registered");
            });
        });
        it("Should pick previously released task", async () => {
            await scheduler.pick(createEmptyTask("task1"));
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
            await scheduler.pick(createEmptyTask("task1"));
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
        });
        it("Single client must be the leader", async () => {
            assert(scheduler.leader, "No leader present");
        });
    });

    describe("Multiple clients", () => {
        let host1: TestHost;
        let host2: TestHost;
        let scheduler1: AgentScheduler;
        let scheduler2: AgentScheduler;

        beforeEach(async () => {
            host1 = new TestHost([
                [AgentSchedulerType, Promise.resolve(Component.createComponentFactory(AgentScheduler))],
            ]);
            host2 = host1.clone();
            scheduler1 = await host1.createAndOpenComponent("scheduler", AgentSchedulerType);
            scheduler2 = await host2.openComponent("scheduler");
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
            await scheduler1.pick(createEmptyTask("task1"));
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), []);
            await scheduler2.pick(createEmptyTask("task2"));
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task2"]);
        });

        it("Picking same tasks are exclusive and agreed upon", async () => {
            await scheduler1.pick(createEmptyTask("task1"), createEmptyTask("task2"), createEmptyTask("task3"));
            await scheduler2.pick(createEmptyTask("task2"), createEmptyTask("task3"), createEmptyTask("task4"));
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task3"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4"]);
        });

        it("Concurrent task picking outcome should be deterministic", async () => {
            scheduler1.pick(createEmptyTask("task1"), createEmptyTask("task2"));
            scheduler2.pick(createEmptyTask("task2"), createEmptyTask("task1"), createEmptyTask("task4"));
            scheduler1.pick(createEmptyTask("task4"), createEmptyTask("task5"));
            scheduler2.pick(createEmptyTask("task5"), createEmptyTask("task6"));
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task5"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4", "task6"]);
        });

        it("Tasks not currently hold can not be released", async () => {
            scheduler1.pick(createEmptyTask("task1"), createEmptyTask("task2"));
            scheduler2.pick(createEmptyTask("task2"), createEmptyTask("task1"), createEmptyTask("task4"));
            scheduler1.pick(createEmptyTask("task4"), createEmptyTask("task5"));
            scheduler2.pick(createEmptyTask("task5"), createEmptyTask("task6"));
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
            scheduler1.pick(createEmptyTask("task1"), createEmptyTask("task2"));
            scheduler2.pick(createEmptyTask("task2"), createEmptyTask("task1"), createEmptyTask("task4"));
            scheduler1.pick(createEmptyTask("task4"), createEmptyTask("task5"));
            scheduler2.pick(createEmptyTask("task5"), createEmptyTask("task6"));
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task5"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4", "task6"]);
            scheduler1.release("task2", "task1", "task5");
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader]);
            await TestHost.sync(host2);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task1", "task2", "task4", "task5", "task6"]);
            scheduler1.pick(createEmptyTask("task1"), createEmptyTask("task2"), createEmptyTask("task5"), createEmptyTask("task6"));
            scheduler2.release("task2", "task1", "task4", "task5", "task6");
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task4", "task5", "task6"]);
        });

        it("Releasing leadership should automaticlly elect a new leader", async () => {
            scheduler1.release(leader);
            await TestHost.sync(host1, host2);
            assert.deepStrictEqual(scheduler1.pickedTasks(), []);
            assert.deepStrictEqual(scheduler2.pickedTasks(), [leader]);
        });
    });
});
*/
