/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { PropertySet } from "@fluidframework/merge-tree";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { ITable, TableDocumentItem } from "../table";
import { TableDocument } from "../document";

/**
 * - Create a new object from the passed ITable object.
 * - Modify the methods that sets a cell value or annotates a cell to call the  propertyInterceptionCallback
 *   to get new properties.
 * - Use these new properties to call the underlying TableDocument.
 * - The propertyInterceptionCallback and the call to the underlying TableDocument are wrapped around an
 *   orderSequentially call to batch any operations that might happen in the callback.
 * - Modify the createSlice method for TableDocument object to return a wrapped object by calling
 *   createTableWithInterception on the created TableSlice object.
 *
 * @param table - The underlying ITable object
 * @param context - The IFluidDataStoreContext that will be used to call orderSequentially
 * @param propertyInterceptionCallback - The interception callback to be called
 *
 * @returns A new ITable object that intercepts the methods modifying the properties of cells, rows or columns.
 */
export function createTableWithInterception<T extends ITable>(
    table: T,
    context: IFluidDataStoreContext,
    propertyInterceptionCallback: (props?: PropertySet) => PropertySet): T {
    const tableWithInterception = Object.create(table);

    // executingCallback keeps track of whether a method on this wrapper object is called recursively
    // from the propertyInterceptionCallback.
    let executingCallback: boolean = false;

    tableWithInterception.setCellValue = (
        row: number,
        col: number,
        value: TableDocumentItem,
        properties?: PropertySet) => {
        // Wrapper methods should not be called from the interception callback as this will lead to
        // infinite recursion.
        assert(executingCallback === false,
            "Interception wrapper method called recursively from the interception callback");

        context.containerRuntime.orderSequentially(() => {
            executingCallback = true;
            try {
                table.setCellValue(row, col, value, propertyInterceptionCallback(properties));
            } finally {
                executingCallback = false;
            }
        });
    };

    tableWithInterception.annotateCell = (
        row: number,
        col: number,
        properties: PropertySet) => {
        // Wrapper methods should not be called from the interception callback as this will lead to
        // infinite recursion.
        assert(executingCallback === false,
            "Interception wrapper method called recursively from the interception callback");

        context.containerRuntime.orderSequentially(() => {
            executingCallback = true;
            try {
                table.annotateCell(row, col, propertyInterceptionCallback(properties));
            } finally {
                executingCallback = false;
            }
        });
    };

    // Override createSlice only for TableDocument because other objects (TableSlice) does not have this method.
    if (table instanceof TableDocument) {
        tableWithInterception.createSlice = async (
            sliceId: string,
            name: string,
            minRow: number,
            minCol: number,
            maxRow: number,
            maxCol: number): Promise<ITable> => {
            const tableSlice = await table.createSlice(sliceId, name, minRow, minCol, maxRow, maxCol);
            return createTableWithInterception(tableSlice, context, propertyInterceptionCallback);
        };
    }

    return tableWithInterception as T;
}
