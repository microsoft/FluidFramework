/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { uuidType } from "./collabSpaces";

export type ReverseMapType = "row" | "col";

export interface IReverseMap {
	getRowIndex(rowId: uuidType): number | undefined;
	getColIndex(colId: uuidType): number | undefined;

	getRowMap(): Readonly<{ [id: uuidType]: number }>;
	getColMap(): Readonly<{ [id: uuidType]: number }>;

	removeCellsFromMap(type: ReverseMapType, start: number, count: number): void;

	addCellToMap(type: ReverseMapType, id: uuidType, index: number): void;
}

class Entry {
	index: number;
	uniqueIdentifier: uuidType;

	constructor(uniqueIdentifier: uuidType, index: number) {
		this.uniqueIdentifier = uniqueIdentifier;
		this.index = index;
	}
}

export class ReverseMap implements IReverseMap {
	private readonly rowMap: Entry[];
	private readonly colMap: Entry[];

	constructor() {
		this.rowMap = [];
		this.colMap = [];
	}

	private appendEntry(type: ReverseMapType, index: number, uniqueIdentifier: uuidType): void {
		const map = type === "row" ? this.rowMap : this.colMap;
		assert(map !== undefined, "map should not be undefined");
		const entry = new Entry(uniqueIdentifier, index);
		map.push(entry);
	}

	private insertEntry(type: ReverseMapType, index: number, uniqueIdentifier: uuidType): void {
		const map = type === "row" ? this.rowMap : this.colMap;
		assert(map !== undefined, "map should not be undefined");
		const newEntry = new Entry(uniqueIdentifier, index);
		map.splice(index, 0, newEntry);
		for (let i = map[index].index; i < map.length; i++) {
			map[i].index = i + 1;
		}
	}

	private deleteEntryRange(type: ReverseMapType, index: number, count: number): void {
		const map = type === "row" ? this.rowMap : this.colMap;
		assert(map !== undefined, "map should not be undefined");
		// The idea is that we might not need the following lines as the index should be unique and we can use it to find the entry.
		// const index = map.findIndex((entry) => {
		// 	const numId = typeof entry.uniqueIdentifier === "number" ? Number(index) : index;
		// 	return entry.index === numId;
		// });
		if (index !== -1) {
			map.splice(index, count);
			for (let i = index; i < map.length; i++) {
				map[i].index = i + 1;
			}
		}
	}

	private findById(type: ReverseMapType, uniqueIdentifier: uuidType): Entry | undefined {
		const map = type === "row" ? this.rowMap : this.colMap;
		assert(map !== undefined, "map should not be undefined");

		return map.find((entry) => {
			const numId =
				typeof entry.uniqueIdentifier === "number"
					? Number(uniqueIdentifier)
					: uniqueIdentifier;
			return entry.uniqueIdentifier === numId;
		});
	}

	public getRowIndex(rowId: uuidType): number | undefined {
		return this.findById("row", rowId)?.index;
	}

	public getColIndex(colId: uuidType): number | undefined {
		return this.findById("col", colId)?.index;
	}

	public getRowMap(): Readonly<{ [uniqueIdentifier: uuidType]: number }> {
		const rowMapArray: { [uniqueIdentifier: uuidType]: number } = {};
		this.rowMap.forEach((entry) => {
			rowMapArray[entry.uniqueIdentifier] = entry.index;
		});
		return rowMapArray;
	}

	public getColMap(): Readonly<{ [uniqueIdentifier: uuidType]: number }> {
		const colMapArray: { [uniqueIdentifier: uuidType]: number } = {};
		this.colMap.forEach((entry) => {
			colMapArray[entry.uniqueIdentifier] = entry.index;
		});
		return colMapArray;
	}

	public addCellToMap(type: ReverseMapType, uniqueIdentifier: uuidType, index: number): void {
		const map = type === "row" ? this.rowMap : this.colMap;
		// this behavior is very specific to the way SharedMatrix does its row insertion signal, in which we first get the row addition
		// without the unique ids and soon after, the cell changes are triggered and we take opportunity to update the reverse map.
		if (map.length >= index + 1) {
			// In case of insertion or rows within existing boundaries of the matrix, we will need to manually update
			// the map to reflect and shift existing indexes. For example, if we insert a new row at index 2,
			// the existing row at index 2 will be shifted to index 3 and so on.
			// Note this only applies for insertion within existing rows but removal as
			//  rowsChanged and columnsChanged methods are responsible for processing it.
			// this.insertCellIntoMap(type, index, uniqueIdentifier, index + 1);
			this.insertEntry(type, index, uniqueIdentifier);
		} else {
			this.appendEntry(type, index + 1, uniqueIdentifier);
		}
	}

	// We need to ensure that we are tracking all the cells and when removing cells, we need to
	// remove the tracking information as well as update the indexes in the map.
	public removeCellsFromMap(type: ReverseMapType, start: number, count: number) {
		assert(start >= 0, "start must be non-negative");
		if (count > 0) {
			this.deleteEntryRange(type, start, count);
		}
	}
}
