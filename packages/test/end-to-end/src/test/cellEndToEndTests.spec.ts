/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as api from "@fluid-internal/client-api";
import { ISharedCell } from "@microsoft/fluid-cell";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    DocumentDeltaEventManager,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { ISharedMap } from "@microsoft/fluid-map";

describe("Cell", () => {
    const id = "fluid://test.com/test/test";
    const cellId = "cellKey";
    const initialCellValue = "Initial cell value";
    const newCellValue = "A new cell value";

    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let documentDeltaEventManager: DocumentDeltaEventManager;
    let user1Document: api.Document;
    let user2Document: api.Document;
    let user3Document: api.Document;
    let root1: ISharedMap;
    let root2: ISharedMap;
    let root3: ISharedMap;
    let root1Cell: ISharedCell;
    let root2Cell: ISharedCell;
    let root3Cell: ISharedCell;

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);
        const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        const resolver = new TestResolver();

        user1Document = await api.load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user1Document);

        user2Document = await api.load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user2Document);

        user3Document = await api.load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user3Document);

        root1 = user1Document.getRoot();
        root2 = user2Document.getRoot();
        root3 = user3Document.getRoot();
        await documentDeltaEventManager.pauseProcessing();

        // Create a cell on the root and propagate it to other documents
        root1.set(cellId, user1Document.createCell().handle);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        root1Cell = await root1.get<IComponentHandle>(cellId).get<ISharedCell>();
        root2Cell = await root2.get<IComponentHandle>(cellId).get<ISharedCell>();
        root3Cell = await root3.get<IComponentHandle>(cellId).get<ISharedCell>();

        // Set a starting value in the cell
        root1Cell.set(initialCellValue);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
    });

    function verifyCellValue(cell: ISharedCell, expectedValue, index: number) {
        const userValue = cell.get();
        assert.equal(userValue, expectedValue,
            `Incorrect value ${userValue} instead of ${expectedValue} in document ${index}`);
    }

    function verifyCellValues(value1, value2, value3) {
        verifyCellValue(root1Cell, value1, 1);
        verifyCellValue(root2Cell, value2, 2);
        verifyCellValue(root3Cell, value3, 3);
    }

    function verifyCellEmpty(value1: boolean, value2: boolean, value3: boolean) {
        const user1Empty = root1Cell.empty();
        assert.equal(user1Empty, value1, `Incorrect value ${user1Empty} instead of ${value1} in document1`);
        const user2Empty = root2Cell.empty();
        assert.equal(user2Empty, value2, `Incorrect value ${user2Empty} instead of ${value2} in document2`);
        const user3Empty = root3Cell.empty();
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
        verifyCellValues(initialCellValue, initialCellValue, initialCellValue);
    });

    it("can set and get cell data in 3 documents correctly", async () => {
        root2Cell.set(newCellValue);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        verifyCellValues(newCellValue, newCellValue, newCellValue);
    });

    it("can delete cell data in 3 documents correctly", async () => {
        root3Cell.delete();
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        verifyCellEmpty(true, true, true);
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

        root1Cell.set(newCellValue);

        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        assert.equal(user1ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 1");
        assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 2");
        assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 3");

        verifyCellValues(newCellValue, newCellValue, newCellValue);
    });

    it("Simultaneous set should reach eventual consistency with the same value", async () => {
        root1Cell.set("value1");
        root2Cell.set("value2");
        root3Cell.set("value0");
        root3Cell.set("value3");

        verifyCellValues("value1", "value2", "value3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        verifyCellValues("value3", "value3", "value3");
    });

    it("Simultaneous delete/set should reach eventual consistency with the same value", async () => {
        // set after delete
        root1Cell.set("value1.1");
        root2Cell.delete();
        root3Cell.set("value1.3");

        verifyCellValues("value1.1", undefined, "value1.3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        verifyCellValues("value1.3", "value1.3", "value1.3");
    });

    it("Simultaneous delete/set on same cell should reach eventual consistency with the same value", async () => {
        // delete and then set on the same cell
        root1Cell.set("value2.1");
        root2Cell.delete();
        root3Cell.set("value2.3");
        // drain the outgoing so that the next set will come after
        await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
        root2Cell.set("value2.2");

        verifyCellValues("value2.1", "value2.2", "value2.3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        verifyCellValues("value2.2", "value2.2", "value2.2");
    });

    it("Simultaneous set/delete should reach eventual consistency with the same value", async () => {
        // delete after set
        root1Cell.set("value3.1");
        root2Cell.set("value3.2");
        root3Cell.delete();

        verifyCellValues("value3.1", "value3.2", undefined);
        verifyCellEmpty(false, false, true);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        verifyCellValues(undefined, undefined, undefined);
        verifyCellEmpty(true, true, true);
    });

    it("registers data if data is a shared object", async () => {
        const detachedCell1: ISharedCell = user1Document.createCell();
        const detachedCell2: ISharedCell = user1Document.createCell();
        const cellValue = "cell cell cell cell";
        detachedCell2.set(cellValue);
        detachedCell1.set(detachedCell2.handle);
        assert(!detachedCell2.isRegistered());

        root1Cell.set(detachedCell1.handle);
        assert(detachedCell2.isRegistered());

        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        async function getCellComponent(cellP: Promise<ISharedCell>): Promise<ISharedCell> {
            const cell = await cellP;
            const handle = cell.get() as IComponentHandle;
            return handle.get<ISharedCell>();
        }

        verifyCellValue(await getCellComponent(getCellComponent(Promise.resolve(root2Cell))), cellValue, 2);
        verifyCellValue(await getCellComponent(getCellComponent(Promise.resolve(root3Cell))), cellValue, 3);
    });

    afterEach(async () => {
        const closeP: Promise<void>[] = [];
        /* eslint-disable @typescript-eslint/strict-boolean-expressions */
        if (user1Document) { closeP.push(user1Document.close()); }
        if (user2Document) { closeP.push(user2Document.close()); }
        if (user3Document) { closeP.push(user3Document.close()); }
        /* eslint-enable @typescript-eslint/strict-boolean-expressions */
        await Promise.all(closeP);
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
