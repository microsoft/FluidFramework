/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IContainer,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import {
    IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { flattenRuntimeOptions } from "./flattenRuntimeOptions";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }
}

describeFullCompat("Simple load test", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const factory = new DataObjectFactory(
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
    const defaultRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        flattenRuntimeOptions(runtimeOptions),
    );

    let container: IContainer;

    const createContainer = async (runtimeFactory: IRuntimeFactory): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    async function ensureContainerConnected(c: IContainer): Promise<void> {
        if (!(c as Container).connected) {
            return new Promise((resolve) => c.once("connected", () => resolve()));
        }
    }

    /**
     * Loads a summarizer client with the given version (if any) and returns its container runtime.
     */
    const loadSummarizer = async (runtimeFactory: IRuntimeFactory) => {
        return provider.loadContainer(runtimeFactory);
    };

    beforeEach(async () => {
        provider = getTestObjectProvider();

        container = await createContainer(defaultRuntimeFactory);
        await ensureContainerConnected(container);

        const dataStore1 = await requestFluidObject<TestDataObject>(container, "default");
        const dataStore2 = await factory.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set("dataStore2", dataStore2.handle);

        await provider.ensureSynchronized();
        await ensureContainerConnected(container);
    });

    it("should regenerate summary and GC data when GC version updates", async () => {
        const summarizerClient1 = await loadSummarizer(defaultRuntimeFactory);
        await ensureContainerConnected(summarizerClient1);
    });
});
