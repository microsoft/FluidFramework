/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Stack } from "./collections";
import { ISegment } from "./mergeTree";
import { ReferenceType, ICombiningOp } from "./ops";
import { PropertySet, MapLike } from "./properties";

export const reservedTileLabelsKey = "referenceTileLabels";
export const reservedRangeLabelsKey = "referenceRangeLabels";

export function refTypeIncludesFlag(refPosOrType: ReferencePosition | ReferenceType, flags: ReferenceType): boolean {
    const refType = typeof refPosOrType === "number" ? refPosOrType : refPosOrType.refType;
    // eslint-disable-next-line no-bitwise
    return (refType & flags) !== 0;
}

export const refGetTileLabels = (refPos: ReferencePosition): string[] | undefined =>
    refTypeIncludesFlag(refPos, ReferenceType.Tile)
        && refPos.properties ? refPos.properties[reservedTileLabelsKey] as string[] : undefined;

export const refGetRangeLabels = (refPos: ReferencePosition): string[] | undefined =>
    // eslint-disable-next-line no-bitwise
    (refTypeIncludesFlag(refPos, ReferenceType.NestBegin | ReferenceType.NestEnd))
        && refPos.properties ? refPos.properties[reservedRangeLabelsKey] as string[] : undefined;

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

export interface ReferencePosition {
    properties?: PropertySet;
    refType: ReferenceType;

    getSegment(): ISegment | undefined;
    getOffset(): number;
    addProperties(newProps: PropertySet, op?: ICombiningOp): void;
    isLeaf(): boolean;

    /**
     * @deprecated - use refHasTileLabels
     */
    hasTileLabels(): boolean;
    /**
     * @deprecated - use refHasRangeLabels
     */
    hasRangeLabels(): boolean;
    /**
     * @deprecated - use refHasTileLabel
     */
    hasTileLabel(label: string): boolean;
    /**
     * @deprecated - use refHasRangeLabel
     */
    hasRangeLabel(label: string): boolean;
    /**
     * @deprecated - use refGetTileLabels
     */
    getTileLabels(): string[] | undefined;
    /**
     * @deprecated - use refGetRangeLabels
     */
    getRangeLabels(): string[] | undefined;
}

export type RangeStackMap = MapLike<Stack<ReferencePosition>>;
export const DetachedReferencePosition = -1;

export function minReferencePosition<T extends ReferencePosition>(a: T, b: T): T {
    if (compareReferencePositions(a, b) < 0) {
        return a;
    } else {
        return b;
    }
}

export function maxReferencePosition<T extends ReferencePosition>(a: T, b: T): T {
    if (compareReferencePositions(a, b) > 0) {
        return a;
    } else {
        return b;
    }
}

export function compareReferencePositions(a: ReferencePosition, b: ReferencePosition): number {
    const aSeg = a.getSegment();
    const bSeg = b.getSegment();
    if (aSeg === bSeg) {
        return a.getOffset() - b.getOffset();
    } else {
        if (aSeg === undefined
            || (bSeg !== undefined &&
                aSeg.ordinal < bSeg.ordinal)) {
            return -1;
        } else {
            return 1;
        }
    }
}
