/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { assert, TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import {
    createAndAttachContainer,
    createDocumentId,
    createLoader,
    OpProcessingController,
} from "@fluidframework/test-utils";

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

describe("GC in Summary", () => {
    let documentId: string;
    const codeDetails: IFluidCodeDetails = {
        package: "garbageCollectionTestPackage",
        config: {},
    };
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const runtimeOptions = {
        generateSummaries: false,
    };
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        runtimeOptions,
    );

    let driver: ITestDriver;
    let opProcessingController: OpProcessingController;
    let container1: IContainer;
    let containerRuntime: ContainerRuntime;

    async function createContainer(): Promise<IContainer> {
        const loader = createLoader(
            [[codeDetails, runtimeFactory]],
            driver.createDocumentServiceFactory(),
            driver.createUrlResolver());
        return createAndAttachContainer(
            codeDetails, loader, driver.createCreateNewRequest(documentId));
    }

    // async function loadContainer(): Promise<IContainer> {
    //     const loader = createLoader(
    //         [[codeDetails, runtimeFactory]],
    //         driver.createDocumentServiceFactory(),
    //         driver.createUrlResolver());
    //     return loader.resolve({ url: await driver.createContainerUrl(documentId) });
    // }

    function verifyDataStoreReference(summary: ISummaryTree, dataStoreId: string, unreferenced: true | undefined) {
        for (const [ id, summaryObject ] of Object.entries(summary.tree)) {
            if (summaryObject.type !== SummaryType.Tree) {
                continue;
            }

            if (id === dataStoreId) {
                assert(
                    summaryObject.unreferenced === unreferenced,
                    `Data store ${dataStoreId} should be ${ unreferenced ? "unreferenced" : "referenced" }`,
                );
                break;
            }
        }
    }

    beforeEach(async () => {
        documentId = createDocumentId();
        driver = getFluidTestDriver() as unknown as ITestDriver;
        opProcessingController = new OpProcessingController();

        // Create a Container for the first client.
        container1 = await createContainer();
        opProcessingController.addDeltaManagers(container1.deltaManager);
        const dataStore = await requestFluidObject<TestDataObject>(container1, "/");
        containerRuntime = dataStore._context.containerRuntime as ContainerRuntime;
    });

    it("marks default component as referenced in summary", async () => {
        const { summary } = await containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger: new TelemetryNullLogger(),
        });
        verifyDataStoreReference(summary, "default", true);
    });
});
