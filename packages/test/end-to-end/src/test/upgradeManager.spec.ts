/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ISharedComponentProps, PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { UpgradeManager } from "@microsoft/fluid-base-host";
import { IFluidCodeDetails, ILoader } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { DocumentDeltaEventManager } from "@microsoft/fluid-local-driver";
import { IComponentFactory, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@microsoft/fluid-test-utils";

class TestComponent extends PrimedComponent {
    public static readonly type = "@chaincode/test-component";

    public static getFactory() { return TestComponent.factory; }

    public runtime: IComponentRuntime;

    private static readonly factory = new PrimedComponentFactory(
        TestComponent.type,
        TestComponent,
        [],
        {},
    );

    constructor(props: ISharedComponentProps) {
        super(props);
        this.runtime = props.runtime;
    }
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
        const loader: ILoader = createLocalLoader([[ codeDetails, factory ]], deltaConnectionServer);
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
        containerDeltaEventManager.registerDocuments(...components.map((c) => c.runtime));

        components.map((c, i) => {
            c.runtime.getQuorum().on("addProposal", () => { ++addCounts[i]; });
            c.runtime.getQuorum().on("approveProposal", () => { ++approveCounts[i]; });
        });

        const upgradeManagers = containers.map((c) => new UpgradeManager((c as any).context.runtime));

        const succeededP = upgradeManagers.map(async (u) => new Promise<void>((res) => u.on("upgradeSucceeded", res)));

        // upgrade all containers at once
        const resultsP = upgradeManagers.map(async (u) => u.upgrade(codeDetails, true));

        await Promise.all(succeededP);

        const results = await Promise.all(resultsP);
        assert(addCounts.every((a) => a === clients), "not every client added a proposal");
        assert(approveCounts.every((a) => a === 1), "more than one approval or zero approvals");
        assert(results.filter((r) => r).length === 1);
    });

    it("1 client low priority is immediate", async () => {
        const container = await createContainer(TestComponent.getFactory());
        const component = await getComponent<TestComponent>("default", container);

        containerDeltaEventManager.registerDocuments(component.runtime);
        const upgradeManager = new UpgradeManager((container as any).context.runtime);

        const result = upgradeManager.upgrade(codeDetails);
        await result;
    });

    it("2 clients low priority is delayed", async () => {
        const clients = 2;
        let expected = false;
        const containersP = Array(clients).fill(undefined).map(async () => createContainer(TestComponent.getFactory()));
        const components = await Promise.all(containersP.map(
            async (containerP) => (containerP).then(
                async (container) => getComponent<TestComponent>("default", container))));

        const containers = await Promise.all(containersP);

        containerDeltaEventManager.registerDocuments(...components.map((c) => c.runtime));
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
