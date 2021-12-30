/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ICombiningOp, IntervalType, LocalReference, PropertySet } from "@fluidframework/merge-tree";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    positionToRowCol,
    rowColToPosition,
    SharedNumberSequence,
    SparseMatrix,
    SequenceDeltaEvent,
} from "@fluidframework/sequence";
import { CellRange } from "./cellrange";
import { TableDocumentType } from "./componentTypes";
import { ConfigKey } from "./configKey";
import { debug } from "./debug";
import { TableSlice } from "./slice";
import { ITable, TableDocumentItem } from "./table";

export interface ITableDocumentEvents extends IEvent {
    (event: "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: SharedNumberSequence | SparseMatrix) => void);
    (event: "sequenceDelta",
        listener: (delta: SequenceDeltaEvent, target: SharedNumberSequence | SparseMatrix) => void);
}

/**
 * @deprecated - TableDocument is an abandoned prototype.  Please use SharedMatrix with
 *               the IMatrixProducer/Consumer interfaces instead.
 */
export class TableDocument extends DataObject<{Events: ITableDocumentEvents}> implements ITable {
    public static getFactory() { return TableDocument.factory; }

    private static readonly factory = new DataObjectFactory(
        TableDocumentType,
        TableDocument,
        [
            SparseMatrix.getFactory(),
            SharedNumberSequence.getFactory(),
        ],
        {},
        [
            TableSlice.getFactory().registryEntry,
        ],
    );

    public get numCols() { return this.maybeCols.getLength(); }
    public get numRows() { return this.matrix.numRows; }

    private get matrix(): SparseMatrix { return this.maybeMatrix; }

    private maybeRows?: SharedNumberSequence;
    private maybeCols?: SharedNumberSequence;
    private maybeMatrix?: SparseMatrix;

    public getCellValue(row: number, col: number): TableDocumentItem {
        return this.matrix.getItem(row, col);
    }

    public setCellValue(row: number, col: number, value: TableDocumentItem, properties?: PropertySet) {
        this.matrix.setItems(row, col, [value], properties);
    }

    public async getRange(label: string) {
        const intervals = this.matrix.getIntervalCollection(label);
        const interval = intervals.nextInterval(0);
        return new CellRange(interval, this.localRefToRowCol);
    }

    public async createSlice(
        sliceId: string,
        name: string,
        minRow: number,
        minCol: number,
        maxRow: number,
        maxCol: number): Promise<ITable> {
        const component = await TableSlice.getFactory().createChildInstance(
            this.context,
            { docId: this.runtime.id, name, minRow, minCol, maxRow, maxCol },
        );
        this.root.set(sliceId, component.handle);
        return component;
    }

    public annotateRows(startRow: number, endRow: number, properties: PropertySet, op?: ICombiningOp) {
        this.maybeRows.annotateRange(startRow, endRow, properties, op);
    }

    public getRowProperties(row: number): PropertySet {
        return this.maybeRows.getPropertiesAtPosition(row);
    }

    public annotateCols(startCol: number, endCol: number, properties: PropertySet, op?: ICombiningOp) {
        this.maybeCols.annotateRange(startCol, endCol, properties, op);
    }

    public getColProperties(col: number): PropertySet {
        return this.maybeCols.getPropertiesAtPosition(col);
    }

    public annotateCell(row: number, col: number, properties: PropertySet) {
        this.matrix.annotatePosition(row, col, properties);
    }

    public getCellProperties(row: number, col: number): PropertySet {
        return this.matrix.getPositionProperties(row, col);
    }

    // For internal use by TableSlice: Please do not use.
    public createInterval(label: string, minRow: number, minCol: number, maxRow: number, maxCol: number) {
        debug(`createInterval(${label}, ${minRow}:${minCol}..${maxRow}:${maxCol})`);
        const start = rowColToPosition(minRow, minCol);
        const end = rowColToPosition(maxRow, maxCol);
        const intervals = this.matrix.getIntervalCollection(label);
        intervals.add(start, end, IntervalType.SlideOnRemove);
    }

    public insertRows(startRow: number, numRows: number) {
        this.matrix.insertRows(startRow, numRows);
        this.maybeRows.insert(startRow, new Array(numRows).fill(0));
    }

    public removeRows(startRow: number, numRows: number) {
        this.matrix.removeRows(startRow, numRows);
        this.maybeRows.remove(startRow, startRow + numRows);
    }

    public insertCols(startCol: number, numCols: number) {
        this.matrix.insertCols(startCol, numCols);
        this.maybeCols.insert(startCol, new Array(numCols).fill(0));
    }

    public removeCols(startCol: number, numCols: number) {
        this.matrix.removeCols(startCol, numCols);
        this.maybeCols.remove(startCol, startCol + numCols);
    }

    protected async initializingFirstTime() {
        const rows = SharedNumberSequence.create(this.runtime, "rows");
        this.root.set("rows", rows.handle);

        const cols = SharedNumberSequence.create(this.runtime, "cols");
        this.root.set("cols", cols.handle);

        const matrix = SparseMatrix.create(this.runtime, "matrix");
        this.root.set("matrix", matrix.handle);

        this.root.set(ConfigKey.docId, this.runtime.id);
    }

    protected async hasInitialized() {
        const [maybeMatrixHandle, maybeRowsHandle, maybeColsHandle] = await Promise.all([
            this.root.wait<IFluidHandle<SparseMatrix>>("matrix"),
            this.root.wait<IFluidHandle<SharedNumberSequence>>("rows"),
            this.root.wait<IFluidHandle<SharedNumberSequence>>("cols"),
        ]);

        this.maybeMatrix = await maybeMatrixHandle.get();
        this.maybeRows = await maybeRowsHandle.get();
        this.maybeCols = await maybeColsHandle.get();

        this.forwardEvent(this.maybeCols, "op", "sequenceDelta");
        this.forwardEvent(this.maybeRows, "op", "sequenceDelta");
        this.forwardEvent(this.matrix, "op", "sequenceDelta");
    }

    private readonly localRefToRowCol = (localRef: LocalReference) => {
        const position = localRef.toPosition();
        return positionToRowCol(position);
    };
}
