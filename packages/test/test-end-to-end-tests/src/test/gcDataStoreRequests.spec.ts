/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { flattenRuntimeOptions } from "./flattenRuntimeOptions";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _runtime() {
        return this.runtime;
    }

    public get _context() {
        return this.context;
    }
}

// REVIEW: enable compat testing?
describeNoCompat("GC Data Store Requests", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const IdleDetectionTime = 100;
    const summaryConfigOverrides: Partial<ISummaryConfiguration> = {
        idleTime: IdleDetectionTime,
        maxTime: IdleDetectionTime * 12,
    };
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            generateSummaries: true,
            initialSummarizerDelayMs: 10,
            summaryConfigOverrides,
        },
        gcOptions: {
            gcAllowed: true,
        },
    };
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        flattenRuntimeOptions(runtimeOptions),
    );

    let container1: IContainer;

    const createContainer = async (): Promise<IContainer> => provider.createContainer(runtimeFactory);
    const loadContainer = async (): Promise<IContainer> => provider.loadContainer(runtimeFactory);

    async function waitForSummary(container: IContainer): Promise<string | undefined> {
        let handle: string | undefined;
        // wait for summary ack/nack
        await new Promise((resolve, reject) => container.on("op", (op) => {
            if (op.type === "summaryAck") {
                handle = op.contents.handle;
                resolve(true);
            } else if (op.type === "summaryNack") {
                reject(new Error("summaryNack"));
            }
        }));
        return handle;
    }

    beforeEach(async () => {
        provider = getTestObjectProvider();

        // Create a Container for the first client.
        container1 = await createContainer();
    });

    it("should fail requests with externalRequest flag for unreferenced data stores", async () => {
        const dataStore1 = await requestFluidObject<TestDataObject>(container1, "default");

        // Create a second data store (dataStore2) and add its handle to mark it as referenced.
        const dataStore2 = await factory.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set("dataStore2", dataStore2.handle);

        // Wait for ops to be processed so that summarizer creates dataStore2.
        await provider.ensureSynchronized();

        // Now delete the handle so that dataStore2 is marked as unreferenced.
        dataStore1._root.delete("dataStore2");

        // Wait for the summarizer to generate a summary where dataStore2 is unreferenced.
        await waitForSummary(container1);

        // Load a new container which should initialize with the summary taken above. The initial summary for
        // dataStore2 will have it marked as unreferenced.
        const container2 = await loadContainer();

        // Request dataStore2 without externalRequest header and verify that we can load it.
        const request: IRequest = { url: dataStore2.id };
        let response = await container2.request(request);
        assert(
            response.status === 200 && response.mimeType === "fluid/object",
            "dataStore2 should have successfully loaded",
        );

        // Add externalRequest = true to the header and verify that we are unable to load dataStore2.
        request.headers = { externalRequest: true };
        response = await container2.request(request);
        assert(response.status === 404, "dataStore2 should have failed to load");
    });

    it("should succeed requests with externalRequest flag for data stores that are re-referenced", async () => {
        const dataStore1 = await requestFluidObject<TestDataObject>(container1, "default");

        // Create a second data store (dataStore2) and add its handle to mark it as referenced.
        const dataStore2 = await factory.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set("dataStore2", dataStore2.handle);

        // Wait for ops to be processed so that summarizer creates dataStore2.
        await provider.ensureSynchronized();

        // Now delete the handle so that dataStore2 is marked as unreferenced.
        dataStore1._root.delete("dataStore2");

        // Wait for the summarizer to generate a summary where dataStore2 is unreferenced.
        await waitForSummary(container1);

        // Load a new container which should initialize with the summary taken above. The initial summary for
        // dataStore2 will have it marked as unreferenced.
        const container2 = await loadContainer();

        // Request dataStore2 with externalRequest = true to the header and verify that we are unable to
        // load dataStore2.
        const request: IRequest = {
            url: dataStore2.id,
            headers: { externalRequest: true },
        };
        let response = await container2.request(request);
        assert(response.status === 404, "dataStore2 should have failed to load");

        // Add the handle of dataStore2 to mark it as referenced again.
        dataStore1._root.set("dataStore2", dataStore2.handle);

        // Wait for the summarizer to generate a summary where dataStore2 is unreferenced.
        await waitForSummary(container1);

        // Load a new container which should initialize with the summary taken above. The initial summary for
        // dataStore2 will have it marked as referenced now.
        const container3 = await loadContainer();
        response = await container3.request(request);
        assert(response.status === 200, "dataStore2 should successfully load now");
    });
});
