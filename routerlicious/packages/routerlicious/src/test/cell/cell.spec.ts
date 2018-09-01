import { api, types } from "@prague/client-api";
import * as assert from "assert";
import { generateToken } from "../../utils";
import * as testUtils from "../testUtils";

describe("Routerlicious", () => {
    describe("Api", () => {
        describe("cell", () => {
            let testDocument: api.Document;
            let testCell: types.ICell;

            beforeEach(async () => {
                const tenantId = "test";
                const documentId = "testDocument";
                const secret = "test";

                testUtils.registerAsTest("", "", "");
                const token = generateToken(tenantId, documentId, secret);
                testDocument = await api.load(documentId, { token });
                testCell = testDocument.createCell();
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
