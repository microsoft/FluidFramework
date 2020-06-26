/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IFluidCodeDetails, IFluidPackage, ILoader, IRuntimeFactory } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@fluidframework/test-utils";
import * as old from "./oldVersion";

const V1 = "0.1.0";
const V2 = "0.2.0";

// A simple component with runtime/root exposed for testing purposes. Two
// different versions (defined below) are used to test context reload.
abstract class TestComponent extends PrimedComponent {
    public static readonly type = "@fluid-example/test-component";
    public readonly version: string;
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

class TestComponentV1 extends TestComponent {
    public static readonly version = V1;
    public readonly version = V1;
}

class TestComponentV2 extends TestComponent {
    public static readonly version = V2;
    public readonly version = V2;
    public static readonly testKey = "version2";
    protected async componentHasInitialized() {
        this.root.set(TestComponentV2.testKey, true);
    }
}

// A simple old-version component with runtime/root exposed for testing
// purposes. Used to test compatibility of context reload between
// different runtime versions.
abstract class OldTestComponent extends old.PrimedComponent {
    public static readonly type = "@fluid-example/test-component";
    public readonly version: string;
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

class OldTestComponentV1 extends OldTestComponent {
    public static readonly version = V1;
    public readonly version = V1;
}

class OldTestComponentV2 extends OldTestComponent {
    public static readonly version = V2;
    public readonly version = V2;
    public static readonly testKey = "version2";
    protected async componentHasInitialized() {
        this.root.set(OldTestComponentV2.testKey, true);
    }
}

describe("context reload", function() {
    const id = "fluid-test://localhost/contextReloadTest";
    const codeDetails = (version: string): IFluidCodeDetails => {
        return {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            package: { name: TestComponent.type, version } as IFluidPackage,
            config: {},
        };
    };
    const defaultCodeDetails = codeDetails(V1);

    const proposeAndWaitForReload = async (version: string, ...containers: Container[]) => {
        // propose
        await containers[0].getQuorum().propose("code", codeDetails(version));
        // wait for "contextChanged" events on all containers
        return Promise.all(containers.map(
            async (container) => new Promise((resolve, reject) =>
                container.on("contextChanged", (code: IFluidCodeDetails) =>
                    typeof code.package === "object" && code.package.version === version ? resolve() : reject()))));
    };

    async function createContainer(packageEntries, server): Promise<Container> {
        const loader: ILoader = createLocalLoader(packageEntries, server);
        return initializeLocalContainer(id, loader, defaultCodeDetails);
    }

    async function createContainerWithOldLoader(packageEntries, server): Promise<old.Container> {
        const loader = old.createLocalLoader(packageEntries, server);
        return old.initializeLocalContainer(id, loader, defaultCodeDetails);
    }

    async function getComponent<T>(componentId: string, container: Container | old.Container): Promise<T> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as T;
    }

    const createRuntimeFactory = (component): IRuntimeFactory => {
        const type = TestComponent.type;
        return new ContainerRuntimeFactoryWithDefaultComponent(
            type,
            [[type, Promise.resolve(new PrimedComponentFactory(type, component, [], {}))]],
        );
    };

    const createOldRuntimeFactory = (component): old.IRuntimeFactory => {
        const type = OldTestComponent.type;
        return new old.ContainerRuntimeFactoryWithDefaultComponent(
            type,
            [[type, Promise.resolve(new old.PrimedComponentFactory(type, component, [], {}))]],
        );
    };

    const tests = function() {
        it("is followed by an immediate summary", async function() {
            let success = true;
            // This can be enabled when the old dependencies are updated to 0.21. Before this, Summarizer
            // generates warnings when it doesn't submit a summary, even after it's been disposed, which
            // was fixed in 0.21
            // this.container.on("warning", () => success = false);
            this.container.on("closed", (error) => success = success && error === undefined);

            await this.container.getQuorum().propose("code", codeDetails(V2));

            // wait for summary ack/nack (non-immediate summary will result in test timeout)
            await new Promise((resolve, reject) => this.container.on("op", (op) => {
                if (op.type === "summaryAck") {
                    resolve();
                } else if (op.type === "summaryNack") {
                    reject();
                }
            }));

            assert.strictEqual(success, true, "container error");
        });

        it("retains data", async function() {
            let success = true;
            this.container.on("warning", () => success = false);
            this.container.on("closed", (error) => success = success && error === undefined);

            const test = ["fluid", "is great!"];
            this.componentV1._root.set(test[0], test[1]);

            await proposeAndWaitForReload(V2, this.container);

            const componentV2 = await getComponent<TestComponent>("default", this.container);

            assert.strictEqual(await componentV2._root.get(test[0]), test[1]);
            assert.strictEqual(success, true, "container error");
        });

        it("loads version 2", async function() {
            let success = true;
            this.container.on("warning", () => success = false);
            this.container.on("closed", (error) => success = success && error === undefined);

            assert.strictEqual(this.componentV1.version, TestComponentV1.version);

            await proposeAndWaitForReload(V2, this.container);

            const componentV2 = await getComponent<TestComponent>("default", this.container);

            assert.strictEqual(componentV2.version, TestComponentV2.version);

            assert(await componentV2._root.wait(TestComponentV2.testKey));
            assert.strictEqual(success, true, "container error");
        });
    };

    describe("single container", () => {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.container = await createContainer([
                [codeDetails(V1), { fluidExport: createRuntimeFactory(TestComponentV1) }],
                [codeDetails(V2), { fluidExport: createRuntimeFactory(TestComponentV2) }],
            ], this.deltaConnectionServer);
            this.componentV1 = await getComponent<TestComponent>("default", this.container);
            assert.strictEqual(this.componentV1.version, TestComponentV1.version);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("two containers", () => {
        it("loads version 2", async () => {
            const deltaConnectionServer = LocalDeltaConnectionServer.create();

            const packageEntries = [
                [codeDetails(V1), { fluidExport: createRuntimeFactory(TestComponentV1) }],
                [codeDetails(V2), { fluidExport: createRuntimeFactory(TestComponentV2) }],
            ];

            const containers = await Promise.all([
                createContainer(packageEntries, deltaConnectionServer),
                createContainer(packageEntries, deltaConnectionServer),
            ]);
            let success = true;
            containers.map((container) => container.on("warning", () => success = false));
            containers.map((container) => container.on("closed", (error) => success = success && error === undefined));

            let components = await Promise.all(containers.map(
                async (container) => getComponent<TestComponent>("default", container)));

            assert.strictEqual(components[0].version, TestComponentV1.version);
            assert.strictEqual(components[1].version, TestComponentV1.version);

            await proposeAndWaitForReload(V2, ...containers);

            components = await Promise.all(containers.map(
                async (container) => getComponent<TestComponent>("default", container)));

            assert.strictEqual(components[0].version, TestComponentV2.version);
            assert.strictEqual(components[1].version, TestComponentV2.version);

            const test1 = await components[0]._root.wait(TestComponentV2.testKey);
            const test2 = await components[1]._root.wait(TestComponentV2.testKey);
            assert(test1);
            assert.strictEqual(test1, test2);

            assert.strictEqual(success, true, "container error");
        });
    });

    describe("compat", () => {
        describe("old loader, new runtime", () => {
            beforeEach(async function() {
                this.deltaConnectionServer = LocalDeltaConnectionServer.create();
                this.container = await createContainerWithOldLoader([
                    [codeDetails(V1), { fluidExport: createOldRuntimeFactory(OldTestComponentV1) }],
                    [codeDetails(V2), { fluidExport: createRuntimeFactory(TestComponentV2) }],
                ], this.deltaConnectionServer);
                this.componentV1 = await getComponent<OldTestComponent>("default", this.container);
                assert.strictEqual(this.componentV1.version, TestComponentV1.version);
            });

            tests();

            afterEach(async function() {
                await this.deltaConnectionServer.webSocketServer.close();
            });
        });

        describe("new loader, old runtime", () => {
            beforeEach(async function() {
                this.deltaConnectionServer = LocalDeltaConnectionServer.create();
                this.container = await createContainer([
                    [codeDetails(V1), { fluidExport: createRuntimeFactory(TestComponentV1) }],
                    [codeDetails(V2), { fluidExport: createOldRuntimeFactory(OldTestComponentV2) }],
                ], this.deltaConnectionServer);
                this.componentV1 = await getComponent<TestComponent>("default", this.container);
                assert.strictEqual(this.componentV1.version, TestComponentV1.version);
            });

            tests();

            afterEach(async function() {
                await this.deltaConnectionServer.webSocketServer.close();
            });
        });
    });
});
