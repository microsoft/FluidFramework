/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	Jsonable,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import {
	BaseSegment,
	IJSONSegment,
	ISegment,
	PropertySet,
} from "@fluidframework/merge-tree/internal";
import { SharedSegmentSequence } from "@fluidframework/sequence/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { pkgVersion } from "./packageVersion.js";
import { SubSequence } from "./sharedSequence.js";

/**
 * An empty segment that occupies 'cachedLength' positions.
 * {@link (SparseMatrix:variable)} uses `PaddingSegment` to "pad" a run of unoccupied cells.
 *
 * @deprecated `PaddingSegment` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export class PaddingSegment extends BaseSegment {
	public static readonly typeString = "PaddingSegment";
	public static is(segment: ISegment): segment is PaddingSegment {
		return segment.type === PaddingSegment.typeString;
	}
	public static fromJSONObject(spec: any) {
		if (spec && typeof spec === "object" && "pad" in spec) {
			return new PaddingSegment(spec.pad, spec.props);
		}
		return undefined;
	}
	public readonly type = PaddingSegment.typeString;

	constructor(size: number, props?: PropertySet) {
		super(props);
		this.cachedLength = size;
	}

	public toJSONObject() {
		return { pad: this.cachedLength, props: this.properties };
	}

	public clone(start = 0, end?: number) {
		const b = new PaddingSegment(this.cachedLength);
		this.cloneInto(b);
		return b;
	}

	public canAppend(segment: ISegment) {
		return PaddingSegment.is(segment);
	}

	public toString() {
		return `[padding: ${this.cachedLength}]`;
	}

	public append(segment: ISegment) {
		assert(PaddingSegment.is(segment), 0x5f7 /* can only append padding segment */);
		super.append(segment);
	}

	// Returns true if entire run removed
	public removeRange(start: number, end: number) {
		this.cachedLength -= end - start;
		return this.cachedLength === 0;
	}

	protected createSplitSegmentAt(pos: number) {
		const leftLength = pos;
		const rightLength = this.cachedLength - pos;

		this.cachedLength = leftLength;
		return new PaddingSegment(rightLength);
	}
}

/**
 * @deprecated `SparseMatrixItem` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export type SparseMatrixItem = any;

/**
 * @deprecated `RunSegment` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export class RunSegment extends SubSequence<SparseMatrixItem> {
	public static readonly typeString = "RunSegment";
	public static is(segment: ISegment): segment is RunSegment {
		return segment.type === RunSegment.typeString;
	}
	public static fromJSONObject(spec: any) {
		if (spec && typeof spec === "object" && "items" in spec) {
			return new RunSegment(spec.items, spec.props);
		}
		return undefined;
	}
	public readonly type = RunSegment.typeString;

	private tags: any[];

	constructor(
		public items: SparseMatrixItem[],
		props?: PropertySet,
	) {
		super(items, props);
		this.tags = new Array(items.length).fill(undefined);
	}

	public clone(start = 0, end?: number) {
		const b = new RunSegment(this.items.slice(start, end));
		if (this.tags) {
			b.tags = this.tags.slice(start, end);
		}
		this.cloneInto(b);
		return b;
	}

	public append(segment: ISegment) {
		super.append(segment);

		const asRun = segment as RunSegment;
		if (asRun.tags) {
			if (this.tags) {
				this.tags.splice(this.items.length, 0, ...asRun.tags);
			}
		}

		return this;
	}

	// TODO: retain removed items for undo
	// returns true if entire run removed
	public removeRange(start: number, end: number) {
		this.tags.splice(start, end - start);
		return super.removeRange(start, end);
	}

	public getTag(pos: number) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.tags[pos];
	}

	public setTag(pos: number, tag: any) {
		this.tags[pos] = tag;
	}

	protected createSplitSegmentAt(pos: number) {
		if (pos > 0) {
			const remainingItems = this.items.slice(pos);
			this.items = this.items.slice(0, pos);
			this.cachedLength = this.items.length;

			const leafSegment = new RunSegment(remainingItems);
			leafSegment.tags = this.tags.slice(pos);
			this.tags.length = pos;

			return leafSegment;
		}
	}
}

/**
 * @deprecated `MatrixSegment` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export type MatrixSegment = RunSegment | PaddingSegment;

/**
 * @deprecated `maxCol` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export const maxCol = 0x200000; // X128 Excel maximum of 16,384 columns

/**
 * @deprecated `maxCols` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export const maxCols = maxCol + 1;

/**
 * @deprecated `maxRow` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export const maxRow = 0xffffffff; // X4096 Excel maximum of 1,048,576 rows

/**
 * @deprecated `maxRows` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export const maxRows = maxRow + 1;

/**
 * @deprecated `maxCellPosition` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export const maxCellPosition = maxCol * maxRow;

/**
 * @deprecated `positionToRowCol` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export const rowColToPosition = (row: number, col: number) => row * maxCols + col;

/**
 * @deprecated `positionToRowCol` is part of an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export function positionToRowCol(position: number) {
	const row = Math.floor(position / maxCols);
	const col = position - row * maxCols;
	return { row, col };
}

/**
 * {@inheritDoc (SparseMatrix:variable)}
 * @internal
 */
export class SparseMatrixClass extends SharedSegmentSequence<MatrixSegment> {
	constructor(
		document: IFluidDataStoreRuntime,
		public id: string,
		attributes: IChannelAttributes,
	) {
		super(document, id, attributes, SparseMatrixFactory.segmentFromSpec);
	}

	public get numRows() {
		return positionToRowCol(this.getLength()).row;
	}

	public setItems(row: number, col: number, values: SparseMatrixItem[], props?: PropertySet) {
		const start = rowColToPosition(row, col);
		const end = start + values.length;
		const segment = new RunSegment(values, props);

		this.replaceRange(start, end, segment);
	}

	public getItem(
		row: number,
		col: number,
	): // The return type is defined explicitly here to prevent TypeScript from generating dynamic imports
	Jsonable<string | number | boolean | IFluidHandle> | undefined {
		const pos = rowColToPosition(row, col);
		const { segment, offset } = this.getContainingSegment(pos);
		if (segment && RunSegment.is(segment)) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return segment.items[offset ?? 0];
		} else if (segment && PaddingSegment.is(segment)) {
			return undefined;
		}

		throw new Error(`Unrecognized Segment type`);
	}

	public getTag(row: number, col: number) {
		const { segment, offset } = this.getSegment(row, col);
		if (segment && RunSegment.is(segment)) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return segment.getTag(offset ?? 0);
		}
		return undefined;
	}

	public setTag(row: number, col: number, tag: any) {
		const { segment, offset } = this.getSegment(row, col);
		if (segment && RunSegment.is(segment)) {
			segment.setTag(offset ?? 0, tag);
		} else if (tag !== undefined) {
			throw new Error(`Must not attempt to set tags on '${segment?.constructor.name}'.`);
		}
	}

	public insertRows(row: number, numRows: number) {
		const pos = rowColToPosition(row, 0);
		const size = maxCols * numRows;
		const segment = new PaddingSegment(size);

		this.client.insertSegmentLocal(pos, segment);
	}

	public removeRows(row: number, numRows: number) {
		const pos = rowColToPosition(row, 0);
		const size = maxCols * numRows;
		this.removeRange(pos, pos + size);
	}

	public insertCols(col: number, numCols: number) {
		this.moveAsPadding(maxCol - numCols, col, numCols);
	}

	public removeCols(col: number, numCols: number) {
		this.moveAsPadding(col, maxCol - numCols, numCols);
	}

	public annotatePosition(row: number, col: number, props: PropertySet) {
		const pos = rowColToPosition(row, col);
		this.annotateRange(pos, pos + 1, props);
	}

	public getPositionProperties(row: number, col: number) {
		const pos = rowColToPosition(row, col);
		return this.getPropertiesAtPosition(pos);
	}

	// For each row, moves 'numCols' items starting from 'srcCol' and inserts 'numCols' padding
	// at 'destCol'.  Used by insertCols and removeCols.
	private moveAsPadding(srcCol: number, destCol: number, numCols: number) {
		const removeColStart = srcCol;
		const removeColEnd = srcCol + numCols;

		for (let r = 0, rowStart = 0; r < this.numRows; r++, rowStart += maxCols) {
			this.client.removeRangeLocal(rowStart + removeColStart, rowStart + removeColEnd);
			const insertPos = rowStart + destCol;
			const segment = new PaddingSegment(numCols);
			this.client.insertSegmentLocal(insertPos, segment);
		}
	}

	private getSegment(row: number, col: number) {
		const pos = rowColToPosition(row, col);
		return this.getContainingSegment(pos);
	}
}

/**
 * @deprecated `SparseMatrixFactory` is an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrixFactory} instead.
 * @internal
 */
export class SparseMatrixFactory implements IChannelFactory<SparseMatrix> {
	public static Type = "https://graph.microsoft.com/types/mergeTree/sparse-matrix";

	public static Attributes: IChannelAttributes = {
		type: SparseMatrixFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public static segmentFromSpec(spec: IJSONSegment): ISegment {
		const maybePadding = PaddingSegment.fromJSONObject(spec);
		if (maybePadding) {
			return maybePadding;
		}

		const maybeRun = RunSegment.fromJSONObject(spec);
		if (maybeRun) {
			return maybeRun;
		}

		throw new Error(`Unrecognized IJSONObject: '${JSON.stringify(spec)}'`);
	}

	public get type() {
		return SparseMatrixFactory.Type;
	}

	public get attributes() {
		return SparseMatrixFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SparseMatrix> {
		const sharedObject = new SparseMatrixClass(runtime, id, attributes);
		await sharedObject.load(services);
		return sharedObject;
	}

	public create(document: IFluidDataStoreRuntime, id: string): SparseMatrix {
		const sharedObject = new SparseMatrixClass(document, id, this.attributes);
		sharedObject.initializeLocal();
		return sharedObject;
	}
}

/**
 * @deprecated `SparseMatrix` is an abandoned prototype.
 * Use {@link @fluidframework/matrix#SharedMatrix} instead.
 * @internal
 */
export const SparseMatrix = createSharedObjectKind(SparseMatrixFactory);
/**
 * {@inheritDoc (SparseMatrix:variable)}
 * @internal
 */
export type SparseMatrix = SparseMatrixClass;
