// tslint:disable:whitespace align
import * as assert from "assert";
import performanceNow = require("performance-now");
import * as resources from "gitresources";
import * as api from "../api-core";
import { Deferred } from "../core-utils";
import { IMap, IMapView } from "../data-types";
import { CollaborativeMap, DistributedArray, DistributedArrayValueType, IMapArray, MapExtension } from "../map";
import { IIntegerRange } from "./base";
import { CollaboritiveStringExtension } from "./extension";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import * as Properties from "./properties";
import * as Paparazzo from "./snapshot";

function textsToSegments(texts: ops.IPropertyString[]) {
    let segments: MergeTree.Segment[] = [];
    for (let ptext of texts) {
        let segment: MergeTree.Segment;
        if (ptext.text !== undefined) {
            segment = MergeTree.TextSegment.make(ptext.text, ptext.props as Properties.PropertySet,
                MergeTree.UniversalSequenceNumber,
                MergeTree.LocalClientId);
        } else {
            // for now assume marker
            segment = MergeTree.Marker.make(
                ptext.marker.refType,
                ptext.props as Properties.PropertySet,
                MergeTree.UniversalSequenceNumber,
                MergeTree.LocalClientId);
        }
        segments.push(segment);
    }
    return segments;
}

export interface ISerializedReference {
    sequenceNumber: number;
    position: number;
    refType: ops.ReferenceType;
    pairedRefId?: string;
}

export interface IReference {
    serializedRef?: ISerializedReference;
    localRef?: MergeTree.LocalReference;
}

export class Reference implements IReference {
    public serializedRef: ISerializedReference;
    public localRef: MergeTree.LocalReference;
    constructor(public collection: ReferenceCollection, public index: number) {
    }
    public toJSON(key: string) {
        return { serializedRef: this.serializedRef };
    }
}

export class Range {
    public start: Reference;
    public end: Reference;
    public local: MergeTree.LocalRangeReference;
}

export interface IStoreRefCollection extends DistributedArray<IReference> {
    collection: ReferenceCollection;
}

/** Collection of references to positions in the shared string.
 * If the property mapKey is defined, the collection is shared at that key.
 */
export class ReferenceCollection {
    public refstore: IMapArray<IReference>;
    constructor(public sharedString: SharedString, public mapKey?: string, createMap = false) {
        if (mapKey) {
            let drefstore: IStoreRefCollection;
            if (createMap) {
                drefstore = this.sharedString.referenceCollections.set<IStoreRefCollection>(
                    mapKey,
                    undefined,
                    DistributedArrayValueType.Name);
            } else {
                drefstore = this.sharedString.referenceCollections.get<IStoreRefCollection>(mapKey);
            }
            drefstore.collection = this;
            drefstore.onInsertAt = (index: number, value: IReference,
                message: api.ISequencedObjectMessage) => {
                if (!message) {
                    drefstore.value[index] = value;
                } else if (message.clientId !== sharedString.client.longClientId) {
                    this.deserialize(index, value,
                        this.sharedString.client.getOrAddShortClientId(message.clientId));
                }
            };
            this.refstore = drefstore;
        } else {
            this.refstore = { value: <IReference[]>[] };
        }
    }

    // TODO: add property set
    // TODO: error cases
    public add(pos: number, refType = ops.ReferenceType.Simple) {
        let refs = this.refstore.value;
        let index = refs.length;
        let lref = this.sharedString.createPositionReference(pos, refType);
        // TODO: handle pairing here or in range collection
        if (lref) {
            let ref = new Reference(this, index);
            ref.localRef = lref;
            if (this.mapKey) {
                let drefstore = <DistributedArray<IReference>>this.refstore;
                ref.serializedRef = <ISerializedReference>{
                    refType,
                    position: pos,
                    sequenceNumber: this.sharedString.client.getCurrentSeq(),
                };
                drefstore.insertAt(index, ref);
            } else {
                refs[index] = ref;
            }
        }
    }

    public deserialize(index: number, ref: IReference, clientId: number) {
        let lref = this.sharedString.createPositionReference(ref.serializedRef.position,
            ref.serializedRef.refType, ref.serializedRef.sequenceNumber, clientId);
        if (lref) {
            let completeRef = new Reference(this, index);
            completeRef.localRef = lref;
            completeRef.serializedRef = ref.serializedRef;
            // TODO: lookup paired ref in collection and add to lref
            this.refstore.value[index] = completeRef;
        }
    }
}

export class RangeCollection {
    public refCollection: ReferenceCollection;
}

export class SharedString extends CollaborativeMap {
    public client: MergeTree.Client;
    public referenceCollections: IMapView;
    private isLoaded = false;
    private pendingMinSequenceNumber: number = 0;

    // Deferred that triggers once the object is loaded
    private loadedDeferred = new Deferred<void>();

    get loaded(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    constructor(
        document: api.IDocument,
        public id: string,
        sequenceNumber: number,
        services?: api.IDistributedObjectServices) {

        super(id, document, CollaboritiveStringExtension.Type);
        this.client = new MergeTree.Client("", document.options);
    }

    public insertMarker(
        pos: number,
        refType: ops.ReferenceType,
        props?: Properties.PropertySet) {

        const insertMessage: ops.IMergeTreeInsertMsg = {
            marker: { refType },
            pos1: pos,
            props,
            type: ops.MergeTreeDeltaType.INSERT,
        };

        this.client.insertMarkerLocal(pos, refType, props);
        this.submitIfAttached(insertMessage);
    }

    public insertText(text: string, pos: number, props?: Properties.PropertySet) {
        const insertMessage: ops.IMergeTreeInsertMsg = {
            pos1: pos,
            props,
            type: ops.MergeTreeDeltaType.INSERT,
            text,
        };

        this.client.insertTextLocal(text, pos, props);
        this.submitIfAttached(insertMessage);
    }

    public removeText(start: number, end: number) {
        const removeMessage: ops.IMergeTreeRemoveMsg = {
            pos1: start,
            pos2: end,
            type: ops.MergeTreeDeltaType.REMOVE,
        };

        this.client.removeSegmentLocal(start, end);
        this.submitIfAttached(removeMessage);
    }

    public annotateRangeFromPast(
        props: Properties.PropertySet,
        start: number,
        end: number,
        fromSeq: number) {

        let ranges = this.client.mergeTree.tardisRange(start, end, fromSeq, this.client.getCurrentSeq(),
            this.client.getClientId());
        ranges.map((range: IIntegerRange) => {
            this.annotateRange(props, range.start, range.end);
        });
    }

    public transaction(groupOp: ops.IMergeTreeGroupMsg) {
        this.client.localTransaction(groupOp);
        this.submitIfAttached(groupOp);
    }

    public annotateRange(props: Properties.PropertySet, start: number, end: number, op?: ops.ICombiningOp) {
        let annotateMessage: ops.IMergeTreeAnnotateMsg = {
            pos1: start,
            pos2: end,
            props,
            type: ops.MergeTreeDeltaType.ANNOTATE,
        };

        if (op) {
            annotateMessage.combiningOp = op;
        }
        this.client.annotateSegmentLocal(props, start, end, op);
        this.submitIfAttached(annotateMessage);
    }

    public setLocalMinSeq(lmseq: number) {
        this.client.mergeTree.updateLocalMinSeq(lmseq);
    }

    public createRangeReference(start: number, end: number, refSeq = this.client.getCurrentSeq(),
        clientId = this.client.getClientId()) {
        let startLref = this.createPositionReference(start, ops.ReferenceType.RangeBegin, refSeq, clientId);
        let endLref = this.createPositionReference(start, ops.ReferenceType.RangeBegin, refSeq, clientId);
        if (startLref && endLref) {
            startLref.pairedRef = endLref;
            endLref.pairedRef = startLref;
            return new MergeTree.LocalRangeReference(startLref, endLref);
        }
    }

    public createPositionReference(pos: number, refType: ops.ReferenceType, refSeq = this.client.getCurrentSeq(),
        clientId = this.client.getClientId()) {
        let segoff = this.client.mergeTree.getContainingSegment(pos,
            refSeq, this.client.getClientId());
        if (segoff && segoff.segment) {
            let baseSegment = <MergeTree.BaseSegment>segoff.segment;
            let lref = new MergeTree.LocalReference(baseSegment, segoff.offset, refType);
            this.client.mergeTree.addLocalReference(lref);
            return lref;
        }
    }

    public localRefToPos(localRef: MergeTree.LocalReference) {
        if (localRef.segment) {
            return localRef.offset + this.client.mergeTree.getOffset(localRef.segment,
                this.client.getCurrentSeq(), this.client.getClientId());
        } else {
            return -1;
        }
    }

    public getReferenceCollections(): IMapView {
        return this.referenceCollections;
    }

    protected transformContent(message: api.IObjectMessage, toSequenceNumber: number): api.IObjectMessage {
        if (message.contents) {
            this.client.transform(<api.ISequencedObjectMessage>message, toSequenceNumber);
        }
        message.referenceSequenceNumber = toSequenceNumber;
        return message;
    }

    protected async loadContent(
        version: resources.ICommit,
        headerOrigin: string,
        storage: api.IObjectStorageService): Promise<void> {

        const header = await storage.read("header");
        return this.initialize(this.sequenceNumber, header, true, headerOrigin, storage);
    }

    protected initializeContent() {
        const referenceCollections = this.document.create(MapExtension.Type) as IMap;
        this.set("referenceCollections", referenceCollections);
        this.initialize(0, null, false, this.id, null).catch((error) => {
            console.error(error);
        });
    }

    protected snapshotContent(): api.ITree {
        this.client.mergeTree.commitGlobalMin();
        let snap = new Paparazzo.Snapshot(this.client.mergeTree);
        snap.extractSync();
        return snap.emit();
    }

    protected processContent(message: api.ISequencedObjectMessage) {
        if (!this.isLoaded) {
            this.client.enqueueMsg(message);
            return;
        }

        this.applyMessage(message);
    }

    protected processMinSequenceNumberChangedContent(value: number) {
        // Apply directly once loaded - otherwise track so we can update later
        if (this.isLoaded) {
            this.client.updateMinSeq(value);
        } else {
            this.pendingMinSequenceNumber = value;
        }
    }

    protected attachContent() {
        this.client.startCollaboration(this.document.clientId, 0);
    }

    private submitIfAttached(message: any) {
        if (this.isLocal()) {
            return;
        }

        this.submitLocalMessage(message);
    }

    // TODO I need to split this into two parts - one for the header - one for the body. The loadContent will
    // resolve on the loading of the header
    private async initialize(
        sequenceNumber: number,
        header: string,
        collaborative: boolean,
        originBranch: string,
        services: api.IObjectStorageService) {

        let chunk: ops.MergeTreeChunk;

        console.log(`Async load ${this.id} - ${performanceNow()}`);

        if (header) {
            chunk = Paparazzo.Snapshot.processChunk(header);
            let segs = textsToSegments(chunk.segmentTexts);
            this.client.mergeTree.reloadFromSegments(segs);
            console.log(`Loading ${this.id} body - ${performanceNow()}`);
            chunk = await Paparazzo.Snapshot.loadChunk(services, "body");
            console.log(`Loaded ${this.id} body - ${performanceNow()}`);
            for (let segSpec of chunk.segmentTexts) {
                this.client.mergeTree.appendSegment(segSpec);
            }
        } else {
            chunk = Paparazzo.Snapshot.EmptyChunk;
        }

        // Register the filter callback on the reference collections
        let referenceCollections = await this.get("referenceCollections") as IMap;
        referenceCollections.registerSerializeFilter((key, value: Reference[], type) => {
            if (type === DistributedArrayValueType.Name) {
                return value.map((ref: Reference) => {
                    let seq = Math.max(this.client.mergeTree.collabWindow.minSeq,
                        ref.localRef.segment.seq);
                    let pos = this.client.mergeTree.referencePositionToLocalPosition(ref.localRef,
                        seq, MergeTree.NonCollabClient);
                    // TODO: retain pairing info
                    return <IReference>{
                        serializedRef: {
                            position: pos,
                            refType: ref.serializedRef.refType,
                            sequenceNumber: seq,
                        },
                    };
                });
            }
        });
        this.referenceCollections = await referenceCollections.getView();
        this.initializeReferenceCollections(sequenceNumber);
        // This should happen if we have collab services
        assert.equal(sequenceNumber, chunk.chunkSequenceNumber);
        if (collaborative) {
            console.log(`Start ${this.id} collab - ${performanceNow()}`);
            // TODO currently only assumes two levels of branching
            const branchId = originBranch === this.document.id ? 0 : 1;
            this.client.startCollaboration(this.document.clientId, sequenceNumber, branchId);
        }
        console.log(`Apply ${this.id} pending - ${performanceNow()}`);
        this.applyPending();
        console.log(`Load ${this.id} finished - ${performanceNow()}`);
        this.loadFinished(chunk);
    }

    // TODO: id format checking
    private idToLref(id: string) {
        let [key, indexStr] = id.split(":");
        let index = +indexStr;
        let refCollection = this.referenceCollections.get<IStoreRefCollection>(key);
        if (refCollection && (index < refCollection.value.length)) {
            let ref = refCollection.value[index];
            if (!ref.localRef) {
                refCollection.collection.deserialize(index, ref, this.client.getClientId());
            }
            return refCollection.value[index].localRef;
        }
    }

    // convert serialized references to local reference objects
    // defer references whose sequence numbers are greater than minseq
    private initializeReferenceCollections(minseq: number) {
        this.client.mergeTree.setLrefIdMap((id) => this.idToLref(id));
        for (let key of this.referenceCollections.keys()) {
            let refCollection = new ReferenceCollection(this, key, true);
            let references = refCollection.refstore.value;
            for (let i = 0, len = references.length; i < len; i++) {
                let savedRef = references[i];
                if (savedRef.serializedRef.sequenceNumber <= minseq) {
                    refCollection.deserialize(i, savedRef,
                        this.client.getClientId());
                } else {
                    // defer local ref creation until first request
                    savedRef.localRef = undefined;
                }
            }
        }
    }

    private loadFinished(chunk: ops.MergeTreeChunk) {
        this.isLoaded = true;
        this.loadedDeferred.resolve();
        this.emit("loadFinished", chunk, true);
    }

    private applyPending() {
        while (this.client.hasMessages()) {
            const message = this.client.dequeueMsg();
            this.applyMessage(message);
        }

        // Update the MSN if larger than the set value
        if (this.pendingMinSequenceNumber > this.client.mergeTree.getCollabWindow().minSeq) {
            this.client.updateMinSeq(this.pendingMinSequenceNumber);
        }
    }

    private applyMessage(message: api.ISequencedObjectMessage) {
        this.emit("pre-op", message);
        this.client.applyMsg(message);
    }
}
