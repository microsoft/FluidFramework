import { assert } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";
import { LocalClientId } from "./constants";
import { LocalReferenceCollection } from "./localReference";
import { ISegment, IRemovalInfo, IMergeNode, IMergeBlock } from "./mergeTreeNodes";
import { depthFirstNodeWalk, NodeAction } from "./mergeTreeNodeWalk";

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
    /*
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
    isLeaf(): this is ISegment {
        return true;
    }

    /**
     * the current supported usage uses the local refs to
     * store detached references
     */
    localRefs?: LocalReferenceCollection;

    /**
     * this segment pretends to be a sibling of the last real segment.
     * so compute the necessary properties to pretend to be that segment.
     */
    private getEndSegProps() {
        let lastSegment: ISegment | undefined;
        let depth = 1;
        depthFirstNodeWalk(
            this.root,
            this.root.children[this.root.childCount - 1],
            (node) => {
                depth++;
                if (node?.isLeaf()) {
                    lastSegment = node;
                    return NodeAction.Exit;
                }
             },
            undefined,
            undefined,
            false,
        );
        const parent = lastSegment?.parent ?? this.root;
        const index = parent.childCount;
        return {
            parent,
            index,
            depth,
        };
    }

    get parent() {
        return this.getEndSegProps().parent;
    }

    get index() {
        return this.getEndSegProps().index;
    }
    get ordinal() {
        // just compute an arbitrarily big ordinal
        // we base it on the depth of the tree
        // to ensure it is bigger than all ordinals in
        // the tree, as each layer appends to the previous
        return String.fromCharCode(0xFFFF).repeat(
            this.getEndSegProps().depth);
    }

    /*
     * since this segment isn't real, throw on any segment
     * operation that isn't expected
     */
    get segmentGroups() {
        return notSupported();
    }
    get trackingCollection() {
        return notSupported();
    }
    addProperties = notSupported;
    clone = notSupported;
    canAppend = notSupported;
    append = notSupported;
    splitAt = notSupported;
    toJSONObject = notSupported;
    ack = notSupported;
}
const notSupported = () => { assert(false, "operation not supported"); };
