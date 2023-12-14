/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent, IFluidHandle } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	IntervalType,
	SequenceDeltaEvent,
	ReferencePosition,
	PropertySet,
	SharedString,
	createEndpointIndex,
} from "@fluidframework/sequence";
import {
	positionToRowCol,
	rowColToPosition,
	SparseMatrix,
	SharedNumberSequence,
} from "@fluid-experimental/sequence-deprecated";
import { CellRange } from "./cellrange";
import { TableDocumentType } from "./componentTypes";
import { ConfigKey } from "./configKey";
import { debug } from "./debug";
import { TableSlice } from "./slice";
import { ITable, TableDocumentItem } from "./table";

/**
 * @deprecated `TableDocument` is an abandoned prototype.
 * Please use {@link @fluidframework/matrix#SharedMatrix} with the `IMatrixProducer`/`Consumer` interfaces instead.
 * @alpha
 */
export interface ITableDocumentEvents extends IEvent {
	(
		event: "op",
		listener: (
			op: ISequencedDocumentMessage,
			local: boolean,
			target: SharedNumberSequence | SparseMatrix,
		) => void,
	);
	(
		event: "sequenceDelta",
		listener: (delta: SequenceDeltaEvent, target: SharedNumberSequence | SparseMatrix) => void,
	);
}

/**
 * @deprecated `TableDocument` is an abandoned prototype.
 * Please use {@link @fluidframework/matrix#SharedMatrix} with the `IMatrixProducer`/`Consumer` interfaces instead.
 * @alpha
 */
export class TableDocument extends DataObject<{ Events: ITableDocumentEvents }> implements ITable {
	public static getFactory() {
		return TableDocument.factory;
	}

	private static readonly factory = new DataObjectFactory(
		TableDocumentType,
		TableDocument,
		[SparseMatrix.getFactory(), SharedNumberSequence.getFactory()],
		{},
		[TableSlice.getFactory().registryEntry],
	);

	public get numCols() {
		return this.cols.getLength();
	}
	public get numRows() {
		return this.matrix.numRows;
	}

	private rows: SharedNumberSequence;
	private cols: SharedNumberSequence;
	private matrix: SparseMatrix;

	public getCellValue(row: number, col: number): TableDocumentItem {
		return this.matrix.getItem(row, col);
	}

	public setCellValue(
		row: number,
		col: number,
		value: TableDocumentItem,
		properties?: PropertySet,
	) {
		this.matrix.setItems(row, col, [value], properties);
	}

	public async getRange(label: string): Promise<CellRange> {
		const endpointIndex = createEndpointIndex(this.matrix as unknown as SharedString);
		const intervals = this.matrix.getIntervalCollection(label);
		intervals.attachIndex(endpointIndex);
		const interval = endpointIndex.nextInterval(0);
		intervals.detachIndex(endpointIndex);
		return new CellRange(interval, this.localRefToRowCol);
	}

	public async createSlice(
		sliceId: string,
		name: string,
		minRow: number,
		minCol: number,
		maxRow: number,
		maxCol: number,
	): Promise<ITable> {
		const component = await TableSlice.getFactory().createChildInstance(this.context, {
			docId: this.runtime.id,
			name,
			minRow,
			minCol,
			maxRow,
			maxCol,
		});
		this.root.set(sliceId, component.handle);
		return component;
	}

	public annotateRows(startRow: number, endRow: number, properties: PropertySet) {
		this.rows.annotateRange(startRow, endRow, properties);
	}

	public getRowProperties(row: number): PropertySet {
		return this.rows.getPropertiesAtPosition(row);
	}

	public annotateCols(startCol: number, endCol: number, properties: PropertySet) {
		this.cols.annotateRange(startCol, endCol, properties);
	}

	public getColProperties(col: number): PropertySet {
		return this.cols.getPropertiesAtPosition(col);
	}

	public annotateCell(row: number, col: number, properties: PropertySet) {
		this.matrix.annotatePosition(row, col, properties);
	}

	public getCellProperties(row: number, col: number): PropertySet {
		return this.matrix.getPositionProperties(row, col);
	}

	// For internal use by TableSlice: Please do not use.
	public createInterval(
		label: string,
		minRow: number,
		minCol: number,
		maxRow: number,
		maxCol: number,
	) {
		debug(`createInterval(${label}, ${minRow}:${minCol}..${maxRow}:${maxCol})`);
		const start = rowColToPosition(minRow, minCol);
		const end = rowColToPosition(maxRow, maxCol);
		const intervals = this.matrix.getIntervalCollection(label);
		intervals.add(start, end, IntervalType.SlideOnRemove);
	}

	public insertRows(startRow: number, numRows: number) {
		this.matrix.insertRows(startRow, numRows);
		this.rows.insert(startRow, new Array(numRows).fill(0));
	}

	public removeRows(startRow: number, numRows: number) {
		this.matrix.removeRows(startRow, numRows);
		this.rows.remove(startRow, startRow + numRows);
	}

	public insertCols(startCol: number, numCols: number) {
		this.matrix.insertCols(startCol, numCols);
		this.cols.insert(startCol, new Array(numCols).fill(0));
	}

	public removeCols(startCol: number, numCols: number) {
		this.matrix.removeCols(startCol, numCols);
		this.cols.remove(startCol, startCol + numCols);
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
		this.matrix = await this.root.get<IFluidHandle<SparseMatrix>>("matrix").get();
		this.rows = await this.root.get<IFluidHandle<SharedNumberSequence>>("rows").get();
		this.cols = await this.root.get<IFluidHandle<SharedNumberSequence>>("cols").get();

		this.cols.on("op", (...args: any[]) => this.emit("op", ...args));
		this.cols.on("sequenceDelta", (...args: any[]) => this.emit("sequenceDelta", ...args));
		this.rows.on("op", (...args: any[]) => this.emit("op", ...args));
		this.rows.on("sequenceDelta", (...args: any[]) => this.emit("sequenceDelta", ...args));
		this.matrix.on("op", (...args: any[]) => this.emit("op", ...args));
		this.matrix.on("sequenceDelta", (...args: any[]) => this.emit("sequenceDelta", ...args));
	}

	private readonly localRefToRowCol = (localRef: ReferencePosition) => {
		const position = this.matrix.localReferencePositionToPosition(localRef);
		return positionToRowCol(position);
	};
}
