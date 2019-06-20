/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICell } from "@prague/cell";
import * as api from "@prague/client-api";
import { ISharedMap } from "@prague/map";
import * as assert from "assert";
import {
    DocumentDeltaEventManager,
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "..";

describe("Cell", () => {
    const id = "prague://test.com/test/test";
    const cellId = "cellKey";
    const initialCellValue = "Initial cell value";
    const newCellValue = "A new cell value";

    let testDeltaConnectionServer: ITestDeltaConnectionServer;
    let documentDeltaEventManager: DocumentDeltaEventManager;
    let user1Document: api.Document;
    let user2Document: api.Document;
    let user3Document: api.Document;
    let root1: ISharedMap;
    let root2: ISharedMap;
    let root3: ISharedMap;
    let root1Cell: ICell;
    let root2Cell: ICell;
    let root3Cell: ICell;

    beforeEach(async () => {
        testDeltaConnectionServer = TestDeltaConnectionServer.create();
        documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);
        const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        const resolver = new TestResolver();

        user1Document = await api.load(
            id, { resolver }, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user1Document);

        user2Document = await api.load(
            id, { resolver }, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user2Document);

        user3Document = await api.load(
            id, { resolver }, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user3Document);

        root1 = user1Document.getRoot();
        root2 = user2Document.getRoot();
        root3 = user3Document.getRoot();
        await documentDeltaEventManager.pauseProcessing();

        // Create a cell on the root and propagate it to other documents
        root1.set(cellId, user1Document.createCell());
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        root1Cell = root1.get(cellId);
        root2Cell = root2.get(cellId);
        root3Cell = root3.get(cellId);

        // Set a starting value in the cell
        await root1Cell.set(initialCellValue);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
    });

    async function verifyCellValue(cell: ICell, expectedValue, index: number): Promise<void> {
        const userValue = await cell.get();
        assert.equal(userValue, expectedValue,
            `Incorrect value ${userValue} instead of ${expectedValue} in document ${index}`);
    }

    async function verifyCellValues(value1, value2, value3): Promise<void> {
        await verifyCellValue(root1Cell, value1, 1);
        await verifyCellValue(root2Cell, value2, 2);
        await verifyCellValue(root3Cell, value3, 3);
    }

    async function verifyCellEmpty(value1: boolean, value2: boolean, value3: boolean): Promise<void> {
        const user1Empty = await root1Cell.empty();
        assert.equal(user1Empty, value1, `Incorrect value ${user1Empty} instead of ${value1} in document1`);
        const user2Empty = await root2Cell.empty();
        assert.equal(user2Empty, value2, `Incorrect value ${user2Empty} instead of ${value2} in document2`);
        const user3Empty = await root3Cell.empty();
        assert.equal(user3Empty, value3, `Incorrect value ${user3Empty} instead of ${value3} in document3`);
    }

    it("can create the cell in 3 documents correctly", async () => {
        // Cell was created and populated in beforeEach
        assert.ok(root1Cell, `Couldn't find the cell in root1, instead got ${root1Cell}`);
        assert.ok(root2Cell, `Couldn't find the cell in root2, instead got ${root2Cell}`);
        assert.ok(root3Cell, `Couldn't find the cell in root3, instead got ${root3Cell}`);
    });

    it("can get cell data in 3 documents correctly", async () => {
        // Cell was created and populated in beforeEach
        await verifyCellValues(initialCellValue, initialCellValue, initialCellValue);
    });

    it("can set and get cell data in 3 documents correctly", async () => {
        await root2Cell.set(newCellValue);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        await verifyCellValues(newCellValue, newCellValue, newCellValue);
    });

    it("can delete cell data in 3 documents correctly", async () => {
        await root3Cell.delete();
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        await verifyCellEmpty(true, true, true);
    });

    it("can update value and trigger onValueChanged on other two documents", async () => {
        let user1ValueChangedCount: number = 0;
        let user2ValueChangedCount: number = 0;
        let user3ValueChangedCount: number = 0;

        // Set up event listeners for the valueChanged that will count calls and check values
        root1Cell.on("valueChanged", (newValue) => {
            assert.equal(newValue, newCellValue, `Incorrect value for changed in document 1: ${newValue}`);
            user1ValueChangedCount = user1ValueChangedCount + 1;
        });
        root2Cell.on("valueChanged", (newValue) => {
            assert.equal(newValue, newCellValue, `Incorrect value for changed in document 2: ${newValue}`);
            user2ValueChangedCount = user2ValueChangedCount + 1;
        });
        root3Cell.on("valueChanged", (newValue) => {
            assert.equal(newValue, newCellValue, `Incorrect value for changed in document 3: ${newValue}`);
            user3ValueChangedCount = user3ValueChangedCount + 1;
        });

        await root1Cell.set(newCellValue);

        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        assert.equal(user1ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 1");
        assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 2");
        assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 3");

        await verifyCellValues(newCellValue, newCellValue, newCellValue);
    });

    it("Simultaneous set should reach eventual consistency with the same value", async () => {
        await root1Cell.set("value1");
        await root2Cell.set("value2");
        await root3Cell.set("value0");
        await root3Cell.set("value3");

        await verifyCellValues("value1", "value2", "value3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        await verifyCellValues("value3", "value3", "value3");
    });

    it("Simultaneous delete/set should reach eventual consistency with the same value", async () => {
        // set after delete
        await root1Cell.set("value1.1");
        await root2Cell.delete();
        await root3Cell.set("value1.3");

        await verifyCellValues("value1.1", undefined, "value1.3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        await verifyCellValues("value1.3", "value1.3", "value1.3");
    });

    it("Simultaneous delete/set on same cell should reach eventual consistency with the same value", async () => {
        // delete and then set on the same cell
        await root1Cell.set("value2.1");
        await root2Cell.delete();
        await root3Cell.set("value2.3");
        // drain the outgoing so that the next set will come after
        await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
        await root2Cell.set("value2.2");

        await verifyCellValues("value2.1", "value2.2", "value2.3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        await verifyCellValues("value2.2", "value2.2", "value2.2");
    });

    it("Simultaneous set/delete should reach eventual consistency with the same value", async () => {
        // delete after set
        await root1Cell.set("value3.1");
        await root2Cell.set("value3.2");
        await root3Cell.delete();

        await verifyCellValues("value3.1", "value3.2", undefined);
        await verifyCellEmpty(false, false, true);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        await verifyCellValues(undefined, undefined, undefined);
        await verifyCellEmpty(true, true, true);
    });

    afterEach(async () => {
        await Promise.all([
            user1Document.close(),
            user2Document.close(),
            user3Document.close(),
        ]);
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
