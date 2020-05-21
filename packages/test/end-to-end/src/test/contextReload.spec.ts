/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { PrimedComponent, PrimedComponentFactory, ISharedComponentProps } from "@microsoft/fluid-aqueduct";
import { IFluidCodeDetails, IFluidPackage, ILoader } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { DocumentDeltaEventManager } from "@microsoft/fluid-local-driver";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@microsoft/fluid-test-utils";

abstract class TestComponent extends PrimedComponent {
    public static readonly type = "@fluid-example/test-component";
    public readonly version: number;

    public get _root() {
        return this.root;
    }

    public runtime: IComponentRuntime;

    constructor(props: ISharedComponentProps) {
        super(props);
        this.runtime = props.runtime;
    }
}

class TestComponentV1 extends TestComponent {
    public readonly version = 1;
    public static getFactory() { return TestComponentV1.factory; }

    private static readonly factory = new PrimedComponentFactory(
        TestComponentV1.type,
        TestComponentV1,
        [],
        {},
    );
}

class TestComponentV2 extends TestComponent {
    public static readonly version = 2;
    public readonly version = 2;
    public static readonly testKey = "version2";

    public static getFactory() { return TestComponentV2.factory; }

    private static readonly factory = new PrimedComponentFactory(
        TestComponentV2.type,
        TestComponentV2,
        [],
        {},
    );

    protected async componentHasInitialized() {
        this.root.set(TestComponentV2.testKey, true);
    }
}

describe("Context Reload", () => {
    const id = "fluid-test://localhost/localLoaderTest";
    const codeDetailsV1: IFluidCodeDetails = {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        package: {
            name: TestComponentV1.type,
            version: "0.1.0",
        } as IFluidPackage,
        config: {},
    };
    const codeDetailsV2: IFluidCodeDetails = {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        package: {
            name: TestComponentV2.type,
            version: "0.2.0",
        } as IFluidPackage,
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;

    async function createContainer(): Promise<Container> {
        const loader: ILoader = createLocalLoader([
            [ codeDetailsV1, TestComponentV1.getFactory() ],
            [ codeDetailsV2, TestComponentV2.getFactory() ],
        ], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetailsV1);
    }

    async function getComponent<T>(componentId: string, container: Container): Promise<T> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as T;
    }

    describe("single container", () => {
        let container: Container;
        let componentV1: TestComponent;

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
            const containerP = createContainer();
            componentV1 = await containerP.then(async (c) => getComponent<TestComponent>("default", c));
            container = await containerP;
            containerDeltaEventManager.registerDocuments(componentV1.runtime);
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });

        it("is followed by an immediate summary", async () => {
            await componentV1.runtime.getQuorum().propose("code", codeDetailsV2);

            const summaryP = new Promise((res) => container.on("op", (op) => {
                if (op.type === "summarize") {
                    res();
                }
            }));

            await containerDeltaEventManager.process();
            await summaryP;
        });

        it("retains data", async () => {
            const test = ["fluid", "is great!"];
            componentV1._root.set(test[0], test[1]);

            await componentV1.runtime.getQuorum().propose("code", codeDetailsV2);
            await containerDeltaEventManager.process();

            const componentV2 = await getComponent<TestComponent>("default", container);

            assert.strictEqual(await componentV2._root.get(test[0]), test[1]);
        });

        it("loads version 2", async () => {
            await componentV1.runtime.getQuorum().propose("code", codeDetailsV2);
            await containerDeltaEventManager.process();

            const componentV2 = await getComponent<TestComponent>("default", container);

            assert.strictEqual(componentV2.version, TestComponentV2.version);

            assert(await componentV2._root.wait(TestComponentV2.testKey));
        });
    });

    describe("two containers", () => {
        it("loads version 2", async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);

            const containersP = [createContainer(), createContainer()];

            let componentsP = containersP.map(async (containerP) => containerP.then(
                async (container) => getComponent<TestComponent>("default", container)));
            let components = await Promise.all(componentsP);
            containerDeltaEventManager.registerDocuments(...components.map((c) => c.runtime));

            await components[0].runtime.getQuorum().propose("code", codeDetailsV2);
            await containerDeltaEventManager.process();

            componentsP = containersP.map(async (containerP) => containerP.then(
                async (container) => getComponent<TestComponent>("default", container)));
            components = await Promise.all(componentsP);

            assert.strictEqual(components[0].version, TestComponentV2.version);
            assert.strictEqual(components[1].version, TestComponentV2.version);

            const test1 = await components[0]._root.wait(TestComponentV2.testKey);
            const test2 = await components[1]._root.wait(TestComponentV2.testKey);
            assert(test1);
            assert.strictEqual(test1, test2);
        });
    });
});
