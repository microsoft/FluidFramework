import * as api from "@prague/client-api";
import { IMap, IMapView } from "@prague/map";
import * as mergeTree from "@prague/merge-tree";
import { ISequencedObjectMessage , IUser } from "@prague/runtime-definitions";
import * as sharedString from "@prague/shared-string";
import * as socketStorage from "@prague/socket-storage";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";

export interface IRemotePresenceInfo {
    origPos: number;
    refseq: number;
    displayName?: string;
    clientId?: number;
}

// Get rid of this wrapper soon. It mostly wraps bugs in Prague which could have been fixed already
// or provides some default arguments which either should be removed or should be moved to Prague API.
export class SharedStringForWord extends EventEmitter {
    private sharedString: sharedString.SharedString;

    public constructor(
        sharedStringIn: sharedString.SharedString,
        private document: api.Document) {
        super();
        this.sharedString = sharedStringIn;
    }

    public annotateRange(pos1: number, pos2: number, props: mergeTree.PropertySet) {
        console.log("AnnotateRange [%s, %s)", pos1, pos2);
        this.sharedString.annotateRange(props, pos1, pos2);
        setImmediate(() => { return; });
    }

    public getText() {
        return this.sharedString.client.getText();
    }
    public attach() {
        this.sharedString.attach();
    }
    public getCurrentSeq() {
        return this.sharedString.client.getCurrentSeq();
    }

    public getLength() {
        return this.sharedString.client.getLength();
    }

    public getMarkerSegmentAtPosition(position: number) {
        const segOff = this.sharedString.client.mergeTree.getContainingSegment(position,
             this.getCurrentSeq(), mergeTree.LocalClientId);
        if (segOff.segment.getType() === mergeTree.SegmentType.Marker) {
            return segOff.segment;
        }
    }

    public insertText(text: string, position: number, props?: mergeTree.PropertySet) {
        console.log("insert Text at %s", position);
        try {
            this.sharedString.insertText(text, position, props);
            setImmediate(() => { return; });
        } catch (e) {
            console.log(e);
        }
    }

    public findTile(position: number, label: string, fPreceding: boolean) {
        return this.sharedString.client.mergeTree.findTile(position,
                                                            this.sharedString.client.getClientId(),
                                                            label,
                                                            fPreceding);
   }

    public insertTextBeforeMarker(text: string, markerId: string, offsetFromMarker: number,
                                  props?: mergeTree.PropertySet) {
        console.log("Insert Text Before Marker");
        const relPos = {
            before: true,
            id: markerId,
            offset: offsetFromMarker,
        } as mergeTree.IRelativePosition;
        this.sharedString.insertTextRelative(relPos, text, props);
    }

    public insertTileMarker(pos1: number, label: string, markerId: string, propsIn?: mergeTree.PropertySet) {
        console.log("insert Tile Marker at %s with label %s", pos1, label);
        const props = propsIn;
        props[mergeTree.reservedTileLabelsKey] = [label];
        props[mergeTree.reservedMarkerIdKey] = markerId;
        this.sharedString.insertMarker(pos1, mergeTree.ReferenceType.Tile, props);
        setImmediate(() => { return; });
    }
    public insertRangeBeginMarker(pos1: number, rangeMarker: string, markerId: string) {
        this.sharedString.insertMarker(pos1, mergeTree.ReferenceType.RangeBegin,
            { [mergeTree.reservedRangeLabelsKey]: [rangeMarker],
            [mergeTree.reservedMarkerIdKey]: markerId });
        setImmediate(() => { return; });
    }
    public insertRangeEndMarker(pos1: number, rangeMarker: string, markerId: string) {
        this.sharedString.insertMarker(pos1, mergeTree.ReferenceType.RangeEnd,
            { [mergeTree.reservedRangeLabelsKey]: [rangeMarker],
            [mergeTree.reservedMarkerIdKey]: "end-" + markerId });
        setImmediate(() => { return; });
    }

    public getIntervalCollections(): IMapView {
        return this.sharedString.getIntervalCollections();
    }

    public async getSharedStringFromGuid(guid: string,
                                         OnSharedStringFromGuidAvailable: (guid: string,
                                                                           sharedStringFromGuid: any) => void) {
        try {
            console.log("get Shared String %s", guid);
            const sharedStringFromGuid = await this.document.get(guid);
            console.log("got Shared String %s", guid);
            OnSharedStringFromGuidAvailable(guid, sharedStringFromGuid);
        } catch (e) {
            console.log(e);
        }
    }
    // TODO: fix race condition on creation by putting type on every operation
    public getSharedIntervalCollection(label: string) {
        return this.sharedString.getSharedIntervalCollection(label);
    }

    public async getSharedIntervalCollectionView(collection: any,
                                                 OnSharedIntervalCollectionViewCallback: (...args: any[]) => any,
                                                 label?: string) {
        if (label === "TableIntervals") {
            const rowGuid = "{3A017221-A2A5-47DF-9937-4AB32059D789}";
            const colGuid = "{A115C672-1001-4A22-B21A-799F56A1A803}";
            const cellGuid = "{8E84740B-1A19-4FFC-9C25-9E9814818072}";
            const key = "value";
            const onPrepareDeserialize: sharedString.PrepareDeserializeCallback = (properties) => {
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
            const onDeserialize: sharedString.DeserializeCallback = (interval, obj: any) => {
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
    }

    public start(callbackForInitialLoadSegments: (...args: any[]) => any,
                 callbackForInitialLoadLength: (len: number) => void) {
        try {
            console.log("on registration of sharedstring");
            // Update the text after being loaded as well as when receiving ops
            this.sharedString.loaded.then(() => {
                const segmentWindow = this.sharedString.client.mergeTree.getCollabWindow();
                const notifyWord = (segment: mergeTree.Segment, pos: number,
                                    refSeq: number, clientId: number, segStart: number,
                                    segEnd: number) => {
                        if (segment.getType() === mergeTree.SegmentType.Text) {
                            const textSegment = segment as mergeTree.TextSegment;
                            callbackForInitialLoadSegments(1, textSegment, pos, refSeq,
                                this.sharedString.client.getLongClientId(clientId), segStart, segEnd);
                        } else if (segment.getType() === mergeTree.SegmentType.Marker) {
                            const markerSegment = segment as mergeTree.Marker;
                            callbackForInitialLoadSegments(2, markerSegment, pos, refSeq,
                                this.sharedString.client.getLongClientId(clientId), segStart, segEnd);
                        }
                        return true;
                    };
                console.log("Trying length");
                const length = this.sharedString.client.getLength();
                console.log("Length : %s", length);
                callbackForInitialLoadLength(length);
                if (length !== 0) {
                    this.sharedString.client.mergeTree.mapRange({leaf: notifyWord },
                        segmentWindow.currentSeq, segmentWindow.clientId, undefined);
                }
            });
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

     public on(event: "op", listener: (op: ISequencedObjectMessage, local: boolean) => void): this;
     public on(event: string | symbol, listener: (...args: any[]) => void): this {
         return super.on(event, listener);
     }

     public removeText(pos1: number, pos2: number) {
        console.log("Remove Text [%s, %s)", pos1, pos2);
        this.sharedString.removeText(pos1, pos2);
        setImmediate(() => { return; });
    }

    public tardisPositionLocal(pos: number, fromSeq: number, fromClientId: string) {
        return this.sharedString.client.mergeTree.tardisPositionFromClient(pos, fromSeq, -1,
            this.sharedString.client.getShortClientId(fromClientId),
            this.sharedString.client.mergeTree.getCollabWindow().clientId);
    }

    // Tardis a group op msg and do in-place updates if a sub-op, when tardised, gets broken
    // down into multiple segments. Adds those broken segments as individual sub op in that group.
    public tardisGroupOp(msg: any) {
        let index = 0;
        for (index = 0; index < msg.contents.ops.length;) {
           const countOfOpsProcessed = this.tardisSingleOp(msg, msg.contents.ops[index], index);
           index += countOfOpsProcessed; // As they are already added in-place in msg op.
        }
    }

    // Tardis a single op and update it in-place by adding sub-ops
    // in a group op (will make it a group if it is not one already)
    // if tardis of that op produces more segment changes.
    // Input/output : Original op msg
    // Input : op (specific op in that opmsg which is getting tardised here)
    // Input : opIndex (Index of that specific op in op msg)
    // Returns the count of ranges that should be considered processed
    // after tardising that single Op
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
                    if (typeof msg.contents.ops === "undefined") {
                        op.pos1 = 0;
                        op.pos2 = 0;
                    } else {
                        msg.contents.ops.splice(opIndex, 1 /*remove that op*/);
                    }
                }
                break;
            }
        return countOfRangesAfterTardisingOp;
    }

    // Tardis an and update it in-place by adding sub-ops in
    // the group op (will make it a group if it is not one already)
    // if tardis produces more segment changes.
    public tardisOp(msg: any) {
        if (msg.contents.type === 3) {
            this.tardisGroupOp(msg);
        } else {
            this.tardisSingleOp(msg, msg.contents, -1 /*index*/);
        }

    }
}

interface IAttachedDocObject {
    OpenDoc: (docId: string) => void;
}

interface IGetMapView {
    GetMapViewFromMap: (map: any, OnMapViewCallback: (...args: any[]) => any, label?: string) => void;
}

interface ISharedStringForWordFactory {
    GetSharedStringForWord: (sharedString: any) => SharedStringForWord;
}

declare function pragueAttach(rootMap: IMap,
                              sharedStringForWord: SharedStringForWord,
                              document: api.Document,
                              sharedStringForWordFactory: ISharedStringForWordFactory,
                              getMapView: IGetMapView): void;
declare function AttachDocFactory(object: IAttachedDocObject): void;

async function GetMapView(map: any, OnMapViewCallback: (...args: any[]) => any, label?: string) {
    const mapView = await map.getView();
    OnMapViewCallback(map, mapView);
}

// For local development
// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
// const tenantId = "prague";
// const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "awesome-knuth";
const secret = "5ad2ccdb911c9c3a5beb34965334edca";

// Register endpoint connection
const documentService = socketStorage.createDocumentService(routerlicious, historian);
api.registerDocumentService(documentService);

async function OpenDocument(id: string): Promise<void> {
    // Load in the latest and connect to the document
    console.log("Open document");
    const user: IUser = {
        id: "jisach",
    };
    const jwtToken = jwt.sign(
        {
            documentId: id,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user,
        },
        secret);
    const tokenProvider = new socketStorage.TokenProvider(jwtToken);
    const collabDoc = await api.load(id, tenantId, user, tokenProvider, { blockUpdateMarkers: true });
    console.log("Opened document");
    const rootMap = collabDoc.getRoot();
    const rootView = await rootMap.getView();
    console.log("Keys");
    console.log(rootView.keys());

    if (!collabDoc.existing) {
        rootView.set("text", collabDoc.createString());
        rootView.set("presence", collabDoc.createMap());
    }

    // Load the text string and listen for updates
    const text = await rootView.wait("text") as sharedString.SharedString;
    const sharedStringForWord = new SharedStringForWord(text, collabDoc);

    const sharedStringForWordFactory = {
        GetSharedStringForWord: (sharedStringIn: any) => {
            return new SharedStringForWord(sharedStringIn, collabDoc);
        },
    };

    const getMapViewFromMap = {
        GetMapViewFromMap: (map: any, OnMapViewCallback: (...args: any[]) => any, label?: string) => {
            GetMapView(map, OnMapViewCallback, label);
        },
    };
    pragueAttach(rootMap,
                 sharedStringForWord,
                 collabDoc,
                 sharedStringForWordFactory,
                 getMapViewFromMap);
}

function run() {
    const docFactoryObject = {
        OpenDoc : (docId: string) => {
            try {
            OpenDocument(docId);
            } catch (e) {
            console.log(e);
            }
        },
    };
    AttachDocFactory(docFactoryObject);
}
run();
