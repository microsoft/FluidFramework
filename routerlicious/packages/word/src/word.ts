import {
    api,
    core as apicore,
    MergeTree as mergeTree,
    SharedString as sharedString,
    socketStorage,
    types as dataTypes,
} from "@prague/client-api";
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
    public constructor(sharedStringIn: sharedString.SharedString) {
        super();
        this.sharedString = sharedStringIn;
    }

    public annotateRange(pos1: number, pos2: number, props: mergeTree.PropertySet) {
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
        console.log("insert Text");
        try {
            this.sharedString.insertText(text, position, props);
            setImmediate(() => { return; });
        } catch (e) {
            console.log(e);
        }
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

    public insertTileMarker(pos1: number, tileMarker: string, markerId: string, propsIn?: mergeTree.PropertySet) {
        const props = propsIn;
        props[mergeTree.reservedTileLabelsKey] = [tileMarker];
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

    public getIntervalCollections(): dataTypes.IMapView {
        return this.sharedString.getIntervalCollections();
    }

    public async getSharedStringFromGuid(guid: string,
                                         OnSharedStringFromGuidAvailable: (guid: string,
                                                                           sharedStringFromGuid: any) => void) {
        try {
            console.log("get Shared String %s", guid);
            const sharedStringFromGuid = await this.sharedString.getDocument().get(guid);
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
                    const p1 = this.sharedString.getDocument().get(rowProp[key]);
                    const p2 = this.sharedString.getDocument().get(colProp[key]);
                    if (properties[cellGuid]) {
                        const cellProp = properties[cellGuid];
                        const p3 = this.sharedString.getDocument().get(cellProp[key]);
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
                 callbackForInitialLoadLength: (len: number) => void,
                 callbackForInitialLoadBegin: () => void,
                 callbackForInitialLoadEnd: () => void) {
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
                    callbackForInitialLoadBegin();
                    this.sharedString.client.mergeTree.mapRange({leaf: notifyWord },
                        segmentWindow.currentSeq, segmentWindow.clientId, undefined);
                    callbackForInitialLoadEnd();
                }
            });
            console.log("Registering op");
            this.sharedString.on("pre-op", (msg, local) => {
                console.log("op - new text");
                const msgCopy = JSON.parse(JSON.stringify(msg));
                this.tardisOp(msgCopy);
            });

            this.sharedString.on("op", (msg, local) => {
                console.log("op - new text");
                this.tardisOp(msg);
                this.emit("op", msg, local);
            });
        } catch (e) {
            console.log(e);
        }
     }

     public on(event: "op", listener: (op: apicore.ISequencedObjectMessage, local: boolean) => void): this;
     public on(event: string | symbol, listener: (...args: any[]) => void): this {
         return super.on(event, listener);
     }

     public removeText(pos1: number, pos2: number) {
        this.sharedString.removeText(pos1, pos2);
        setImmediate(() => { return; });
    }

    public tardisPositionLocal(pos: number, fromSeq: number, fromClientId: string) {
        return this.sharedString.client.mergeTree.tardisPositionFromClient(pos, fromSeq, -1,
            this.sharedString.client.getShortClientId(fromClientId),
            this.sharedString.client.mergeTree.getCollabWindow().clientId);
    }

    public tardisGroupOp(msg: any) {
        let index = 0;
        for (index = 0; index < msg.contents.ops.length;) {
           const countOfTardisOps = this.tardisSingleOp(msg, msg.contents.ops[index], index);
           index += countOfTardisOps;
        }
    }

    public tardisSingleOp(msg: any, op: any, opIndex: number) {
        const fromSeq = msg.referenceSequenceNumber;
        const fromClientId = msg.clientId;
        let countOfTardisOps = 1;
        switch (op.type) {
            case 0 /*INSERT */: // currently this is being handled on cpp side
                break;
            case 1 /*REMOVE */:
            case 2 /*ANNOTATE */:
                const ranges = this.sharedString.client.mergeTree.tardisRangeFromClient(op.pos1,
                    op.pos2,
                    fromSeq,
                    -1 /*toSeqNumber*/,
                    this.sharedString.client.getShortClientId(fromClientId),
                    this.sharedString.client.mergeTree.getCollabWindow().clientId);
                countOfTardisOps = ranges.length;
                if (ranges.length > 1) {
                    const opsToInsert = [];
                    let cAdjust = 0;
                    for (const range of ranges) {
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
                    if (typeof msg.contents.ops === "undefined") {
                        msg.contents.ops = [];
                        opIndex = 0;
                        cRemove = 0; // Nothing to remove if just create ops
                    }
                    msg.contents.ops.splice(opIndex, cRemove, ...opsToInsert);
                    msg.contents.type = 3; // Make msg a group op now
                } else if (ranges.length === 1) {
                    op.pos1 = ranges[0].start;
                    op.pos2 = ranges[0].end;
                }
                break;
            }
        return countOfTardisOps;
    }

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

declare function pragueAttach(rootMap: dataTypes.IMap,
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
socketStorage.registerAsDefault(routerlicious, historian, tenantId);

async function OpenDocument(id: string): Promise<void> {
    // Load in the latest and connect to the document
    console.log("Open document");
    const jwtToken = jwt.sign(
        {
            documentId: id,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "jisach",
              },
        },
        secret);

    const collabDoc = await api.load(id, { blockUpdateMarkers: true, token: jwtToken });
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
    const sharedStringForWord = new SharedStringForWord(text);

    const sharedStringForWordFactory = {
        GetSharedStringForWord: (sharedStringIn: any) => {
            return new SharedStringForWord(sharedStringIn);
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
