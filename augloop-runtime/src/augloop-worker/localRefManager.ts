import { MergeTree } from "@prague/routerlicious/dist/client-api";
import { LocalReference } from "@prague/routerlicious/dist/merge-tree";
import { SharedString } from "@prague/routerlicious/dist/shared-string";

export class LocalRefManager {
    private beginRef: LocalReference;
    private endRef: LocalReference;
    private beginSegment: MergeTree.BaseSegment;
    private endSegment: MergeTree.BaseSegment;
    private segmentsCreated: boolean;
    constructor(
        private root: SharedString,
        private begin: number,
        private end: number) {
            this.segmentsCreated = false;
    }

    public prepare() {
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
            this.root.client.mergeTree.addLocalReference(this.beginRef);
            this.root.client.mergeTree.addLocalReference(this.endRef);
            this.segmentsCreated = true;
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
    public ready() {
        return this.segmentsCreated;
    }
}
