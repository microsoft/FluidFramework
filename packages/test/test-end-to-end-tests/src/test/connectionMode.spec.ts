/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { delay } from "@fluidframework/common-utils";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }
}

describeNoCompat("Connection Mode", (getTestObjectProvider) => {
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
    );

    let mainContainer: IContainer;

    const createContainer = async (logger): Promise<IContainer> => provider.createContainer(runtimeFactory, { logger });

    beforeEach(async () => {
        provider = getTestObjectProvider();
        const mockLogger = new MockLogger();
        // Create a Container for the first client.
        mainContainer = await createContainer(mockLogger);

        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        const mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        mainDataStore._root.set("test", "value");

        await provider.ensureSynchronized();
    });

    it("should change to read mode after timeout ", async function() {
        if(provider.driver.type !== "odsp") {
            this.skip();
        }
        const dm = mainContainer.deltaManager;
        assert.strictEqual(dm.active, true, "connection mode should be in write");
        await delay(1000 * 400);
        assert.strictEqual(dm.active, false, "connection mode should be in read after timeout");
    });
});
