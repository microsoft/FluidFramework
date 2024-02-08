/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IReverseMap, ReverseMapType } from "./contracts";

export class ReverseMap implements IReverseMap {
	private readonly rowMap: { [id: string]: number } = {};
	private readonly colMap: { [id: string]: number } = {};

	constructor() {}

	public getRowId(rowId: string): number | undefined {
		return this.rowMap[rowId];
	}

	public getColId(colId: string): number | undefined {
		return this.colMap[colId];
	}

	public getRowMap(): { [id: string]: number } {
		return this.rowMap;
	}

	public getColMap(): { [id: string]: number } {
		return this.colMap;
	}

	private insertCellIntoRowMap(index: number, key: string, value: number) {
		// Convert the map to an array of key-value
		// Notice we use Object.entries to keep the order from the map
		const entries = Object.entries(this.rowMap); // we can also try sort((a, b) => a[1] - b[1]);

		// Insert the new key-value pair at the specified index
		entries.splice(index, 0, [key, value]);

		// Clear the original map
		Object.keys(this.rowMap).forEach((tempKey) => {
			if (Object.prototype.hasOwnProperty.call(this.rowMap, tempKey)) {
				Reflect.deleteProperty(this.rowMap, tempKey);
			}
		});

		// Re-populate the map with the updated items from the array
		entries.forEach(([localKey], newIndex) => {
			this.rowMap[localKey] = newIndex + 1;
		});
	}

	public addCellToMap(type: ReverseMapType, id: string, index: number): void {
		if (type === "row") {
			// this behavior is very specific to the way SharedMatrix does its row insertion.
			if (Object.keys(this.rowMap).length >= index + 1) {
				// In case of insertion or rows within existing boundaries of the matrix, we will need to manually update
				// the map to reflect and shift existing indexes. For example, if we insert a new row at index 2,
				// the existing row at index 2 will be shifted to index 3 and so on.
				// Note this only applies for insertion within existing rows but removal as
				//  rowsChanged and columnsChanged methods are responsible for processing it.
				this.insertCellIntoRowMap(index, id, index + 1);
			} else {
				this.rowMap[id] = index + 1;
			}
		} else {
			this.colMap[id] = index + 1;
		}
	}

	// We need to ensure that we are tracking all the cells and when removing cells, we need to
	// remove the tracking information as well as update the indexes in the map.
	public removeCellsFromMap(type: ReverseMapType, start: number, count: number) {
		const map = type === "row" ? this.rowMap : this.colMap;
		if (count > 0) {
			// Convert the map to an array of key-value pairs
			// Notice we use Object.entries to keep the order from the map
			const entries = Object.entries(map);

			// Remove the specified range of items from the array
			// Note the index from the reverse mapping is off by 1 as the matrix has a row and col tracking IDs
			// and the map indexes are 0 based
			entries.splice(start - 1, count);

			// Clear the original map
			Object.keys(map).forEach((key) => {
				if (Object.prototype.hasOwnProperty.call(map, key)) {
					Reflect.deleteProperty(map, key);
				}
			});

			// Re-populate the map with the remaining items from the array
			entries.forEach(([key, value], index) => {
				map[key] = index + 1;
			});
		}
	}
}
