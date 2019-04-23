import * as assert from "assert";
import {
    CollaborationWindow,
    ISegment,
    UnassignedSequenceNumber,
} from "./mergeTree";
import { ICombiningOp, IMergeTreeAnnotateMsg } from "./ops";
import * as Properties from "./properties";

export class SegmentPropertiesManager {

    private pendingKeyUpdateCount: Properties.MapLike<number>;
    private pendingRewriteCount: number;

    constructor(private readonly segment: ISegment) {
    }

    public ackPendingProperties(annotateOp: IMergeTreeAnnotateMsg) {
        if (annotateOp.combiningOp && annotateOp.combiningOp.name === "rewrite") {
            this.pendingRewriteCount--;
        }
        for (const key of Object.keys(annotateOp.props)) {
            if (this.pendingKeyUpdateCount[key] !== undefined) {
                assert(this.pendingKeyUpdateCount[key] > 0);
                this.pendingKeyUpdateCount[key]--;
                if (this.pendingKeyUpdateCount[key] === 0) {
                    // tslint:disable-next-line: no-dynamic-delete
                    delete this.pendingKeyUpdateCount[key];
                }
            }
        }
    }

    public addProperties(
        newProps: Properties.PropertySet,
        op?: ICombiningOp,
        seq?: number,
        collabWindow?: CollaborationWindow): Properties.PropertySet {

        if (!this.segment.properties) {
            this.pendingRewriteCount = 0;
            this.segment.properties = Properties.createMap<any>();
            this.pendingKeyUpdateCount = Properties.createMap<number>();
        }

        const collaborating =  collabWindow && collabWindow.collaborating;

        // there are outstanding local rewrites, so block all non-local changes
        if (this.pendingRewriteCount > 0 && seq !== UnassignedSequenceNumber && collaborating) {
            return undefined;
        }

        const rewrite = (op && op.name === "rewrite");
        const combiningOp = !rewrite ? op ? op : undefined : undefined;

        const shouldModifyKey = (key: string): boolean => {
            if (seq === UnassignedSequenceNumber
                || this.pendingKeyUpdateCount[key] === undefined
                || combiningOp) {
                return true;
            }
            return false;
        };

        const deltas: Properties.PropertySet = {};
        if (rewrite) {
            if (collaborating && seq === UnassignedSequenceNumber) {
                this.pendingRewriteCount++;
            }
            // we are re-writting so delete all the properties
            // not in the new props
            for (const key of  Object.keys(this.segment.properties)) {
                if (!newProps[key] && shouldModifyKey(key)) {
                    deltas[key] = this.segment.properties[key];
                    // tslint:disable-next-line: no-dynamic-delete
                    delete this.segment.properties[key];
                }
            }
        }

        for (const key of  Object.keys(newProps)) {
            if (collaborating) {
                if (seq === UnassignedSequenceNumber) {
                    if (this.pendingKeyUpdateCount[key] === undefined) {
                        this.pendingKeyUpdateCount[key] = 0;
                    }
                    this.pendingKeyUpdateCount[key]++;
                } else if (!shouldModifyKey(key)) {
                    continue;
                }
            }

            const previousValue: any = this.segment.properties[key];
            // the delta should be null if undefined, as thats how we encode delete
            deltas[key] = (previousValue === undefined) ? null : previousValue;
            let newValue: any;
            if (combiningOp) {
                newValue = Properties.combine(op, previousValue, newValue, seq);
            } else {
                newValue = newProps[key];
            }
            if (newValue === null) {
                // tslint:disable-next-line: no-dynamic-delete
                delete this.segment.properties[key];

            } else {
                this.segment.properties[key] = newValue;
            }
        }

        return deltas;
    }

    public copyTo(leafSegment: ISegment) {
        if (this.segment.properties) {
            leafSegment.properties = Properties.createMap<any>();
            for (const key of Object.keys(this.segment.properties)) {
                leafSegment.properties[key] = this.segment.properties[key];
            }
            if (this.segment.propertyManager) {
                leafSegment.propertyManager = new SegmentPropertiesManager(leafSegment);
                leafSegment.propertyManager.pendingRewriteCount = this.pendingRewriteCount;
                leafSegment.propertyManager.pendingKeyUpdateCount = Properties.createMap<number>();
                for (const key of Object.keys(this.pendingKeyUpdateCount)) {
                    leafSegment.propertyManager.pendingKeyUpdateCount[key] = this.pendingKeyUpdateCount[key];
                }
            }
        }
    }
}
