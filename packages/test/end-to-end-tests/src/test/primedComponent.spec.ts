/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DataObject } from "@fluidframework/aqueduct";
import { Container } from "@fluidframework/container-loader";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedDirectory } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { generateTest, ITestObjectProvider } from "./compatUtils";

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

const tests = (args: ITestObjectProvider) => {
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
    generateTest(tests, { tinylicious: process.argv.includes("--tinylicious") });
});
