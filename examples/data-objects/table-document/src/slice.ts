/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { PropertySet } from "@fluidframework/sequence";
import { CellRange } from "./cellrange";
import { TableSliceType } from "./componentTypes";
import { ConfigKey } from "./configKey";
import { TableDocument } from "./document";
import { ITable, TableDocumentItem } from "./table";

export interface ITableSliceConfig {
	docId: string;
	name: string;
	minRow: number;
	minCol: number;
	maxRow: number;
	maxCol: number;
}

/**
 * @internal
 */
export class TableSlice extends DataObject<{ InitialState: ITableSliceConfig }> implements ITable {
	public static getFactory() {
		return TableSlice.factory;
	}

	private static readonly factory = new DataObjectFactory(TableSliceType, TableSlice, [], {});

	public get name() {
		return this.root.get(ConfigKey.name);
	}
	public set name(value: string) {
		this.root.set(ConfigKey.name, value);
	}
	public get values() {
		return this.maybeValues;
	}
	private get doc() {
		return this.maybeDoc;
	}

	public get numRows() {
		return this.values.getRange().numRows;
	}
	public get numCols() {
		return this.values.getRange().numCols;
	}

	private maybeDoc?: TableDocument;
	private maybeValues?: CellRange;

	public getCellValue(row: number, col: number): TableDocumentItem {
		this.validateInSlice(row, col);
		return this.doc.getCellValue(row, col);
	}

	public setCellValue(
		row: number,
		col: number,
		value: TableDocumentItem,
		properties?: PropertySet,
	) {
		this.validateInSlice(row, col);
		this.doc.setCellValue(row, col, value, properties);
	}

	public annotateRows(startRow: number, endRow: number, properties: PropertySet) {
		this.validateInSlice(startRow, undefined);
		this.validateInSlice(endRow - 1, undefined);
		this.doc.annotateRows(startRow, endRow, properties);
	}

	public getRowProperties(row: number): PropertySet {
		this.validateInSlice(row, undefined);
		return this.doc.getRowProperties(row);
	}

	public annotateCols(startCol: number, endCol: number, properties: PropertySet) {
		this.validateInSlice(undefined, startCol);
		this.validateInSlice(undefined, endCol - 1);
		this.doc.annotateCols(startCol, endCol, properties);
	}

	public getColProperties(col: number): PropertySet {
		this.validateInSlice(undefined, col);
		return this.doc.getColProperties(col);
	}

	public annotateCell(row: number, col: number, properties: PropertySet) {
		this.validateInSlice(row, col);
		this.doc.annotateCell(row, col, properties);
	}

	public getCellProperties(row: number, col: number): PropertySet {
		this.validateInSlice(row, col);
		return this.doc.getCellProperties(row, col);
	}

	public insertRows(startRow: number, numRows: number) {
		this.doc.insertRows(startRow, numRows);
	}

	public removeRows(startRow: number, numRows: number) {
		this.doc.removeRows(startRow, numRows);
	}

	public insertCols(startCol: number, numCols: number) {
		this.doc.insertCols(startCol, numCols);
	}

	public removeCols(startCol: number, numCols: number) {
		this.doc.removeCols(startCol, numCols);
	}

	protected async initializingFirstTime(initialState?: ITableSliceConfig) {
		if (!initialState) {
			throw new Error("TableSlice must be created with initial state");
		}

		this.root.set(ConfigKey.docId, initialState.docId);
		this.root.set(ConfigKey.name, initialState.name);
		const response = await this.context.IFluidHandleContext.resolveHandle({
			url: `/${initialState.docId}`,
		});
		if (response.status !== 200 || response.mimeType !== "fluid/object") {
			throw new Error("Could not resolve handle");
		}
		this.maybeDoc = response.value;
		this.root.set(initialState.docId, this.maybeDoc.handle);
		await this.ensureDoc();
		this.createValuesRange(
			initialState.minCol,
			initialState.minRow,
			initialState.maxCol,
			initialState.maxRow,
		);
	}

	protected async initializingFromExisting() {
		await this.ensureDoc();
	}

	protected async hasInitialized() {
		this.maybeValues = await this.doc.getRange(this.root.get(ConfigKey.valuesKey));

		this.root.on("op", this.emitOp);
		this.doc.on("sequenceDelta", this.emitSequenceDelta);
	}

	private async ensureDoc() {
		if (!this.maybeDoc) {
			const docId = this.root.get(ConfigKey.docId);
			// fetch handle from root
			const handle = this.root.get<IFluidHandle<TableDocument>>(docId);
			this.maybeDoc = await handle.get();
		}
	}

	private createValuesRange(minCol: number, minRow: number, maxCol: number, maxRow: number) {
		const valuesRangeId = `values-${Math.random().toString(36).substr(2)}`;
		this.root.set(ConfigKey.valuesKey, valuesRangeId);
		this.doc.createInterval(valuesRangeId, minRow, minCol, maxRow, maxCol);
	}

	// Checks whether or not a specified row/column combination is within this slice and throws if not.
	private validateInSlice(row?: number, col?: number) {
		const range = this.values.getRange();

		if ((row !== undefined && row < range.row) || row >= range.row + range.numRows) {
			throw new Error("Unable to access specified row from this slice.");
		}

		if ((col !== undefined && col < range.col) || col >= range.col + range.numCols) {
			throw new Error("Unable to access specified column from this slice.");
		}
	}

	private readonly emitOp = (...args: any[]) => {
		this.emit("op", ...args);
	};

	private readonly emitSequenceDelta = (...args: any[]) => {
		this.emit("sequenceDelta", ...args);
	};
}
