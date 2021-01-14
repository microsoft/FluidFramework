/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { LocalResolver } from "@fluidframework/local-driver";
import { PropertySet } from "@fluidframework/merge-tree";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createAndAttachContainer, createLocalLoader } from "@fluidframework/test-utils";
import { ITable } from "../table";
import { TableDocument } from "../document";
import { TableDocumentType } from "../componentTypes";
import { createTableWithInterception } from "../interception";

describe("Table Document with Interception", () => {
    describe("Simple User Attribution", () => {
        const documentId = "fluid-test://localhost/tableWithInterceptionTest";
        const codeDetails = {
            package: "tableWithInterceptionTestPkg",
            config: {},
        };

        const userAttributes = { userId: "Fake User" };
        let tableDocument: TableDocument;
        let componentContext: IFluidDataStoreContext;

        // Sample interface used for storing the details of a cell.
        interface ICellType {
            row: number,
            col: number,
            value: string,
        }

        function orderSequentially(callback: () => void): void {
            callback();
        }

        // Interception function that adds userProps to the passed props and returns.
        function propertyInterceptionCb(props?: PropertySet): PropertySet {
            const newProps = { ...props, ...userAttributes };
            return newProps;
        }

        // Function that verifies that the given table has correct value and properties for
        // a given cell.
        function verifyCell(table: ITable, cell: ICellType, props?: PropertySet) {
            assert.equal(
                table.getCellValue(cell.row, cell.col),
                cell.value,
                "The cell value should match the value that was set");
            if (props === undefined) {
                assert.equal(
                    table.getCellProperties(cell.row, cell.col),
                    undefined,
                    "Properties should not exist on the cell because there was no interception");
            } else {
                assert.deepEqual(
                    { ...table.getCellProperties(cell.row, cell.col) },
                    { ...props },
                    "The properties set via the interception callback should exist");
            }
        }

        beforeEach(async () => {
            const factory = new ContainerRuntimeFactoryWithDefaultDataStore(
                TableDocument.getFactory(),
                new Map([
                    [TableDocumentType, Promise.resolve(TableDocument.getFactory())],
                ]),
            );

            const deltaConnectionServer = LocalDeltaConnectionServer.create();
            const urlResolver = new LocalResolver();
            const loader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
            const container = await createAndAttachContainer(
                codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
            tableDocument = await requestFluidObject<TableDocument>(container, "default");

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            componentContext = { containerRuntime: { orderSequentially } } as IFluidDataStoreContext;
        });

        it("should be able to intercept TableDocument methods by the interception", async () => {
            const tableDocumentWithInterception =
                createTableWithInterception(tableDocument, componentContext, propertyInterceptionCb);

            // Insert a row and a column into the table document.
            tableDocumentWithInterception.insertRows(0, 1);
            tableDocumentWithInterception.insertCols(0, 1);

            const cell: ICellType = { row: 0, col: 0, value: "testCell" };
            // Set a cell value. Verify that the cell has user properties added by the interception callback.
            tableDocumentWithInterception.setCellValue(cell.row, cell.col, cell.value);
            verifyCell(tableDocumentWithInterception, cell, userAttributes);

            // Annotate the cell. Verify that it has user properties added by the interception callback.
            const props = { style: "bold" };
            tableDocumentWithInterception.annotateCell(cell.row, cell.col, props);
            verifyCell(tableDocumentWithInterception, cell, { ...props, ...userAttributes });
        });

        it("should be able to see changes made by the wrapper from the underlying table document", async () => {
            const tableDocumentWithInterception =
                createTableWithInterception(tableDocument, componentContext, propertyInterceptionCb);

            // Insert a row and a column via the table document wrapper.
            tableDocumentWithInterception.insertRows(0, 1);
            tableDocumentWithInterception.insertCols(0, 1);

            const cell: ICellType = { row: 0, col: 0, value: "testCell" };
            // Set a cell value via the wrapper. Verify that the cell value can be retrieved by the underlying
            // table document and it should have the user properties.
            tableDocumentWithInterception.setCellValue(cell.row, cell.col, cell.value);
            verifyCell(tableDocument, cell, userAttributes);

            // Annotate the cell via the wrapper. Verify that the underlying table document can retrieve it and
            // the user properties added by the interception callback.
            const props = { style: "bold" };
            tableDocumentWithInterception.annotateCell(cell.row, cell.col, props);
            verifyCell(tableDocument, cell, { ...props, ...userAttributes });
        });

        it("should be able to see changes made by the underlying table document from the interception", async () => {
            const tableDocumentWithInterception =
                createTableWithInterception(tableDocument, componentContext, propertyInterceptionCb);

            // Insert a row and a column via the underlying table document.
            tableDocument.insertRows(0, 1);
            tableDocument.insertCols(0, 1);

            const cell: ICellType = { row: 0, col: 0, value: "testCell" };
            // Set a cell value via the underlying table document. Verify that the cell value can be retrieved by the
            // wrapper and it should NOT have the user properties.
            tableDocument.setCellValue(cell.row, cell.col, cell.value);
            verifyCell(tableDocumentWithInterception, cell);

            // Annotate the cell via the underlying table document. Verify that the wrapper can retrieve it and the
            // user properties should not exist.
            const props = { style: "bold" };
            tableDocument.annotateCell(cell.row, cell.col, props);
            verifyCell(tableDocument, cell, props);
        });

        it("should be able to create a wrapped table slice from the table document wrapper", async () => {
            const tableDocumentWithInterception =
                createTableWithInterception(tableDocument, componentContext, propertyInterceptionCb);

            // Insert a row and a column into the table document.
            tableDocumentWithInterception.insertRows(0, 3);
            tableDocumentWithInterception.insertCols(0, 3);

            // Add values to a cell and verify that it is set.
            const cell1: ICellType = { row: 1, col: 1, value: "cell1" };
            tableDocumentWithInterception.setCellValue(cell1.row, cell1.col, cell1.value);
            verifyCell(tableDocumentWithInterception, cell1, userAttributes);

            // Create a table slice that contains the cell set above.
            const tableSlice =
                await tableDocumentWithInterception.createSlice("test-slice-id", "tableSlice", 1, 1, 2, 2);
            // Verify that the slice can get the cell value set by the table document.
            verifyCell(tableSlice, cell1, userAttributes);

            // Add value to a new cell via the table slice.
            const cell2: ICellType = { row: 2, col: 2, value: "cell2" };
            tableSlice.setCellValue(cell2.row, cell2.col, cell2.value);
            // Verify that the value is set and it contains the user properties added by the interception callback.
            verifyCell(tableSlice, cell2, userAttributes);
            // Verify that the table document can see the values and properties.
            verifyCell(tableDocumentWithInterception, cell2, userAttributes);

            // Annotate a cell via the table slice.
            const props = { style: "bold" };
            tableSlice.annotateCell(cell2.row, cell2.col, props);
            // Verify that the cell has the above properties and user properties added by the interception callback.
            verifyCell(tableSlice, cell2, { ...props, ...userAttributes });
            // Verify that the table document can also retrieve these properties.
            verifyCell(tableDocumentWithInterception, cell2, { ...props, ...userAttributes });
        });

        /**
         * This test calls a method on the wrapper from the interception callback which will cause an infinite
         * recursion. Verify that the wrapper detects this and asserts.
         * Also, verify that the object is not unusable after the assert.
         */
        it("should assert if a wrapper method is called from the callback causing infinite recursion", async () => {
            // eslint-disable-next-line prefer-const
            let tableDocumentWithInterception: TableDocument;

            const cellInRecursiveCb: ICellType = { row: 0, col: 0, value: "CellInRecursiveCb" };
            let useWrapper: boolean = true;
            // If useWrapper above is true, this interception callback calls a method on the wrapped object
            // causing an infinite recursion.
            // If useWrapper is false, it uses the passed shared string which does not cause recursion.
            function recursiveInterceptionCb(properties?: PropertySet) {
                const ss = useWrapper ? tableDocumentWithInterception : tableDocument;
                // Annotate the first row and column.
                ss.setCellValue(cellInRecursiveCb.row, cellInRecursiveCb.col, cellInRecursiveCb.value);
                return { ...properties, ...userAttributes };
            }

            // Create the interception wrapper with the above callback. The set method should throw an assertion as this
            // will cause infinite recursion.
            tableDocumentWithInterception =
                createTableWithInterception(tableDocument, componentContext, recursiveInterceptionCb);

            // Insert a row and a column via the underlying table document.
            tableDocument.insertRows(0, 2);
            tableDocument.insertCols(0, 2);

            const cell: ICellType = { row: 1, col: 1, value: "testCell" };
            let asserted: boolean = false;
            try {
                tableDocumentWithInterception.setCellValue(cell.row, cell.col, cell.value);
            } catch (error) {
                assert.strictEqual(error.message,
                    "Interception wrapper method called recursively from the interception callback",
                    "We should have caught an assert in setCellValue because it detects an infinite recursion");
                asserted = true;
            }
            assert.equal(asserted, true, "setCellValue should have asserted because it detects infinite recursion");

            // Verify that the object is still usable:
            // Set useWrapper to false and call setCellValue on the wrapper again. Verify that we do not get an assert.
            useWrapper = false;
            cell.value = "newTestValue";
            tableDocumentWithInterception.setCellValue(cell.row, cell.col, cell.value);
            verifyCell(tableDocumentWithInterception, cell, userAttributes);

            // Verify that the cell value set in the recursive callback is correct and it does not have user attributes.
            verifyCell(tableDocumentWithInterception, cellInRecursiveCb);
        });
    });
});
