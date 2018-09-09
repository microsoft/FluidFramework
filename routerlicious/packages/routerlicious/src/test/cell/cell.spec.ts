import { CellExtension, ICell } from "@prague/cell";
import * as assert from "assert";

describe("Routerlicious", () => {
    describe("Api", () => {
        describe("cell", () => {
            let testCell: ICell;

            beforeEach(async () => {
                const extension = new CellExtension();
                testCell = extension.create(null, "cell");
            });

            it("Can create a cell", () => {
                assert.ok(testCell);
            });

            it("Can set and get cell data", async () => {
                await testCell.set("testValue");
                assert.equal(await testCell.get(), "testValue");
            });

        });
    });
});
