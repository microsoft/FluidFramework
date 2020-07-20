/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { OpProcessingController, initializeLocalContainer, LocalCodeLoader } from "@fluidframework/test-utils";
import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { UpgradeManager } from "@fluidframework/base-host";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { ICodeLoader, IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { IComponentFactory } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

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
    let documentServiceFactory: LocalDocumentServiceFactory;
    let opProcessingController: OpProcessingController;

    async function createContainer(factory: IComponentFactory): Promise<Container> {
        const urlResolver = new LocalResolver();
        const codeLoader: ICodeLoader = new LocalCodeLoader([[codeDetails, factory]]);
        const loader = new Loader(
            urlResolver,
            documentServiceFactory,
            codeLoader,
            {},
            {},
            new Map<string, IProxyLoaderFactory>());

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
        documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
        opProcessingController = new OpProcessingController(deltaConnectionServer);
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
        opProcessingController.addDeltaManagers(...components.map((c) => c._runtime.deltaManager));

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

        opProcessingController.addDeltaManagers(component._runtime.deltaManager);
        const upgradeManager = new UpgradeManager((container as any).context.runtime);

        const upgradeP = new Promise<void>((resolve) => {
            upgradeManager.on("upgradeInProgress", resolve);
        });

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        upgradeManager.upgrade(codeDetails);
        await opProcessingController.process();
        await upgradeP;
    });

    it("2 clients low priority is delayed", async () => {
        const clients = 2;
        const containersP = Array(clients).fill(undefined).map(async () => createContainer(TestComponent.getFactory()));

        await Promise.all(containersP.map(
            async (containerP) => (containerP).then(
                async (container) => getComponent<TestComponent>("default", container))));

        const containers = await Promise.all(containersP);

        const upgradeManager = new UpgradeManager((containers[0] as any).context.runtime);

        const quorumCount = (container: Container) =>
            Array.from(container.getQuorum().getMembers().values()).filter(
                (c) => c.client.details.capabilities.interactive).length;

        // we expect UpgradeManager not to initiate upgrade (within test timeout) unless there is <= 1 client connected
        const upgradeP = new Promise<void>((resolve, reject) => {
            upgradeManager.on("upgradeInProgress", () => quorumCount(containers[0]) === 1 ? resolve() : reject());
        });

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        upgradeManager.upgrade(codeDetails);

        // disconnect one client, which should initiate upgrade
        documentServiceFactory.disconnectClient(containers[1].clientId, "test");

        await upgradeP;
    });
});
