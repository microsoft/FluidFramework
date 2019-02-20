import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import * as mergeTree from "@prague/merge-tree";
import * as sequence from "@prague/sequence";
import { EventEmitter } from "events";

/**
 * Shared string for word
 *
 * Get rid of this wrapper soon. It mostly wraps bugs in Prague which could have been fixed already
 * or provides some default arguments which either should be removed or should be moved to Prague API.
 */
export class SharedStringForWord extends EventEmitter {
    private sharedString: sequence.SharedString;
    private opList = [];
    private isInGroup: boolean;

    /**
     * Creates an instance of shared string for word.
     * @param sharedStringIn
     */
    public constructor(
        sharedStringIn: sequence.SharedString) {
        super();
        this.sharedString = sharedStringIn;

        try {
            console.log("Registering op event");
            this.sharedString.on("op", (msg, local) => {
                console.log("New op of type : %s", msg.contents.type);
                this.tardisOp(msg);
                this.emit("op", msg, local);
            });
        } catch (e) {
            console.log(e);
        }
    }

    /**
     * Annotates range
     * @param pos1
     * @param pos2
     * @param props
     */
    public annotateRange(pos1: number, pos2: number, props: mergeTree.PropertySet) {
        console.log("AnnotateRange [%s, %s)", pos1, pos2);

        if (!this.isInGroup) {
            this.sharedString.annotateRange(props, pos1, pos2);
        } else if (!this.sharedString.isLocal()) {

            const annotateMessage: mergeTree.IMergeTreeAnnotateMsg = {
                pos1,
                pos2,
                props,
                type: mergeTree.MergeTreeDeltaType.ANNOTATE,
            };

            this.opList.push(annotateMessage);
        }

        setImmediate(() => { return; });
    }

    /**
     * Gets text
     * @returns
     */
    public getText() {
        return this.sharedString.client.getText();
    }
    /**
     * Attachs shared string for word
     */
    public attach() {
        this.sharedString.attach();
    }
    /**
     * Gets current seq
     * @returns
     */
    public getCurrentSeq() {
        return this.sharedString.client.getCurrentSeq();
    }

    /**
     * Gets length
     * @returns
     */
    public getLength() {
        return this.sharedString.client.getLength();
    }

    /**
     * Gets marker segment at position
     * @param position
     * @returns
     */
    public getMarkerSegmentAtPosition(position: number) {
        const segOff = this.sharedString.client.mergeTree.getContainingSegment(position,
            this.getCurrentSeq(), mergeTree.LocalClientId);
        if (segOff.segment.getType() === mergeTree.SegmentType.Marker) {
            return segOff.segment;
        }
    }

    /**
     * Inserts text
     * @param text
     * @param position
     * @param [props]
     */
    public insertText(text: string, position: number, props?: mergeTree.PropertySet) {
        console.log("insert Text at %s", position);
        try {

            if (!this.isInGroup) {
                this.sharedString.insertText(text, position, props);
            } else if (!this.sharedString.isLocal()) {

                const insertMessage: mergeTree.IMergeTreeInsertMsg = {
                    pos1: position,
                    props,
                    text,
                    type: mergeTree.MergeTreeDeltaType.INSERT,
                };
                this.opList.push(insertMessage);
            }

            setImmediate(() => { return; });
        } catch (e) {
            console.log(e);
        }
    }

    /**
     * Finds tile
     * @param position
     * @param label
     * @param fPreceding
     * @returns
     */
    public findTile(position: number, label: string, fPreceding: boolean) {
        return this.sharedString.client.mergeTree.findTile(position,
            this.sharedString.client.getClientId(),
            label,
            fPreceding);
    }

    /**
     * Starts group
     */
    public startGroup() {
        this.isInGroup = true;
    }

    /**
     * Ends group
     */
    public endGroup() {
        if (!this.isInGroup) {
            return;
        }

        this.isInGroup = false;

        if (this.opList.length === 0) {
            return;
        }

        const groupOp = {
            ops: this.opList,
            type: mergeTree.MergeTreeDeltaType.GROUP,
        } as mergeTree.IMergeTreeGroupMsg;

        this.sharedString.groupOperation(groupOp);
        this.opList = [];
    }

    /**
     * Inserts text before marker
     * @param text
     * @param markerId
     * @param offsetFromMarker
     * @param [props]
     */
    public insertTextBeforeMarker(
        text: string,
        markerId: string,
        offsetFromMarker: number,
        props?: mergeTree.PropertySet) {
        console.log("Insert Text Before Marker");
        const relPos = {
            before: true,
            id: markerId,
            offset: offsetFromMarker,
        } as mergeTree.IRelativePosition;

        if (!this.isInGroup) {
            this.sharedString.insertTextRelative(relPos, text, props);
        } else if (!this.sharedString.isLocal()) {

            const insertMessage: mergeTree.IMergeTreeInsertMsg = {
                props,
                relativePos1: relPos,
                text,
                type: mergeTree.MergeTreeDeltaType.INSERT,
            };
            this.opList.push(insertMessage);
        }
    }

    /**
     * Inserts tile marker
     * @param pos1
     * @param label
     * @param markerId
     * @param [propsIn]
     */
    public insertTileMarker(pos1: number, label: string, markerId: string, propsIn?: mergeTree.PropertySet) {
        console.log("insert Tile Marker at %s with label %s", pos1, label);
        const props = propsIn;
        props[mergeTree.reservedTileLabelsKey] = [label];
        props[mergeTree.reservedMarkerIdKey] = markerId;

        if (!this.isInGroup) {
            this.sharedString.insertMarker(pos1, mergeTree.ReferenceType.Tile, props);
        } else if (!this.sharedString.isLocal()) {

            const insertMessage: mergeTree.IMergeTreeInsertMsg = {
                marker: { refType: mergeTree.ReferenceType.Tile },
                pos1,
                props,
                type: mergeTree.MergeTreeDeltaType.INSERT,
            };
            this.opList.push(insertMessage);
        }

        setImmediate(() => { return; });
    }

    /**
     * Inserts range begin marker
     * @param pos1
     * @param rangeMarker
     * @param markerId
     */
    public insertRangeBeginMarker(pos1: number, rangeMarker: string, markerId: string) {

        if (!this.isInGroup) {
            this.sharedString.insertMarker(pos1, mergeTree.ReferenceType.RangeBegin,
                {
                    [mergeTree.reservedRangeLabelsKey]: [rangeMarker],
                    [mergeTree.reservedMarkerIdKey]: markerId,
                });
        } else if (!this.sharedString.isLocal()) {

            const insertMessage: mergeTree.IMergeTreeInsertMsg = {
                marker: { refType: mergeTree.ReferenceType.RangeBegin },
                pos1,
                props: {
                    [mergeTree.reservedRangeLabelsKey]: [rangeMarker],
                    [mergeTree.reservedMarkerIdKey]: markerId,
                },
                type: mergeTree.MergeTreeDeltaType.INSERT,
            };
            this.opList.push(insertMessage);
        }

        setImmediate(() => { return; });
    }

    /**
     * Inserts range end marker
     * @param pos1
     * @param rangeMarker
     * @param markerId
     */
    public insertRangeEndMarker(pos1: number, rangeMarker: string, markerId: string) {

        if (!this.isInGroup) {
            this.sharedString.insertMarker(pos1, mergeTree.ReferenceType.RangeEnd,
                {
                    [mergeTree.reservedRangeLabelsKey]: [rangeMarker],
                    [mergeTree.reservedMarkerIdKey]: "end-" + markerId,
                });
        } else if (!this.sharedString.isLocal()) {
            const insertMessage: mergeTree.IMergeTreeInsertMsg = {
                marker: { refType: mergeTree.ReferenceType.RangeBegin },
                pos1,
                props: {
                    [mergeTree.reservedRangeLabelsKey]: [rangeMarker],
                    [mergeTree.reservedMarkerIdKey]: "end-" + markerId,
                },
                type: mergeTree.MergeTreeDeltaType.INSERT,
            };
            this.opList.push(insertMessage);
        }

        setImmediate(() => { return; });
    }

    /**
     * Gets interval collections
     * @returns interval collections
     */
    public getIntervalCollections(): ISharedMap {
        return this.sharedString.getIntervalCollections();
    }

    /**
     * Gets shared interval collection
     *
     * TODO: fix race condition on creation by putting type on every operation
     *
     * @param label
     * @returns
     */
    public getSharedIntervalCollection(label: string) {
        return this.sharedString.getSharedIntervalCollection(label);
    }

    /**
     * Gets shared interval collection view
     * @param collection
     * @param OnSharedIntervalCollectionViewCallback
     * @param [label]
     */
    public async getSharedIntervalCollectionView(
        collection: any,
        OnSharedIntervalCollectionViewCallback: (...args: any[]) => any,
        label?: string) {

        // Table model #1 has been archived on C++ side. Let's do the same for JS as well.
        // Commenting out instead of removing, so we can use this code as a reference.
        /*
        if (label === "TableIntervals") {
            const rowGuid = "{3A017221-A2A5-47DF-9937-4AB32059D789}";
            const colGuid = "{A115C672-1001-4A22-B21A-799F56A1A803}";
            const cellGuid = "{8E84740B-1A19-4FFC-9C25-9E9814818072}";
            const key = "value";
            const onPrepareDeserialize: sequence.PrepareDeserializeCallback = (properties) => {
                if (properties && properties[rowGuid] && properties[colGuid]) {
                    const rowProp = properties[rowGuid];
                    const colProp = properties[colGuid];
                    const p1 = this.document.get(rowProp[key]);
                    const p2 = this.document.get(colProp[key]);
                    if (properties[cellGuid]) {
                        const cellProp = properties[cellGuid];
                        const p3 = this.document.get(cellProp[key]);
                        return Promise.all([p1, p2, p3]);
                    } else {
                        return Promise.all([p1, p2]);
                    }
                } else {
                    return Promise.resolve(null);
                }
            };
            const onDeserialize: sequence.DeserializeCallback = (interval, obj: any) => {
                if (interval.properties && interval.properties[rowGuid] && interval.properties[colGuid]) {
                    interval.properties[rowGuid] = obj[0];
                    interval.properties[colGuid] = obj[1];
                    if (interval.properties[cellGuid]) {
                        interval.properties[cellGuid] = obj[2];
                    }
                }
                return true;
            };
            const view = await collection.getView(onDeserialize, onPrepareDeserialize);
            OnSharedIntervalCollectionViewCallback(collection, view);
        }
        */
    }

    /**
     * Iterate the segments of the mergeTree
     * @param callbackForIteratingSegments
     */
    public iterate(callbackForIteratingSegments: (...args: any[]) => any) {
        try {
            const segmentWindow = this.sharedString.client.mergeTree.getCollabWindow();
            const notifyWord = (
                segment: mergeTree.ISegment,
                pos: number,
                refSeq: number,
                clientId: number,
                segStart: number,
                segEnd: number) => {
                if (segment.getType() === mergeTree.SegmentType.Text) {
                    const textSegment = segment as mergeTree.TextSegment;
                    callbackForIteratingSegments(1, textSegment, pos, refSeq,
                        this.sharedString.client.getLongClientId(clientId), segStart, segEnd);
                } else if (segment.getType() === mergeTree.SegmentType.Marker) {
                    const markerSegment = segment as mergeTree.Marker;
                    callbackForIteratingSegments(2, markerSegment, pos, refSeq,
                        this.sharedString.client.getLongClientId(clientId), segStart, segEnd);
                }
                return true;
            };

            console.log(`sharedString.client.getLength(): ${this.sharedString.client.getLength()}`);
            if (this.sharedString.client.getLength() !== 0) {
                console.log("Iterating sharedString");
                this.sharedString.client.mergeTree.mapRange({ leaf: notifyWord },
                    segmentWindow.currentSeq, segmentWindow.clientId, undefined);
            }
        } catch (e) {
            console.log(e);
        }
    }

    /**
     * Promise gets fullfilled once the string is fully loaded
     * @returns promise
     */
    public loaded(): Promise<void> {
        return this.sharedString.loaded;
    }

    /**
     * On shared string for word
     * @param event
     * @param listener
     * @returns on
     */
    public on(event: "op", listener: (op: ISequencedDocumentMessage, local: boolean) => void): this;

    /**
     * On shared string for word
     * @param event
     * @param listener
     * @returns on
     */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public removeText(pos1: number, pos2: number) {
        console.log("Remove Text [%s, %s)", pos1, pos2);

        if (!this.isInGroup) {
            this.sharedString.removeText(pos1, pos2);
        } else if (!this.sharedString.isLocal()) {

            const removeMessage: mergeTree.IMergeTreeRemoveMsg = {
                pos1,
                pos2,
                type: mergeTree.MergeTreeDeltaType.REMOVE,
            };
            this.opList.push(removeMessage);
        }

        setImmediate(() => { return; });
    }

    /**
     * Tardis position local
     * @param pos
     * @param fromSeq
     * @param fromClientId
     * @returns
     */
    public tardisPositionLocal(pos: number, fromSeq: number, fromClientId: string) {
        return this.sharedString.client.mergeTree.tardisPositionFromClient(pos, fromSeq, -1,
            this.sharedString.client.getShortClientId(fromClientId),
            this.sharedString.client.mergeTree.getCollabWindow().clientId);
    }

    /**
     * Tardis a group op msg and do in-place updates if a sub-op, when tardised, gets broken
     * down into multiple segments. Adds those broken segments as individual sub op in that group.
     * @param msg
     */
    public tardisGroupOp(msg: any) {
        let index = 0;
        for (index = 0; index < msg.contents.ops.length;) {
            const countOfOpsProcessed = this.tardisSingleOp(msg, msg.contents.ops[index], index);
            index += countOfOpsProcessed; // As they are already added in-place in msg op.
        }
    }

    /**
     * Tardis a single op and update it in-place by adding sub-ops
     * in a group op (will make it a group if it is not one already)
     * if tardis of that op produces more segment changes.
     *
     * @param msg (input/output) Original op msg
     * @param op specific op in that opmsg which is getting tardised here
     * @param opIndex Index of that specific op in op msg
     * @returns the count of ranges that should be considered processed after tardising that single Op
     */
    public tardisSingleOp(msg: any, op: any, opIndex: number) {
        const fromSeq = msg.referenceSequenceNumber;
        const fromClientId = msg.clientId;
        let countOfRangesAfterTardisingOp = 1;
        switch (op.type) {
            case 0 /*INSERT */: // currently this is being handled on cpp side
                break;
            case 1 /*REMOVE */:
            case 2 /*ANNOTATE */:
                const tardisedRanges = this.sharedString.client.mergeTree.tardisRangeFromClient(op.pos1,
                    op.pos2,
                    fromSeq,
                    -1 /*toSeqNumber*/,
                    this.sharedString.client.getShortClientId(fromClientId),
                    this.sharedString.client.mergeTree.getCollabWindow().clientId);

                countOfRangesAfterTardisingOp = tardisedRanges.length;

                // Tardis resulted in multiple ranges
                if (countOfRangesAfterTardisingOp > 1) {
                    const opsToInsert = [];
                    let cAdjust = 0;
                    for (const range of tardisedRanges) {
                        // If it was delete op, adjust the further tardised ranges based on
                        // what has been already marked deleted as they will be used
                        // sequentially by client
                        if (op.type === 1) {
                            range.start -= cAdjust;
                            range.end -= cAdjust;
                            cAdjust += (range.end - range.start);
                        }
                        const opClone = JSON.parse(JSON.stringify(op));
                        opClone.pos1 = range.start;
                        opClone.pos2 = range.end;
                        opsToInsert.push(opClone);
                    }
                    let cRemove = 1;
                    // If ops array is not there, let's create one.
                    if (typeof msg.contents.ops === "undefined") {
                        msg.contents.ops = [];
                        opIndex = 0;
                        cRemove = 0; // Nothing to remove if just created ops
                    }
                    // Remove the existing op (which now has been tardised)
                    // and put the newly created op array from tardised ranges
                    // here.
                    msg.contents.ops.splice(opIndex, cRemove, ...opsToInsert);
                    msg.contents.type = 3; // Make msg a group op now
                } else if (countOfRangesAfterTardisingOp === 1) {
                    op.pos1 = tardisedRanges[0].start;
                    op.pos2 = tardisedRanges[0].end;
                } else if (countOfRangesAfterTardisingOp === 0) {
                    msg.contents.ops.splice(opIndex, 1 /*remove that op*/);
                }
                break;
        }
        return countOfRangesAfterTardisingOp;
    }

    /**
     * Tardis op
     *
     * Tardis an and update it in-place by adding sub-ops in
     * the group op (will make it a group if it is not one already)
     * if tardis produces more segment changes.
     * @param msg
     */
    public tardisOp(msg: any) {
        if (msg.contents.type === 3) {
            this.tardisGroupOp(msg);
        } else {
            this.tardisSingleOp(msg, msg.contents, -1 /*index*/);
        }

    }
}
