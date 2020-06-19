/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { UpgradeManager } from "@fluidframework/base-host";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { IComponentFactory } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@fluidframework/test-utils";

class TestComponent extends PrimedComponent {
    public static readonly type = "@fluid-example/test-component";

    public static getFactory() { return TestComponent.factory; }
    private static readonly factory = new PrimedComponentFactory(
        TestComponent.type,
        TestComponent,
        [],
        {},
    );

    public get _runtime(): IComponentRuntime { return this.runtime; }
    public get _root() { return this.root; }
}

describe("UpgradeManager", () => {
    const id = "fluid-test://localhost/localLoaderTest";
    const codeDetails: IFluidCodeDetails = {
        package: "localLoaderTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;

    async function createContainer(factory: IComponentFactory): Promise<Container> {
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent<T>(componentId: string, container: Container): Promise<T> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as T;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });

    it("prevents multiple approved proposals", async () => {
        const clients = 10;

        const addCounts = Array(clients).fill(0);
        const approveCounts = Array(clients).fill(0);
        const containersP = Array(clients).fill(undefined).map(async () => createContainer(TestComponent.getFactory()));
        const components = await Promise.all(containersP.map(
            async (containerP) => (containerP).then(
                async (container) => getComponent<TestComponent>("default", container))));

        const containers = await Promise.all(containersP);
        containerDeltaEventManager.registerDocuments(...components.map((c) => c._runtime));

        components.map((c, i) => {
            c._runtime.getQuorum().on("addProposal", () => { ++addCounts[i]; });
            c._runtime.getQuorum().on("approveProposal", () => { ++approveCounts[i]; });
        });

        const upgradeManagers = containers.map((c) => new UpgradeManager((c as any).context.runtime));

        const succeededP = upgradeManagers.map(async (u) => new Promise<void>((res) => u.on("upgradeSucceeded", res)));

        // upgrade all containers at once
        const resultsP = upgradeManagers.map(async (u) => u.upgrade(codeDetails, true));

        await Promise.all(succeededP);

        const results = await Promise.all(resultsP);
        // every client sees number of added proposals equal to number of clients
        addCounts.map((a) => assert.strictEqual(a, clients));
        // every client sees exactly one approval
        approveCounts.map((a) => assert.strictEqual(a, 1));
        // only one upgrade() call resolves true
        assert.strictEqual(results.filter((r) => r).length, 1);
    });

    it("1 client low priority is immediate", async () => {
        const container = await createContainer(TestComponent.getFactory());
        const component = await getComponent<TestComponent>("default", container);

        containerDeltaEventManager.registerDocuments(component._runtime);
        const upgradeManager = new UpgradeManager((container as any).context.runtime);

        const upgradeP = new Promise<void>((resolve) => {
            upgradeManager.on("upgradeInProgress", resolve);
        });

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        upgradeManager.upgrade(codeDetails);
        await containerDeltaEventManager.process();
        await upgradeP;
    });

    it("2 clients low priority is delayed", async () => {
        const clients = 2;
        let expected = false;
        const containersP = Array(clients).fill(undefined).map(async () => createContainer(TestComponent.getFactory()));
        const components = await Promise.all(containersP.map(
            async (containerP) => (containerP).then(
                async (container) => getComponent<TestComponent>("default", container))));

        const containers = await Promise.all(containersP);

        containerDeltaEventManager.registerDocuments(...components.map((c) => c._runtime));
        await containerDeltaEventManager.process();

        const upgradeManager = new UpgradeManager((containers[0] as any).context.runtime);

        const upgradeP = new Promise<void>((resolve, reject) => {
            upgradeManager.on("upgradeInProgress", () => expected ? resolve() : reject());
        });

        await containerDeltaEventManager.process();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        upgradeManager.upgrade(codeDetails);
        await containerDeltaEventManager.process();

        (containers[1] as any).submitMessage("leave", containers[1].clientId);

        expected = true;
        await containerDeltaEventManager.process();
        containers[1].close();

        await upgradeP;
    });
});
