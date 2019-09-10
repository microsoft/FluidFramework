/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Client } from "./client";
import {
    ISegment,
    ReferencePosition,
    refGetRangeLabels,
    refGetTileLabels,
    refHasRangeLabel,
    refHasRangeLabels,
    refHasTileLabel,
    refHasTileLabels,
} from "./mergeTree";
import { ICombiningOp, ReferenceType } from "./ops";
import { addProperties, PropertySet } from "./properties";

export class LocalReference implements ReferencePosition {
    public static readonly DetachedPosition: number = -1;

    public properties: PropertySet;
    public pairedRef?: LocalReference;

    constructor(
        private readonly client: Client,
        public segment: ISegment,
        public offset = 0,
        public refType = ReferenceType.Simple) {
    }

    public min(b: LocalReference) {
        if (this.compare(b) < 0) {
            return this;
        } else {
            return b;
        }
    }

    public max(b: LocalReference) {
        if (this.compare(b) > 0) {
            return this;
        } else {
            return b;
        }
    }

    public compare(b: LocalReference) {
        if (this.segment === b.segment) {
            return this.offset - b.offset;
        } else {
            if (this.segment === undefined
                || (b.segment !== undefined &&
                    this.segment.ordinal < b.segment.ordinal)) {
                return -1;
            } else {
                return 1;
            }
        }
    }

    public toPosition() {
        if (this.segment && this.segment.parent) {
            return this.getOffset() + this.client.getPosition(this.segment);
        } else {
            return LocalReference.DetachedPosition;
        }
    }

    public hasTileLabels() {
        return refHasTileLabels(this);
    }

    public hasRangeLabels() {
        return refHasRangeLabels(this);
    }

    public hasTileLabel(label: string) {
        return refHasTileLabel(this, label);
    }

    public hasRangeLabel(label: string) {
        return refHasRangeLabel(this, label);
    }

    public getTileLabels() {
        return refGetTileLabels(this);
    }

    public getRangeLabels() {
        return refGetRangeLabels(this);
    }

    public isLeaf() {
        return false;
    }

    public addProperties(newProps: PropertySet, op?: ICombiningOp) {
        this.properties = addProperties(this.properties, newProps, op);
    }

    public getSegment() {
        return this.segment;
    }

    public getOffset() {
        if (this.segment.removedSeq) {
            return 0;
        }
        return this.offset;
    }

    public getProperties() {
        return this.properties;
    }
}
