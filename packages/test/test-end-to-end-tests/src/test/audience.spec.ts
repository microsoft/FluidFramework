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
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { flattenRuntimeOptions } from "./flattenRuntimeOptions";

class TestDataObject extends DataObject {
    // Maintains a list of clients in the audience.
    public audienceClientList: Set<string> = new Set();

    public get _root() {
        return this.root;
    }

    public get _runtime() {
        return this.runtime;
    }

    public get _context() {
        return this.context;
    }

    protected async hasInitialized() {
        this.runtime.getAudience().on("addMember", (clientId: string) => {
            this.audienceClientList.add(clientId);
        });

        this.runtime.getAudience().on("removeMember", (clientId: string) => {
            this.audienceClientList.delete(clientId);
        });

        const members = this.runtime.getAudience().getMembers();
        for (const [clientId] of members) {
            this.audienceClientList.add(clientId);
        }
    }
}

describeFullCompat("Audience correctness", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        undefined,
        // Disable summaries so the summarizer client doesn't interfere with the audience
        flattenRuntimeOptions({ summaryOptions: { generateSummaries: false }}),
    );

    const createContainer = async (): Promise<Container> => await provider.createContainer(runtimeFactory) as Container;
    const loadContainer = async (): Promise<Container> => await provider.loadContainer(runtimeFactory) as Container;

    beforeEach(async () => {
        provider = getTestObjectProvider();
    });

    it("should add clients in audience as expected", async () => {
        // Create a client - client1.
        const client1Container = await createContainer();
        const client1DataStore = await requestFluidObject<TestDataObject>(client1Container, "default");

        // Ensure the client1 is connected and synchronized.
        await provider.ensureSynchronized();
        // Validate that client1 is in its own audience.
        assert(client1Container.clientId !== undefined, "client1 does not have clientId");
        assert(
            client1DataStore.audienceClientList.has(client1Container.clientId),
            "client1's audience does not have client1's clientId",
        );

        // Load a second client - client2.
        const client2Container = await loadContainer();
        const client2DataStore = await requestFluidObject<TestDataObject>(client2Container, "default");
        // Ensure the client2 is connected and synchronized.
        await provider.ensureSynchronized();
        // Validate that client2 is in its own audience.
        assert(client2Container.clientId !== undefined, "client does not have clientId");
        assert(
            client2DataStore.audienceClientList.has(client2Container.clientId),
            "client2's audience does not have client2's clientId",
        );

        // Validate that client1 is in client2's audience.
        assert(
            client2DataStore.audienceClientList.has(client1Container.clientId),
            "client2's audience does not have client1",
        );

        // Validate that client2 is in client1's audience.
        assert(
            client1DataStore.audienceClientList.has(client2Container.clientId),
            "Client1's audience does not have client2",
        );
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

        // Ensure that clients are connected and synchronized.
        await provider.ensureSynchronized();

        assert(client1Container.clientId !== undefined, "client1 does not have clientId");
        assert(client2Container.clientId !== undefined, "client2 does not have clientId");

        // Validate that client1 is in its own audience.
        assert(
            client1DataStore.audienceClientList.has(client1Container.clientId),
            "client1's audience does not have client1's clientId",
        );

        // Validate that client2 is in its own audience.
        assert(
            client2DataStore.audienceClientList.has(client2Container.clientId),
            "client2's audience does not have client2's clientId",
        );

        // Validate that client1 is in client2's audience.
        assert(
            client2DataStore.audienceClientList.has(client1Container.clientId),
            "client2's audience does not have client1",
        );

        // Validate that client2 is in client1's audience.
        assert(
            client1DataStore.audienceClientList.has(client2Container.clientId),
            "Client1's audience does not have client2",
        );
    });

    it("should remove clients in audience as expected", async () => {
        // Create a client - client1.
        const client1Container = await createContainer();
        const client1DataStore = await requestFluidObject<TestDataObject>(client1Container, "default");

        // Load a second client - client2.
        const client2Container = await loadContainer();
        const client2DataStore = await requestFluidObject<TestDataObject>(client2Container, "default");

        // Ensure that clients are connected and synchronized.
        await provider.ensureSynchronized();

        assert(client1Container.clientId !== undefined, "client1 does not have clientId");
        assert(client2Container.clientId !== undefined, "client2 does not have clientId");

        // Validate that client2 is in both client's audiences.
        assert(
            client2DataStore.audienceClientList.has(client2Container.clientId),
            "client2's audience does not have client2's clientId",
        );
        assert(
            client1DataStore.audienceClientList.has(client2Container.clientId),
            "Client1's audience does not have client2",
        );

        // Close client2. It should be removed from the audience.
        client2Container.close();
        await provider.ensureSynchronized();

        // Validate that client2 is removed from client1's audience.
        assert(
            !client1DataStore.audienceClientList.has(client2Container.clientId),
            "Client1's audience should not have client2",
        );
    });
});
