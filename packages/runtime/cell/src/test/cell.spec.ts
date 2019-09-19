/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockRuntime } from "@microsoft/fluid-test-runtime-utils";
import * as assert from "assert";
import { ISharedCell } from "..";
import { CellFactory } from "../cellFactory";

describe("Routerlicious", () => {
    describe("Api", () => {
        describe("cell", () => {
            let testCell: ISharedCell;

            beforeEach(async () => {
                const factory = new CellFactory();
                testCell = factory.create(new MockRuntime(), "cell");
            });

            it("Can create a cell", () => {
                assert.ok(testCell);
            });

            it("Can set and get cell data", async () => {
                testCell.set("testValue");
                assert.equal(testCell.get(), "testValue");
            });

        });
    });
});
