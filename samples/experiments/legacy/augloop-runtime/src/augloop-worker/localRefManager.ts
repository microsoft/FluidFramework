/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MergeTree } from "@prague/routerlicious/dist/client-api";
import { LocalReference } from "@prague/routerlicious/dist/merge-tree";
import { SharedString } from "@prague/routerlicious/dist/shared-string";

export class LocalRefManager {
    private beginRef: LocalReference;
    private endRef: LocalReference;
    private beginSegment: MergeTree.BaseSegment;
    private endSegment: MergeTree.BaseSegment;
    constructor(
        private root: SharedString,
        private begin: number,
        private end: number) {
    }

    public prepare(): boolean {
        const bSegment = this.root.client.mergeTree.getContainingSegment(
            this.begin,
            MergeTree.UniversalSequenceNumber,
            this.root.client.getClientId(),
        );
        const eSegment = this.root.client.mergeTree.getContainingSegment(
            this.end,
            MergeTree.UniversalSequenceNumber,
            this.root.client.getClientId(),
        );
        if (bSegment && eSegment) {
            this.beginSegment = bSegment.segment as MergeTree.BaseSegment;
            this.endSegment = eSegment.segment as MergeTree.BaseSegment;
            this.beginRef = new LocalReference(this.beginSegment, bSegment.offset);
            this.endRef = new LocalReference(this.endSegment, eSegment.offset);
            if (this.beginRef.segment && this.endRef.segment) {
                this.root.client.mergeTree.addLocalReference(this.beginRef);
                this.root.client.mergeTree.addLocalReference(this.endRef);
                return true;
            } else {
                return false;
            }

        } else {
            return false;
        }

    }
    public getBeginRef() {
        return this.beginRef;
    }
    public getEndRef() {
        return this.endRef;
    }
    public removeReferences() {
        this.root.client.mergeTree.removeLocalReference(this.beginSegment, this.beginRef);
        this.root.client.mergeTree.removeLocalReference(this.endSegment, this.endRef);
    }
}
