/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ISharedCounter, SharedCounter } from "@fluidframework/counter";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";

describe("Counter", () => {
    const id = "fluid-test://localhost/counterTest";
    const counterId = "counterKey";
    const codeDetails: IFluidCodeDetails = {
        package: "sharedCounterTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;
    let component1: ITestFluidComponent;
    let sharedCounter1: ISharedCounter;
    let sharedCounter2: ISharedCounter;
    let sharedCounter3: ISharedCounter;

    async function createContainer(): Promise<Container> {
        const factory = new TestFluidComponentFactory([[ counterId, SharedCounter.getFactory() ]]);
        const loader: ILoader = createLocalLoader([[ codeDetails, factory ]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const container1 = await createContainer();
        component1 = await getComponent("default", container1);
        sharedCounter1 = await component1.getSharedObject<SharedCounter>(counterId);

        const container2 = await createContainer();
        const component2 = await getComponent("default", container2);
        sharedCounter2 = await component2.getSharedObject<SharedCounter>(counterId);

        const container3 = await createContainer();
        const component3 = await getComponent("default", container3);
        sharedCounter3 = await component3.getSharedObject<SharedCounter>(counterId);

        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime, component3.runtime);

        await containerDeltaEventManager.process();
    });

    function verifyCounterValue(counter: ISharedCounter, expectedValue, index: number) {
        const userValue = counter.value;
        assert.equal(userValue, expectedValue,
            `Incorrect value ${userValue} instead of ${expectedValue} in container ${index}`);
    }

    function verifyCounterValues(value1, value2, value3) {
        verifyCounterValue(sharedCounter1, value1, 1);
        verifyCounterValue(sharedCounter2, value2, 2);
        verifyCounterValue(sharedCounter3, value3, 3);
    }

    describe("constructor", () => {
        it("can create the counter in 3 containers correctly", async () => {
            // Counter was created in beforeEach
            assert.ok(sharedCounter1, `Couldn't find the counter in container1, instead got ${sharedCounter1}`);
            assert.ok(sharedCounter2, `Couldn't find the counter in container2, instead got ${sharedCounter2}`);
            assert.ok(sharedCounter3, `Couldn't find the counter in container3, instead got ${sharedCounter3}`);
        });
    });

    describe("usage", () => {
        it("can get the value in 3 containers correctly", async () => {
            // Counter was created in beforeEach
            verifyCounterValues(0, 0, 0);
        });

        it("can increment and decrement the value in 3 containers correctly", async () => {
            sharedCounter2.increment(7);
            await containerDeltaEventManager.process();
            assert.equal(sharedCounter1.value, 7);
            assert.equal(sharedCounter2.value, 7);
            assert.equal(sharedCounter3.value, 7);
            sharedCounter3.increment(-20);
            await containerDeltaEventManager.process();
            assert.equal(sharedCounter1.value, -13);
            assert.equal(sharedCounter2.value, -13);
            assert.equal(sharedCounter3.value, -13);
        });

        it("fires incremented events in 3 containers correctly", async () => {
            const incrementSteps: {incrementer: ISharedCounter, incrementAmount: number}[] = [
                { incrementer: sharedCounter3, incrementAmount: -1 },
                { incrementer: sharedCounter1, incrementAmount: 3 },
                { incrementer: sharedCounter2, incrementAmount: 10 },
                { incrementer: sharedCounter1, incrementAmount: -9 },
                { incrementer: sharedCounter2, incrementAmount: 4 },
            ];

            let expectedEventCount = 0;
            let expectedValue = 0;

            let eventCount1 = 0;
            let eventCount2 = 0;
            let eventCount3 = 0;

            sharedCounter1.on("incremented", (incrementAmount: number, newValue: number) => {
                assert.equal(incrementAmount, incrementSteps[0].incrementAmount);
                assert.equal(newValue, expectedValue);
                eventCount1++;
            });
            sharedCounter2.on("incremented", (incrementAmount: number, newValue: number) => {
                assert.equal(incrementAmount, incrementSteps[0].incrementAmount);
                assert.equal(newValue, expectedValue);
                eventCount2++;
            });
            sharedCounter3.on("incremented", (incrementAmount: number, newValue: number) => {
                assert.equal(incrementAmount, incrementSteps[0].incrementAmount);
                assert.equal(newValue, expectedValue);
                eventCount3++;
            });

            while (incrementSteps.length > 0) {
                // set up for next increment, incrementSteps[0] holds the in-progress step
                const { incrementer, incrementAmount } = incrementSteps[0];
                expectedEventCount++;
                expectedValue += incrementAmount;

                // do the increment
                incrementer.increment(incrementAmount);
                await containerDeltaEventManager.process();

                // event count is correct
                assert.equal(eventCount1, expectedEventCount);
                assert.equal(eventCount2, expectedEventCount);
                assert.equal(eventCount3, expectedEventCount);

                // counter value is updated correctly
                assert.equal(sharedCounter1.value, expectedValue);
                assert.equal(sharedCounter2.value, expectedValue);
                assert.equal(sharedCounter3.value, expectedValue);

                // done with this step
                incrementSteps.shift();
            }
        });
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
