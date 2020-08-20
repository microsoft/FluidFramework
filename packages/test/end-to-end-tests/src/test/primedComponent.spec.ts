/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { ISharedDirectory } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@fluidframework/test-utils";
import { compatTest, ICompatTestArgs } from "./compatUtils";

const PrimedType = "@fluidframework/primedDataStore";

/**
 * My sample dataStore
 */
class DataStore extends DataObject {
    public get root(): ISharedDirectory {
        return super.root;
    }
    public async writeBlob(blob: string): Promise<IFluidHandle<string>> {
        return super.writeBlob(blob);
    }
}

const tests = (args: ICompatTestArgs) => {
    let dataStore: DataStore;

    beforeEach(async () => {
        const container = await args.makeTestContainer() as Container;
        dataStore = await requestFluidObject<DataStore>(container, "default");
    });

    it("Blob support", async () => {
        const handle = await dataStore.writeBlob("aaaa");
        assert(await handle.get() === "aaaa", "Could not write blob to dataStore");
        dataStore.root.set("key", handle);

        const handle2 = dataStore.root.get<IFluidHandle<string>>("key");
        const value2 = await handle2.get();
        assert(value2 === "aaaa", "Could not get blob from shared object in the dataStore");

        const container2 = await args.makeTestContainer() as Container;
        const dataStore2 = await requestFluidObject<DataStore>(container2, "default");
        const value = await dataStore2.root.get<IFluidHandle<string>>("key").get();
        assert(value === "aaaa", "Blob value not synced across containers");
    });
};

describe("DataObject", () => {
    describe("Blob support", () => {
        const id = "fluid-test://localhost/primedDataStoreTest";
        const codeDetails: IFluidCodeDetails = {
            package: "primedDataStoreTestPackage",
            config: {},
        };
        let deltaConnectionServer: ILocalDeltaConnectionServer;

        async function makeTestContainer(): Promise<Container> {
            const factory = new DataObjectFactory(PrimedType, DataStore, [], {});
            const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
            return initializeLocalContainer(id, loader, codeDetails);
        }

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
        });

        tests({ makeTestContainer });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("compatibility", () => {
        compatTest(tests);
    });
});
