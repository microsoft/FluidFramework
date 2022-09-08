import { UsageError } from "@fluidframework/container-utils";
import { LocalClientId } from "./constants";
import { LocalReferenceCollection } from "./localReference";
import { IMergeTreeDeltaOpArgs } from "./mergeTreeDeltaCallback";
import { ISegment, SegmentGroup, MaxNodesInBlock, IRemovalInfo, IMergeNode, IMergeBlock } from "./mergeTreeNodes";
import { depthFirstNodeWalk } from "./mergeTreeNodeWalk";
import { TrackingGroupCollection } from "./mergeTreeTracking";
import { PropertySet } from "./properties";
import { SegmentGroupCollection } from "./segmentGroupCollection";

export class EndOfTreeSegment implements ISegment, IRemovalInfo {
    type: string = "EndOfTreeSegment";
    private readonly root: IMergeBlock;
    constructor(segmentOrNode: IMergeNode) {
        let maybeRoot: IMergeBlock | undefined = segmentOrNode.isLeaf()
            ? segmentOrNode.parent
            : segmentOrNode;
        while (maybeRoot?.parent !== undefined) {
            maybeRoot = maybeRoot.parent;
        }
        if (maybeRoot === undefined) {
            throw new UsageError("segmentOrNode must be in rooted tree");
        }
        this.root = maybeRoot;
    }
    /**
     * segments must be of at least length one, but
     * removed segments will have a calculated length
     * of undefined/0. we leverage this to create
     * a 0 length segment for the end of the tree
     */
    removedSeq: number = 0;
    removedClientIds: number[] = [LocalClientId];
    seq = 0;
    clientId = LocalClientId;
    cachedLength = 1;

    /**
     * this segment pretends to be a sibling of the last real segment.
     * so compute the necessary properties to pretend to be that segment.
     */
    private getSegmentProperties() {
        let lastSegment: ISegment | undefined;
        depthFirstNodeWalk(
            this.root,
            this.root.children[this.root.childCount - 1],
            undefined,
            (seg) => {
                lastSegment = seg;
                return false;
            },
            undefined,
            false,
        );
        const parent = lastSegment?.parent ?? this.root;
        const index = parent.childCount;
        return {
            parent,
            index,
        };
    }

    get parent() {
        return this.getSegmentProperties().parent;
    }

    get index() {
        return this.getSegmentProperties().index;
    }
    get ordinal() {
        // just compute and arbitrarily big ordinal
        return String.fromCharCode(0xFFFF).repeat(MaxNodesInBlock);
    }
    isLeaf(): this is ISegment {
        return true;
    }
    localRefs?: LocalReferenceCollection | undefined;

    get segmentGroups(): SegmentGroupCollection {
        throw new Error("Method not implemented.");
    }
    get trackingCollection(): TrackingGroupCollection {
        throw new Error("Method not implemented.");
    }
    addProperties(): PropertySet | undefined {
        throw new Error("Method not implemented.");
    }
    clone(): ISegment {
        throw new Error("Method not implemented.");
    }
    canAppend(segment: ISegment): boolean {
        return false;
    }
    append(segment: ISegment): void {
        throw new Error("Method not implemented.");
    }
    splitAt(pos: number): ISegment | undefined {
        throw new Error("Method not implemented.");
    }
    toJSONObject() {
        throw new Error("Method not implemented.");
    }
    ack(segmentGroup: SegmentGroup, opArgs: IMergeTreeDeltaOpArgs): boolean {
        throw new Error("Method not implemented.");
    }
}
