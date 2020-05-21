/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { AgentSchedulerFactory, TaskManager } from "@microsoft/fluid-agent-scheduler";
import { IFluidCodeDetails, ILoader } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { DocumentDeltaEventManager } from "@microsoft/fluid-local-driver";
import { IAgentScheduler } from "@microsoft/fluid-runtime-definitions";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@microsoft/fluid-test-utils";

describe("AgentScheduler", () => {
    const leader = "leader";
    const id = "fluid-test://localhost/agentSchedulerTest";
    const codeDetails: IFluidCodeDetails = {
        package: "agentSchedulerTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;

    async function createContainer(): Promise<Container> {
        const loader: ILoader = createLocalLoader([
            [ codeDetails, new AgentSchedulerFactory() ],
        ], deltaConnectionServer);

        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent(componentId: string, container: Container): Promise<TaskManager> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as TaskManager;
    }

    describe("Single client", () => {
        let scheduler: IAgentScheduler;

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();

            const container = await createContainer();
            scheduler = await getComponent("_scheduler", container)
                .then((taskManager) => taskManager.IAgentScheduler);

            // Make sure all initial ops (around leadership) are processed.
            // It takes a while because we start in unattached mode, and attach scheduler,
            // which causes loss of all tasks and reassignment.
            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
            containerDeltaEventManager.registerDocuments(container);
            await containerDeltaEventManager.process();
            containerDeltaEventManager.resumeProcessing(container);
        });

        it("No tasks initially", async () => {
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
        });

        it("Can pick tasks", async () => {
            await scheduler.pick("task1", async () => {});
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
        });

        it("Can pick and release tasks", async () => {
            await scheduler.pick("task1", async () => {});
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
        });

        it("Can register task without picking up", async () => {
            await scheduler.register("task1");
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader]);
        });

        it("Duplicate picking fails", async () => {
            await scheduler.pick("task1", async () => {});
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
            await scheduler.pick("task1", async () => {}).catch((err) => {
                assert.deepStrictEqual(err, "task1 is already attempted");
            });
        });

        it("Unpicked task release should fail", async () => {
            await scheduler.pick("task1", async () => {});
            await scheduler.release("task2").catch((err) => {
                assert.deepStrictEqual(err, "task2 was never registered");
            });
        });

        it("Should pick previously released task", async () => {
            await scheduler.pick("task1", async () => {});
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks(), [leader]);
            await scheduler.pick("task1", async () => {});
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader, "task1"]);
        });

        it("Single client must be the leader", async () => {
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader]);
            await scheduler.pick("task1", async () => {});
            await scheduler.release("task1");
            assert.deepStrictEqual(scheduler.pickedTasks() , [leader]);
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("Multiple clients", () => {
        let container1: Container;
        let container2: Container;
        let scheduler1: IAgentScheduler;
        let scheduler2: IAgentScheduler;

        async function syncContainers() {
            // Pauses the deltaQueues of the containers. Waits until all pending ops in the container
            // and the server are processed.
            await containerDeltaEventManager.process();
            // Resume the containes because they would have been paused by the above process call.
            containerDeltaEventManager.resumeProcessing(container1, container2);
        }

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();

            container1 = await createContainer();
            scheduler1 = await getComponent("_scheduler", container1)
                .then((taskManager) => taskManager.IAgentScheduler);

            container2 = await createContainer();
            scheduler2 = await getComponent("_scheduler", container2)
                .then((taskManager) => taskManager.IAgentScheduler);

            // Make sure all initial ops (around leadership) are processed.
            // It takes a while because we start in unattached mode, and attach scheduler,
            // which causes loss of all tasks and reassignment.
            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
            containerDeltaEventManager.registerDocuments(container1, container2);
            await syncContainers();
        });

        it("No tasks initially", async () => {
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), []);
        });

        it("Clients agree on picking tasks sequentially", async () => {
            await scheduler1.pick("task1", async () => {});

            await syncContainers();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), []);
            await scheduler2.pick("task2", async () => {});

            await syncContainers();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task2"]);
        });

        it("Picking same tasks are exclusive and agreed upon", async () => {
            await scheduler1.pick("task1", async () => {});
            await scheduler1.pick("task2", async () => {});
            await scheduler1.pick("task3", async () => {});
            await scheduler2.pick("task2", async () => {});
            await scheduler2.pick("task3", async () => {});
            await scheduler2.pick("task4", async () => {});

            await syncContainers();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task3"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4"]);
        });

        it("Concurrent task picking outcome should be deterministic", async () => {
            await scheduler1.pick("task1", async () => {});
            await scheduler1.pick("task2", async () => {});
            await scheduler2.pick("task2", async () => {});
            await scheduler2.pick("task1", async () => {});
            await scheduler2.pick("task4", async () => {});
            await scheduler1.pick("task4", async () => {});
            await scheduler1.pick("task5", async () => {});
            await scheduler2.pick("task5", async () => {});
            await scheduler2.pick("task6", async () => {});

            await syncContainers();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task5"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4", "task6"]);
        });

        it("Tasks not currently hold can not be released", async () => {
            await scheduler1.pick("task1", async () => {});
            await scheduler1.pick("task2", async () => {});
            await scheduler2.pick("task2", async () => {});
            await scheduler2.pick("task1", async () => {});
            await scheduler2.pick("task4", async () => {});
            await scheduler1.pick("task4", async () => {});
            await scheduler1.pick("task5", async () => {});
            await scheduler2.pick("task5", async () => {});
            await scheduler2.pick("task6", async () => {});

            await syncContainers();
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
            await scheduler1.pick("task1", async () => {});
            await scheduler1.pick("task2", async () => {});
            await scheduler2.pick("task2", async () => {});
            await scheduler2.pick("task1", async () => {});
            await scheduler2.pick("task4", async () => {});
            await scheduler1.pick("task4", async () => {});
            await scheduler1.pick("task5", async () => {});
            await scheduler2.pick("task5", async () => {});
            await scheduler2.pick("task6", async () => {});

            await syncContainers();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader, "task1", "task2", "task5"]);
            assert.deepStrictEqual(scheduler2.pickedTasks(), ["task4", "task6"]);
            await scheduler1.release("task2", "task1", "task5");

            await syncContainers();
            assert.deepStrictEqual(scheduler1.pickedTasks(), [leader]);

            await syncContainers();
            assert.deepStrictEqual(scheduler2.pickedTasks().sort(), ["task1", "task2", "task4", "task5", "task6"]);
            await scheduler1.pick("task1", async () => {});
            await scheduler1.pick("task2", async () => {});
            await scheduler1.pick("task5", async () => {});
            await scheduler1.pick("task6", async () => {});
            await scheduler2.release("task2", "task1", "task4", "task5", "task6");

            await syncContainers();
            assert.deepStrictEqual(scheduler1.pickedTasks().sort(),
                [leader, "task1", "task2", "task4", "task5", "task6"]);
        });

        it("Releasing leadership should automatically elect a new leader", async () => {
            await scheduler1.release(leader);

            await syncContainers();
            assert.deepStrictEqual(scheduler1.pickedTasks(), []);
            assert.deepStrictEqual(scheduler2.pickedTasks(), [leader]);
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
});
