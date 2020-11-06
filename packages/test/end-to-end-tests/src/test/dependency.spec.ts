/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { DependencyContainer } from "@fluidframework/synthesize";
import {
    generateTest,
    ICompatLocalTestObjectProvider,
    TestDataObject,
    IArgument,
    IArgumentLoadable,
 } from "./compatUtils";

const tests = (args: ICompatLocalTestObjectProvider) => {
    function getDependencies() {
        const dc = new DependencyContainer();
        const arg: IArgument = {
            data: "data",
            get IArgument() { return this; },
        };
        dc.register(IArgument, arg);
        return dc;
    }

    async function testFailsCreation(dataObject: Promise<TestDataObject>) {
        // TODO: creation should fail when we switch to required args
        const arg = (await dataObject)._providers.IArgument;
        assert(arg === undefined);
    }

    describe("Single client", () => {
        let dataObject: TestDataObject;
        let dc: DependencyContainer;

        beforeEach(async () => {
            const container = await args.makeTestContainer();
            dataObject = await requestFluidObject<TestDataObject>(container, "default");

            dc = getDependencies();
        });

        it("Can't create dependent object without dependencies", async () => {
            await dataObject.createSubObject("default");
            await testFailsCreation(dataObject.createSubObject("dependency"));
        });

        it("Can create dependent object", async () => {
            await dataObject.createSubObject("default", dc);
            assert(dataObject._providers.IArgument === undefined);

            const dataObject2 = await dataObject.createSubObject("dependency", dc);
            const arg = await dataObject2._providers.IArgument;
            assert(arg?.data === "data");
        });

        it("Can create 2-level deep dependent object", async () => {
            const dataObject2 = await dataObject.createSubObject("dependency", dc);
            await testFailsCreation(dataObject2.createSubObject("dependency"));

            const dataObject3 = await dataObject2.createSubObject("dependency", dc);
            const arg = await dataObject3._providers.IArgument;
            assert(arg?.data === "data");
        });
    });

    describe("Multiple clients", () => {
        let dataObject: TestDataObject;
        let dependentObject: TestDataObject;
        let dependentObject2: TestDataObject;
        let dc: DependencyContainer;

        function testLoadableArg(arg: IArgumentLoadable) {
            assert(arg.IArgument === arg);
            assert(arg.data === "data");
            assert(arg.IFluidLoadable === arg);
            assert(arg.handle !== undefined);
        }

        beforeEach(async () => {
            const container = await args.makeTestContainer();
            dataObject = await requestFluidObject<TestDataObject>(container, "default");

            dc = getDependencies();
            dependentObject = await dataObject.createSubObject("dependency", dc);

            const dc2 = new DependencyContainer();
            const arg = await requestFluidObject<IArgumentLoadable>(dataObject, "argument");
            testLoadableArg(arg);
            dc2.register(IArgument, arg);
            dependentObject2 = await dataObject.createSubObject("dependency", dc2);

            // attach data stores and process all attachment ops
            dataObject._root.set("dep1", dependentObject.handle);
            dataObject._root.set("dep2", dependentObject2.handle);
            await args.opProcessingController.process();
        });

        it("Can't load dependent object", async () => {
            const container2 = await args.loadTestContainer();
            await testFailsCreation(requestFluidObject<TestDataObject>(container2, dependentObject.id));
        });

        it("Can load dependent object", async () => {
            const container2 = await args.loadTestContainer();
            const dataObject2 = await requestFluidObject<TestDataObject>(container2, dependentObject2.id);
            testLoadableArg(await dataObject2._providers.IArgument as IArgumentLoadable);
        });
    });
};

describe("Dependency", () => {
    // back-compat:
    // replace with generateTestWithCompat() in future
    generateTest(tests);
});
