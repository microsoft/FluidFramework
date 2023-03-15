/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Stack } from "./collections";
import { ISegment } from "./mergeTreeNodes";
import { ReferenceType, ICombiningOp } from "./ops";
import { PropertySet, MapLike } from "./properties";

export const reservedTileLabelsKey = "referenceTileLabels";
export const reservedRangeLabelsKey = "referenceRangeLabels";

export function refTypeIncludesFlag(
	refPosOrType: ReferencePosition | ReferenceType,
	flags: ReferenceType,
): boolean {
	const refType = typeof refPosOrType === "number" ? refPosOrType : refPosOrType.refType;
	// eslint-disable-next-line no-bitwise
	return (refType & flags) !== 0;
}

export const refGetTileLabels = (refPos: ReferencePosition): string[] | undefined =>
	refTypeIncludesFlag(refPos, ReferenceType.Tile) && refPos.properties
		? (refPos.properties[reservedTileLabelsKey] as string[])
		: undefined;

export const refGetRangeLabels = (refPos: ReferencePosition): string[] | undefined =>
	// eslint-disable-next-line no-bitwise
	refTypeIncludesFlag(refPos, ReferenceType.NestBegin | ReferenceType.NestEnd) &&
	refPos.properties
		? (refPos.properties[reservedRangeLabelsKey] as string[])
		: undefined;

export function refHasTileLabel(refPos: ReferencePosition, label: string): boolean {
	const tileLabels = refGetTileLabels(refPos);
	if (tileLabels) {
		for (const refLabel of tileLabels) {
			if (label === refLabel) {
				return true;
			}
		}
	}
	return false;
}

export function refHasRangeLabel(refPos: ReferencePosition, label: string): boolean {
	const rangeLabels = refGetRangeLabels(refPos);
	if (rangeLabels) {
		for (const refLabel of rangeLabels) {
			if (label === refLabel) {
				return true;
			}
		}
	}
	return false;
}
export function refHasTileLabels(refPos: ReferencePosition): boolean {
	return refGetTileLabels(refPos) !== undefined;
}
export function refHasRangeLabels(refPos: ReferencePosition): boolean {
	return refGetRangeLabels(refPos) !== undefined;
}

/**
 * Represents a reference to a place within a merge tree. This place conceptually remains stable over time
 * by referring to a particular segment and offset within that segment.
 * Thus, this reference's character position changes as the tree is edited.
 */
export interface ReferencePosition {
	/**
	 * @returns - Properties associated with this reference
	 */
	properties?: PropertySet;
	refType: ReferenceType;

	/**
	 * Gets the segment that this reference position is semantically associated with. Returns undefined iff the
	 * reference became detached from the string.
	 */
	getSegment(): ISegment | undefined;

	/**
	 * Gets the offset for this reference position within its associated segment.
	 * @example
	 * If a merge-tree has 3 leaf segments ["hello", " ", "world"] and a ReferencePosition refers to the "l"
	 * in "world", that reference's offset would be 3 as "l" is the character at index 3 within "world".
	 */
	getOffset(): number;

	/**
	 * @param newProps - Properties to add to this reference.
	 * @param op - Combining semantics for changed properties. By default, property changes are last-write-wins.
	 * @remarks - Note that merge-tree does not broadcast changes to other clients. It is up to the consumer
	 * to ensure broadcast happens if that is desired.
	 */
	addProperties(newProps: PropertySet, op?: ICombiningOp): void;
	isLeaf(): this is ISegment;
}

export type RangeStackMap = MapLike<Stack<ReferencePosition>>;

export const DetachedReferencePosition = -1;

export function minReferencePosition<T extends ReferencePosition>(a: T, b: T): T {
	return compareReferencePositions(a, b) < 0 ? a : b;
}

export function maxReferencePosition<T extends ReferencePosition>(a: T, b: T): T {
	return compareReferencePositions(a, b) > 0 ? a : b;
}

export function compareReferencePositions(a: ReferencePosition, b: ReferencePosition): number {
	const aSeg = a.getSegment();
	const bSeg = b.getSegment();
	if (aSeg === bSeg) {
		return a.getOffset() - b.getOffset();
	} else {
		return aSeg === undefined || (bSeg !== undefined && aSeg.ordinal < bSeg.ordinal) ? -1 : 1;
	}
}
