/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestFluidObject } from "@fluidframework/test-utils";
import {
    generateLocalNonCompatTest,
    ITestObjectProvider,
} from "./compatUtils";

const tests = (args: ITestObjectProvider) => {
    let container1: Container;
    let container2: Container;
    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;

    beforeEach(async () => {
        container1 = await args.makeTestContainer() as Container;
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");

        // write something to get out of view only mode
        dataObject1.root.set("blah", "blah");
        await args.opProcessingController.process();

        container2 = await args.loadTestContainer() as Container;
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        // write something to get out of view only mode
        dataObject2.root.set("blah", "blah");
        await args.opProcessingController.process();
    });

    it("Events on close", async () => {
        assert(dataObject1.context.leader);
        assert(!dataObject2.context.leader);

        let leaderEventExpected1 = false;
        let leaderEventExpected2 = true;
        let notleaderEventExpected1 = true;
        let notleaderEventExpected2 = false;
        dataObject1.runtime.on("leader", () => {
            assert(leaderEventExpected1, "leader event not expected in data object 1");
            leaderEventExpected1 = false;
        });

        dataObject1.runtime.on("notleader", () => {
            assert(notleaderEventExpected1, "notleader event not expected in data object 1");
            notleaderEventExpected1 = false;
        });

        dataObject2.runtime.on("leader", () => {
            assert(leaderEventExpected2, "leader event not expected in data object 2");
            leaderEventExpected2 = false;
        });

        dataObject2.runtime.on("notleader", () => {
            assert(notleaderEventExpected2, "notleader event not expected in data object 2");
            notleaderEventExpected2 = false;
        });

        container1.close();

        await args.opProcessingController.process();

        assert(!notleaderEventExpected1, "Missing notleader event on data object 1");
        assert(!leaderEventExpected2, "Missing leader event on data object 2");
        assert(!dataObject1.context.leader);
        assert(dataObject2.context.leader);
    });
};

describe("Leader", () => {
    generateLocalNonCompatTest(tests, { tinylicious: true });
});
