/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider, timeoutPromise, ensureContainerConnected } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }
}

describeFullCompat("Audience correctness", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        [innerRequestHandler],
        // Disable summaries so the summarizer client doesn't interfere with the audience
        { summaryOptions: { disableSummaries: true } },
    );

    const createContainer = async (): Promise<Container> => await provider.createContainer(runtimeFactory) as Container;
    const loadContainer = async (): Promise<Container> => await provider.loadContainer(runtimeFactory) as Container;

    /** Function to wait for a client with the given clientId to be added to the audience of the given container. */
    async function waitForClientAdd(container: Container, clientId: string, errorMsg: string) {
        if (container.audience.getMember(clientId) === undefined) {
            return timeoutPromise((resolve) => {
                const listener = (newClientId: string) => {
                    if (newClientId === clientId) {
                        container.audience.off("addMember", listener);
                        resolve();
                    }
                };
                container.audience.on("addMember", (newClientId: string) => listener(newClientId));
            },
            // Wait for 2 seconds to get the client in audience. This wait is needed for a client to get added to its
            // own audience and 2 seconds should be enough time. It it takes longer than this, we might need to
            // reevaluate our assumptions around audience.
            // Also see - https://github.com/microsoft/FluidFramework/issues/7275.
            { durationMs: 2000, errorMsg });
        }
    }

    /** Function to wait for a client with the given clientId to be remove from the audience of the given container. */
    async function waitForClientRemove(container: Container, clientId: string, errorMsg: string) {
        if (container.audience.getMember(clientId) !== undefined) {
            return timeoutPromise((resolve) => {
                const listener = (newClientId: string) => {
                    if (newClientId === clientId) {
                        container.audience.off("removeMember", listener);
                        resolve();
                    }
                };
                container.audience.on("removeMember", (newClientId: string) => listener(newClientId));
            },
            { durationMs: 2000, errorMsg });
        }
    }

    beforeEach(async () => {
        provider = getTestObjectProvider();
    });

    /**
     * These tests wait for a client to get connected and then wait for them to be added to the audience. Ideally,
     * by the time a client moves to connected state, its audience should have itself and all previous clients.
     * This is tracked here - https://github.com/microsoft/FluidFramework/issues/7275. Once this is fixed, the tests
     * should be updated as per the new expectations.
     */
    it("should add clients in audience as expected", async () => {
        // Create a client - client1 and wait for it to be connected.
        const client1Container = await createContainer();
        await ensureContainerConnected(client1Container);

        // Validate that client1 is added to its own audience.
        assert(client1Container.clientId !== undefined, "client1 does not have clientId");
        await waitForClientAdd(client1Container, client1Container.clientId, "client1's audience doesn't have self");

        // Load a second client - client2 and wait for it to be connected.
        const client2Container = await loadContainer();
        await ensureContainerConnected(client2Container);

        // Validate that client2 is added to its own audience.
        assert(client2Container.clientId !== undefined, "client2 does not have clientId");
        await waitForClientAdd(client2Container, client2Container.clientId, "client2's audience doesn't have self");

        // Validate that client2 is added to client1's audience.
        await waitForClientAdd(client1Container, client2Container.clientId, "client1's audience doesn't have client2");

        // Validate that client1 is added to client2's audience.
        await waitForClientAdd(client2Container, client1Container.clientId, "client2's audience doesn't have client1");
    });

    it("should add clients in audience as expected in write mode", async () => {
        // Create a client - client1.
        const client1Container = await createContainer();
        const client1DataStore = await requestFluidObject<TestDataObject>(client1Container, "default");

        // Load a second client - client2.
        const client2Container = await loadContainer();
        const client2DataStore = await requestFluidObject<TestDataObject>(client2Container, "default");

        // Perform operations to move the clients to "write" mode (if not already in write mode).
        client1DataStore._root.set("testKey1", "testValue1");
        client2DataStore._root.set("testKey2", "testValue2");

        // Ensure that the clients are connected and synchronized.
        await ensureContainerConnected(client1Container);
        await ensureContainerConnected(client2Container);
        await provider.ensureSynchronized();

        assert(client1Container.clientId !== undefined, "client1 does not have clientId");
        assert(client2Container.clientId !== undefined, "client2 does not have clientId");

        // Validate that both the clients are added to client1's audience.
        await waitForClientAdd(client1Container, client1Container.clientId, "client1's audience doesn't have self");
        await waitForClientAdd(client1Container, client2Container.clientId, "client1's audience doesn't have client2");

        // Validate that both the clients are added to client2's audience.
        await waitForClientAdd(client2Container, client1Container.clientId, "client2's audience doesn't have client1");
        await waitForClientAdd(client2Container, client2Container.clientId, "client2's audience doesn't have self");
    });

    it("should remove clients in audience as expected", async () => {
        // Create a client - client1 and wait for it to be connected.
        const client1Container = await createContainer();
        await ensureContainerConnected(client1Container);

        // Load a second client - client2 and wait for it to be connected.
        const client2Container = await loadContainer();
        await ensureContainerConnected(client2Container);

        assert(client1Container.clientId !== undefined, "client1 does not have clientId");
        assert(client2Container.clientId !== undefined, "client2 does not have clientId");

        // Validate that client2 is in both client's audiences.
        await waitForClientAdd(client1Container, client2Container.clientId, "client1's audience doesn't have client2");
        await waitForClientAdd(client2Container, client2Container.clientId, "client2's audience doesn't have self");

        // Close client2. It should be removed from the audience.
        client2Container.close();
        await provider.ensureSynchronized();

        // Validate that client2 is removed from client1's audience.
        await waitForClientRemove(client1Container, client2Container.clientId, "client2's audience should be removed");
    });
});
