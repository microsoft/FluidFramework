/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { OpProcessingController, initializeLocalContainer, LocalCodeLoader } from "@fluidframework/test-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { UpgradeManager } from "@fluidframework/base-host";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ICodeLoader, IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

class TestDataStore extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";

    public static getFactory() { return TestDataStore.factory; }
    private static readonly factory = new DataObjectFactory(
        TestDataStore.type,
        TestDataStore,
        [],
        {},
    );

    public get _runtime(): IFluidDataStoreRuntime { return this.runtime; }
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

    async function createContainer(factory: IFluidDataStoreFactory): Promise<Container> {
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

    async function requestFluidObject<T>(dataStoreId: string, container: Container): Promise<T> {
        const response = await container.request({ url: dataStoreId });
        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            throw new Error(`DataStore with id: ${dataStoreId} not found`);
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
        const containersP = Array(clients).fill(undefined).map(async () => createContainer(TestDataStore.getFactory()));
        const dataStores = await Promise.all(containersP.map(
            async (containerP) => (containerP).then(
                async (container) => requestFluidObject<TestDataStore>("default", container))));

        const containers = await Promise.all(containersP);
        opProcessingController.addDeltaManagers(...dataStores.map((c) => c._runtime.deltaManager));

        dataStores.map((c, i) => {
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
        const container = await createContainer(TestDataStore.getFactory());
        const dataStore = await requestFluidObject<TestDataStore>("default", container);

        opProcessingController.addDeltaManagers(dataStore._runtime.deltaManager);
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
        const containersP = Array(clients).fill(undefined).map(async () => createContainer(TestDataStore.getFactory()));

        await Promise.all(containersP.map(
            async (containerP) => (containerP).then(
                async (container) => requestFluidObject<TestDataStore>("default", container))));

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
