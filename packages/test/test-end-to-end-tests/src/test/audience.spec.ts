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
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { flattenRuntimeOptions } from "./flattenRuntimeOptions";

class TestDataObject extends DataObject {
    public clientList: Set<string> = new Set();
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
            this.clientList.add(clientId);
        });

        this.runtime.getAudience().on("removeMember", (clientId: string) => {
            this.clientList.delete(clientId);
        });

        const members = this.runtime.getAudience().getMembers();
        for (const member of members) {
            this.clientList.add(member[0]);
        }
    }
}

// REVIEW: enable compat testing?
describeNoCompat("Audience correctness", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            generateSummaries: false,
        },
        gcOptions: {
            gcAllowed: true,
        },
    };
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        undefined,
        flattenRuntimeOptions(runtimeOptions),
    );

    const createContainer = async (): Promise<Container> => await provider.createContainer(runtimeFactory) as Container;
    const loadContainer = async (): Promise<Container> => await provider.loadContainer(runtimeFactory) as Container;

    beforeEach(async () => {
        provider = getTestObjectProvider();
    });

    it("should add / remove clients in audience as expected", async () => {
        const container1 = await createContainer();
        const dataStore1 = await requestFluidObject<TestDataObject>(container1, "default");

        const container2 = await loadContainer();
        const dataStore2 = await requestFluidObject<TestDataObject>(container2, "default");

        assert(container1.clientId !== undefined, "Container1 does not have clientId");
        assert(container2.clientId !== undefined, "Container2 does not have clientId");
        assert(dataStore1.clientList.has(container1.clientId), "Client1's audience does not have client1");
        assert(dataStore1.clientList.has(container2.clientId), "Client1's audience does not have client2");
        assert(dataStore2.clientList.has(container1.clientId), "Client2's audience does not have client1");
        assert(dataStore2.clientList.has(container2.clientId), "Client2's audience does not have client2");

        // Peform operations so that clients transtion to write mode (if not already).
        dataStore1._root.set("key1", "value1");
        dataStore2._root.set("key2", "value2");

        await provider.ensureSynchronized();

        assert(dataStore1.clientList.has(container1.clientId), "Write - Client1's audience does not have client1");
        assert(dataStore1.clientList.has(container2.clientId), "Write - Client1's audience does not have client2");
        assert(dataStore2.clientList.has(container1.clientId), "Write - Client2's audience does not have client1");
        assert(dataStore2.clientList.has(container2.clientId), "Write - Client2's audience does not have client2");
    });
});
