/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { pointwise } from "./test";

const enum Consts {
	logW = 4,
	logH = 5,
	w = 1 << logW,
	h = 1 << logH,
	mw = w - 1,
	mh = h - 1,
	sizeW = 1 << (4 * logW),
	sizeH = 1 << (4 * logH),
}

type CellTile<T> = T[];

type SparseGrid<T> = CellTile<T>[][][];

function getCell<T>(r: number, c: number, grid: SparseGrid<T>): T | undefined {
	if (r < 0 || c < 0 || r >= Consts.sizeH || c >= Consts.sizeW) {
		return undefined;
	}
	const t2 =
		grid[
			(((c >> (3 * Consts.logW)) & Consts.mw) << Consts.logH) |
				((r >> (3 * Consts.logH)) & Consts.mh)
		];
	if (t2) {
		const t3 =
			t2[
				(((c >> (2 * Consts.logW)) & Consts.mw) << Consts.logH) |
					((r >> (2 * Consts.logH)) & Consts.mh)
			];
		if (t3) {
			const t4 =
				t3[
					(((c >> Consts.logW) & Consts.mw) << Consts.logH) | ((r >> Consts.logH) & Consts.mh)
				];
			if (t4) {
				return t4[((c & Consts.mw) << Consts.logH) | (r & Consts.mh)];
			}
		}
	}
	return undefined;
}

function setCell<T>(r: number, c: number, grid: SparseGrid<T>, value: T) {
	if (r < 0 || c < 0 || r >= Consts.sizeH || c >= Consts.sizeW) {
		return;
	}

	const i2 =
		(((c >> (3 * Consts.logW)) & Consts.mw) << Consts.logH) |
		((r >> (3 * Consts.logH)) & Consts.mh);
	let t2 = grid[i2];
	if (t2 === undefined) {
		t2 = grid[i2] = [];
	}

	const i3 =
		(((c >> (2 * Consts.logW)) & Consts.mw) << Consts.logH) |
		((r >> (2 * Consts.logH)) & Consts.mh);
	let t3 = t2[i3];
	if (t3 === undefined) {
		t3 = t2[i3] = [];
	}

	const i4 =
		(((c >> Consts.logW) & Consts.mw) << Consts.logH) | ((r >> Consts.logH) & Consts.mh);
	let t4 = t3[i4];
	if (t4 === undefined) {
		t4 = t3[i4] = [];
	}
	t4[((c & Consts.mw) << Consts.logH) | (r & Consts.mh)] = value;
}

function clearCell<T>(r: number, c: number, grid: SparseGrid<T>) {
	if (r < 0 || c < 0 || r >= Consts.sizeH || c >= Consts.sizeW) {
		return;
	}

	const i2 =
		(((c >> (3 * Consts.logW)) & Consts.mw) << Consts.logH) |
		((r >> (3 * Consts.logH)) & Consts.mh);
	const t2 = grid[i2];
	if (t2 === undefined) {
		return;
	}

	const i3 =
		(((c >> (2 * Consts.logW)) & Consts.mw) << Consts.logH) |
		((r >> (2 * Consts.logH)) & Consts.mh);
	const t3 = t2[i3];
	if (t3 === undefined) {
		return;
	}

	const i4 =
		(((c >> Consts.logW) & Consts.mw) << Consts.logH) | ((r >> Consts.logH) & Consts.mh);
	const t4 = t3[i4];
	if (t4 === undefined) {
		return;
	}
	delete t4[((c & Consts.mw) << Consts.logH) | (r & Consts.mh)];
}

function forEachCell<T>(
	grid: SparseGrid<T>,
	cb: (r: number, c: number, value: T) => void,
): void {
	let i1 = 0;
	for (const t1 of grid) {
		if (t1 !== undefined) {
			let i2 = 0;
			const c1 = (i1 >> Consts.logH) << (3 * Consts.logW);
			const r1 = (i1 & Consts.mh) << (3 * Consts.logH);
			for (const t2 of t1) {
				if (t2 !== undefined) {
					let i3 = 0;
					const c2 = (i2 >> Consts.logH) << (2 * Consts.logW);
					const r2 = (i2 & Consts.mh) << (2 * Consts.logH);
					for (const t3 of t2) {
						if (t3 !== undefined) {
							let i4 = 0;
							const c3 = (i3 >> Consts.logH) << Consts.logW;
							const r3 = (i3 & Consts.mh) << Consts.logH;
							for (const value of t3) {
								if (value !== undefined) {
									cb(
										r1 | r2 | r3 | (i4 & Consts.mh),
										c1 | c2 | c3 | (i4 >> Consts.logH),
										value,
									);
								}
								i4++;
							}
						}
						i3++;
					}
				}
				i2++;
			}
		}
		i1++;
	}
}

function forEachCellInColumn<T>(
	grid: SparseGrid<T>,
	column: number,
	cb: (r: number, c: number, value: T) => void,
): void {
	const colIdx1 = colIdx(column, 3);
	const colIdx2 = colIdx(column, 2);
	const colIdx3 = colIdx(column, 1);
	const colIdx4 = colIdx(column, 0);
	for (let r1 = 0; r1 < Consts.h; r1++) {
		const t1 = grid[colIdx1 | r1];
		if (t1 === undefined) {
			continue;
		}
		for (let r2 = 0; r2 < Consts.h; r2++) {
			const t2 = t1[colIdx2 | r2];
			if (t2 === undefined) {
				continue;
			}
			for (let r3 = 0; r3 < Consts.h; r3++) {
				const t3 = t2[colIdx3 | r3];
				if (t3 === undefined) {
					continue;
				}
				for (let r4 = 0; r4 < Consts.h; r4++) {
					const cell = t3[colIdx4 | r4];
					if (cell === undefined) {
						continue;
					}
					cb(
						((r1 & Consts.mh) << (3 * Consts.logH)) |
							((r2 & Consts.mh) << (2 * Consts.logH)) |
							((r3 & Consts.mh) << Consts.logH) |
							(r4 & Consts.mh),
						column,
						cell as any,
					);
				}
			}
		}
	}
}

function colIdx(col: number, level: 0 | 1 | 2 | 3): number {
	return ((col >> (level * Consts.logW)) & Consts.mw) << Consts.logH;
}

function colIdxUnshifted(col: number, level: 0 | 1 | 2 | 3): number {
	return (col >> (level * Consts.logW)) & Consts.mw;
}

function forEachCellInColumns<T>(
	grid: SparseGrid<T>,
	columnStart: number,
	numCols: number,
	cb: (r: number, c: number, value: T) => void,
): void {
	const colEnd = columnStart + numCols - 1;
	for (let r1 = 0; r1 < Consts.h; r1++) {
		const cStart1 = colIdxUnshifted(columnStart, 3);
		const cEnd1 = colIdxUnshifted(colEnd, 3);
		for (let c1 = cStart1; c1 <= cEnd1; c1++) {
			const t1 = grid[(c1 << Consts.logH) | r1];
			if (t1 === undefined) {
				continue;
			}
			for (let r2 = 0; r2 < Consts.h; r2++) {
				const cStart2 = colIdxUnshifted(columnStart, 2);
				const cEnd2 = colIdxUnshifted(colEnd, 2);
				for (let c2 = cStart2; c2 <= cEnd2; c2++) {
					const t2 = t1[(c2 << Consts.logH) | r2];
					if (t2 === undefined) {
						continue;
					}
					for (let r3 = 0; r3 < Consts.h; r3++) {
						const cStart3 = colIdxUnshifted(columnStart, 1);
						const cEnd3 = colIdxUnshifted(colEnd, 1);
						for (let c3 = cStart3; c3 <= cEnd3; c3++) {
							const t3 = t2[(c3 << Consts.logH) | r3];
							if (t3 === undefined) {
								continue;
							}
							for (let r4 = 0; r4 < Consts.h; r4++) {
								const cStart4 = colIdxUnshifted(columnStart, 0);
								const cEnd4 = colIdxUnshifted(colEnd, 0);
								for (let c4 = cStart4; c4 <= cEnd4; c4++) {
									const cell = t3[(c4 << Consts.logH) | r4];
									if (cell === undefined) {
										continue;
									}
									cb(
										((r1 & Consts.mh) << (3 * Consts.logH)) |
											((r2 & Consts.mh) << (2 * Consts.logH)) |
											((r3 & Consts.mh) << Consts.logH) |
											(r4 & Consts.mh),
										(c1 << (3 * Consts.logW)) |
											(c2 << (2 * Consts.logW)) |
											(c3 << Consts.logW) |
											c4,
										cell,
									);
								}
							}
						}
					}
				}
			}
		}
	}
}

// Remove unused warnings
forEachCell;
clearCell;
forEachCellInColumn;
forEachCellInColumns;

function initGrid<T>(): SparseGrid<T> {
	return [];
}

export class TiledGrid<T> {
	private readonly cells: SparseGrid<T> = initGrid();

	public get rowCount() {
		return Consts.sizeH;
	}
	public get colCount() {
		return Consts.sizeW;
	}

	public getCell(row: number, col: number) {
		return getCell(row, col, this.cells);
	}

	public setCell(row: number, col: number, value: T) {
		setCell(row, col, this.cells, value);
	}

	public get matrixProducer() {
		return undefined as any;
	}
}

pointwise("TiledGrid", new TiledGrid<number>());
