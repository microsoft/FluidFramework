/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IContainer, IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalResolver } from "@fluidframework/local-driver";
import { ISharedDirectory } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, createAndAttachContainer } from "@fluidframework/test-utils";
import { compatTest, ICompatTestArgs } from "./compatUtils";

const PrimedType = "@fluidframework/primedTestDataObject";

/**
 * My sample dataObject
 */
class TestDataObject extends DataObject {
    public get root(): ISharedDirectory {
        return super.root;
    }
    public async writeBlob(blob: string): Promise<IFluidHandle<string>> {
        return super.writeBlob(blob);
    }
}

const tests = (args: ICompatTestArgs) => {
    let dataObject: TestDataObject;

    beforeEach(async () => {
        const container = await args.makeTestContainer() as Container;
        dataObject = await requestFluidObject<TestDataObject>(container, "default");
    });

    it("Blob support", async () => {
        const handle = await dataObject.writeBlob("aaaa");
        assert(await handle.get() === "aaaa", "Could not write blob to dataObject");
        dataObject.root.set("key", handle);

        const handle2 = dataObject.root.get<IFluidHandle<string>>("key");
        const value2 = await handle2.get();
        assert(value2 === "aaaa", "Could not get blob from shared object in the dataObject");

        const container2 = await args.loadTestContainer() as Container;
        const dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");
        const blobHandle = await dataObject2.root.wait<IFluidHandle<string>>("key");
        const value = await blobHandle.get();
        assert(value === "aaaa", "Blob value not synced across containers");
    });
};

describe("DataObject", () => {
    describe("Blob support", () => {
        const documentId = "primedComponentTest";
        const documentLoadUrl = `fluid-test://localhost/${documentId}`;
        const codeDetails: IFluidCodeDetails = {
            package: "primedTestDataObjectTestPackage",
            config: {},
        };
        const factory = new DataObjectFactory(PrimedType, TestDataObject, [], {});

        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let urlResolver: IUrlResolver;

        async function makeTestContainer(): Promise<IContainer> {
            const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
            return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
        }

        async function loadTestContainer(): Promise<IContainer> {
            const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
            return loader.resolve({ url: documentLoadUrl });
        }

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            urlResolver = new LocalResolver();
        });

        tests({ makeTestContainer, loadTestContainer });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("compatibility", () => {
        compatTest(tests);
    });
});
