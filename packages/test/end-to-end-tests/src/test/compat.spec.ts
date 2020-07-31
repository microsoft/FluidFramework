/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { Container } from "@fluidframework/container-loader";
import {
    compatTest,
    createPrimedComponentFactory,
    createContainer,
    createContainerWithOldLoader,
    createOldPrimedComponentFactory,
    createOldRuntimeFactory,
    createRuntimeFactory,
    TestComponent,
    OldTestComponent,
} from "./compatUtils";
import * as old from "./oldVersion";

describe("loader/runtime compatibility", () => {
    async function requestFluidObject<T>(componentId: string, container: Container | old.Container): Promise<T> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200
            || (response.mimeType !== "fluid/component" && response.mimeType !== "fluid/object")) {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as T;
    }

    const tests = function(makeTestContainer: () => Promise<Container | old.Container>) {
        let container: Container | old.Container;
        let component: TestComponent | OldTestComponent;
        let containerError: boolean = false;

        beforeEach(async function() {
            container = await makeTestContainer();
            container.on("warning", () => containerError = true);
            container.on("closed", (error) => containerError = containerError || error !== undefined);

            component = await requestFluidObject<TestComponent>("default", container);

            this.opProcessingController.addDeltaManagers(component._runtime.deltaManager);
        });

        afterEach(async function() {
            assert.strictEqual(containerError, false, "container error");
        });

        it("loads", async function() {
            await this.opProcessingController.process();
        });

        it("can set/get on root directory", async function() {
            const test = ["fluid is", "pretty neat!"];
            (component._root as any).set(test[0], test[1]);
            assert.strictEqual(await component._root.wait(test[0]), test[1]);
        });

        it("can summarize", async function() {
            // wait for summary ack/nack
            await new Promise((resolve, reject) => container.on("op", (op) => {
                if (op.type === "summaryAck") {
                    resolve();
                } else if (op.type === "summaryNack") {
                    reject("summaryNack");
                }
            }));
        });

        it("can load existing", async function() {
            const test = ["prague is", "also neat"];
            (component._root as any).set(test[0], test[1]);
            assert.strictEqual(await component._root.wait(test[0]), test[1]);

            const containersP: Promise<Container | old.Container>[] = [
                createContainer( // new everything
                    { fluidExport: createRuntimeFactory(TestComponent.type, createPrimedComponentFactory()) },
                    this.deltaConnectionServer),
                createContainerWithOldLoader( // old loader, new container/component runtimes
                    { fluidExport: createRuntimeFactory(TestComponent.type, createPrimedComponentFactory()) },
                    this.deltaConnectionServer),
                createContainerWithOldLoader( // old everything
                    { fluidExport: createOldRuntimeFactory(TestComponent.type, createOldPrimedComponentFactory()) },
                    this.deltaConnectionServer),
                createContainer( // new loader, old container/component runtimes
                    { fluidExport: createOldRuntimeFactory(TestComponent.type, createOldPrimedComponentFactory()) },
                    this.deltaConnectionServer),
                createContainer( // new loader/container runtime, old component runtime
                    { fluidExport: createRuntimeFactory(TestComponent.type, createOldPrimedComponentFactory()) },
                    this.deltaConnectionServer),
            ];

            const components = await Promise.all(containersP.map(async (containerP) => containerP.then(
                async (c) => requestFluidObject<TestComponent | OldTestComponent>("default", c))));

            // get initial test value from each component
            components.map(async (c) => assert.strictEqual(await c._root.wait(test[0]), test[1]));

            // set a test value from every component (besides initial)
            const test2 = [...Array(components.length).keys()].map((x) => x.toString());
            components.map(async (c, i) => (c._root as any).set(test2[i], test2[i]));

            // get every test value from every component (besides initial)
            components.map(async (c) => test2.map(
                async (testVal) => assert.strictEqual(await c._root.wait(testVal), testVal)));

            // get every value from initial component
            test2.map(async (testVal) => assert.strictEqual(await component._root.wait(testVal), testVal));
        });
    };

    compatTest(tests);
});
