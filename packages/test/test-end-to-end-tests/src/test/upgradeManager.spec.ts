/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { UpgradeManager } from "@fluidframework/base-host";
import { IContainer, IProvideRuntimeFactory } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { TestContainerRuntimeFactory, ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IProvideFluidCodeDetailsComparer } from "@fluidframework/core-interfaces";

class TestDataObject extends DataObject {
    public static readonly type = "@fluid-example/test-dataObject";

    public static getFactory() { return TestDataObject.factory; }
    private static readonly factory = new DataObjectFactory(
        TestDataObject.type,
        TestDataObject,
        [],
        {},
    );

    public get _runtime(): IFluidDataStoreRuntime { return this.runtime; }
    public get _root() { return this.root; }
}

const runtimeFactory: IProvideRuntimeFactory & IProvideFluidCodeDetailsComparer = {
    IRuntimeFactory: new TestContainerRuntimeFactory(TestDataObject.type,TestDataObject.getFactory()),
    IFluidCodeDetailsComparer: {
        get IFluidCodeDetailsComparer() {return this;},
        satisfies: async ()=> true,
        compare: async ()=>undefined,
    },
};

describeNoCompat("UpgradeManager", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;

    const createContainer = async (): Promise<IContainer> =>
        provider.createContainer(runtimeFactory);

    const loadContainer = async (): Promise<IContainer> =>
        provider.loadContainer(runtimeFactory);

    beforeEach(async () => {
        provider = getTestObjectProvider();
    });

    it("prevents multiple approved proposals", async () => {
        const clients = 10;

        const addCounts = Array(clients).fill(0);
        const approveCounts = Array(clients).fill(0);
        const containers: IContainer[] = [];

        // Create the first Container.
        const container1 = await createContainer();
        containers.push(container1);

        // Load rest of the Containers.
        const restOfContainersP =
            Array(clients - 1).fill(undefined).map(async () => loadContainer());
        const restOfContainers = await Promise.all(restOfContainersP);
        containers.push(...restOfContainers);

        const dataObjects = await Promise.all(containers.map(
            async (container) => requestFluidObject<TestDataObject>(container, "default")));

        dataObjects.map((c, i) => {
            c._runtime.getQuorum().on("addProposal", () => { ++addCounts[i]; });
            c._runtime.getQuorum().on("approveProposal", () => { ++approveCounts[i]; });
        });

        const upgradeManagers = containers.map((c) => new UpgradeManager((c as any).context.runtime));

        const succeededP = upgradeManagers.map(async (u) => new Promise<void>((res) => u.on("upgradeSucceeded", res)));

        // Set a key in the root map of each dataObject. The Containers are created in "read" mode so the first op
        // it sends will get nack'd and it reconnects.
        // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
        dataObjects.map((dataObject) => {
            dataObject._root.set("tempKey", "tempValue");
        });
        while (containers.filter((c) => !c.deltaManager.active).length !== 0) {
            await provider.ensureSynchronized();
        }

        // upgrade all containers at once
        const resultsP = upgradeManagers.map(async (u) => u.upgrade(provider.defaultCodeDetails, true));

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
        const container = await createContainer();
        const dataObject = await requestFluidObject<TestDataObject>(container, "default");

        const upgradeManager = new UpgradeManager((container as any).context.runtime);

        const upgradeP = new Promise<void>((resolve) => {
            upgradeManager.on("upgradeInProgress", resolve);
        });

        // Set a key in the root map. The Container is created in "read" mode so the first op it sends will get
        // nack'd and it reconnects.
        // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
        dataObject._root.set("tempKey", "tempValue");
        while (!container.deltaManager.active) {
            await provider.ensureSynchronized();
        }

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        upgradeManager.upgrade(provider.defaultCodeDetails);
        await provider.ensureSynchronized();
        await upgradeP;
    });

    it("2 clients low priority is delayed", async () => {
        // Create the first Container.
        const container1 = await createContainer();

        // Load the second Container.
        const container2 = await loadContainer() as Container;

        const upgradeManager = new UpgradeManager((container1 as any).context.runtime);

        const quorumCount = (container: IContainer) =>
            Array.from(container.getQuorum().getMembers().values()).filter(
                (c) => c.client.details.capabilities.interactive).length;

        // we expect UpgradeManager not to initiate upgrade (within test timeout) unless there is <= 1 client connected
        const upgradeP = new Promise<void>((resolve, reject) => {
            // eslint-disable-next-line prefer-promise-reject-errors
            upgradeManager.on("upgradeInProgress", () => quorumCount(container1) === 1 ? resolve() : reject());
        });

        const dataObject = await requestFluidObject<TestDataObject>(container1, "default");

        // Set a key in the root map of the first container's dataObject. The Container is created in "read" mode so the
        // first op it sends will get nack'd and it reconnects.
        // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
        dataObject._root.set("tempKey", "tempValue");
        while (!container1.deltaManager.active || !container2.deltaManager.active) {
            await provider.ensureSynchronized();
        }
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        upgradeManager.upgrade(provider.defaultCodeDetails);

        // disconnect one client, which should initiate upgrade
        assert(container2.clientId);
        container2.close();

        await upgradeP;
    });
});
