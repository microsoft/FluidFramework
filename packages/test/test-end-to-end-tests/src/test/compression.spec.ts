/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    DataObjectFactoryType,
    ITestContainerConfig,
    ITestFluidObject,
    ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";

const testContainerConfig: ITestContainerConfig = {
    registry: [["mapKey", SharedMap.getFactory()]],
    runtimeOptions: {
        compressionOptions: { minimumSize: 1 },
    },
    fluidDataObjectType: DataObjectFactoryType.Test,
};

describeFullCompat("Op Compression", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let container: Container;
    let dataObject: ITestFluidObject;
    let map: SharedMap;

    beforeEach(async () => {
        provider = getTestObjectProvider();

        container = (await provider.makeTestContainer(
            testContainerConfig,
        )) as Container;
        dataObject = await requestFluidObject<ITestFluidObject>(
            container,
            "default",
        );
        map = await dataObject.getSharedObject<SharedMap>("mapKey");
    });

    afterEach(() => {
        provider.reset();
    });

    it("Can compress and process compressed op", async () => {
		// The value is such that the compressed value is longer than the uncompressed value
		// If it wasn't, it wouldn't get compressed
        map.set("testKey", "///////////////////////////////////");
        await provider.ensureSynchronized();
		const value = map.get("testKey");
		assert.strictEqual(value, "///////////////////////////////////");
    });

    it("Processes ops that weren't worth compressing", async () => {
        map.set("testKey", "testValue");
        await provider.ensureSynchronized();
        assert.strictEqual(map.get("testKey"), "testValue");
    });
});
