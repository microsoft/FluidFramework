/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { MockComponentRuntime } from "@fluidframework/test-runtime-utils";
import { CellFactory } from "../cellFactory";
import { ISharedCell } from "..";

describe("Routerlicious", () => {
    describe("Api", () => {
        describe("cell", () => {
            let testCell: ISharedCell;

            beforeEach(async () => {
                const factory = new CellFactory();
                testCell = factory.create(new MockComponentRuntime(), "cell");
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
