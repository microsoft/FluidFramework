var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { MapExtension } from "@prague/map";
import { LocalReference, Marker, ReferenceType, reservedTileLabelsKey, TextSegment, UniversalSequenceNumber, } from "@prague/merge-tree";
import { SharedStringExtension } from "@prague/sequence";
import { Deferred } from "@prague/utils";
import { debug } from "./debug";
export var DocSegmentKind;
(function (DocSegmentKind) {
    DocSegmentKind["Text"] = "text";
    DocSegmentKind["Paragraph"] = "<p>";
    DocSegmentKind["LineBreak"] = "<br>";
    DocSegmentKind["Inclusion"] = "<?>";
    DocSegmentKind["EOF"] = "<eof>";
})(DocSegmentKind || (DocSegmentKind = {}));
export var InclusionKind;
(function (InclusionKind) {
    InclusionKind["HTML"] = "<html>";
    InclusionKind["Chaincode"] = "<@chaincode>";
    InclusionKind["Component"] = "<@component>";
})(InclusionKind || (InclusionKind = {}));
export const getInclusionKind = (marker) => marker.properties.kind;
export const getInclusionHtml = (marker) => {
    const template = document.createElement("template");
    // tslint:disable-next-line:no-inner-html
    template.innerHTML = marker.properties.content;
    return template.content.firstElementChild;
};
const styleProperty = "style";
export const getStyle = (segment) => segment.properties && segment.properties[styleProperty];
export const setStyle = (segment, style) => {
    segment.properties = Object.assign(segment.properties || {}, { [styleProperty]: style });
};
export const getDocSegmentKind = (segment) => {
    if (segment instanceof TextSegment) {
        return DocSegmentKind.Text;
    }
    else if (segment instanceof Marker) {
        const markerType = segment.refType;
        switch (markerType) {
            case ReferenceType.Tile:
                const tileLabel = segment.getTileLabels()[0];
                switch (tileLabel) {
                    case DocSegmentKind.Paragraph:
                    case DocSegmentKind.LineBreak:
                    case DocSegmentKind.EOF:
                        return tileLabel;
                    default:
                        throw new Error(`Unknown Marker.tileLabel '${tileLabel}'.`);
                }
            case ReferenceType.Simple:
                return DocSegmentKind.Inclusion;
            default:
                throw new Error(`Unknown Marker.refType '${markerType}'.`);
        }
    }
    else {
        throw new Error(`Unknown Segment Type.`);
    }
};
/**
 * Used by 'FlowDocument.visitRange'.  Uses the otherwise unused 'accum' object to pass the
 * leaf action callback, allowing us to simplify the the callback signature and while (maybe)
 * avoiding unnecessary allocation to wrap the given 'callback'.
 */
const accumAsLeafAction = {
    leaf: (segment, position, refSeq, clientId, start, end, accum) => accum(position, segment, start, end),
};
export class FlowDocument extends Component {
    constructor() {
        super([
            [MapExtension.Type, new MapExtension()],
            [SharedStringExtension.Type, new SharedStringExtension()],
        ]);
        this.readyDeferred = new Deferred();
    }
    get ready() {
        return this.readyDeferred.promise;
    }
    get sharedString() { return this.maybeSharedString; }
    get mergeTree() { return this.maybeMergeTree; }
    get clientId() { return this.maybeClientId; }
    get length() {
        return this.mergeTree.getLength(UniversalSequenceNumber, this.clientId);
    }
    static markAsParagraph(marker) {
        marker.properties = Object.assign(marker.properties || {}, FlowDocument.paragraphTileProperties);
        return marker;
    }
    opened() {
        return __awaiter(this, void 0, void 0, function* () {
            this.maybeSharedString = (yield this.root.wait("text"));
            this.maybeSharedString.on("op", (op, local) => { this.emit("op", op, local); });
            const client = this.sharedString.client;
            this.maybeClientId = client.getClientId();
            this.maybeMergeTree = client.mergeTree;
            this.readyDeferred.resolve();
        });
    }
    getInclusionComponent(marker, services) {
        return __awaiter(this, void 0, void 0, function* () {
            const store = yield DataStore.from(marker.properties.serverUrl, "anonymous-coward");
            // TODO: Component should record serverUrl, not rely on passed-through datastore instance?
            return store.open(marker.properties.docId, marker.properties.chaincode, "", services.concat([["datastore", Promise.resolve(store)]]));
        });
    }
    getInclusionContainerComponent(marker, services) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.runtime.openComponent(marker.properties.docId, true, services);
        });
    }
    getSegmentAndOffset(position) {
        return this.mergeTree.getContainingSegment(position, UniversalSequenceNumber, this.clientId);
    }
    getPosition(segment) {
        return this.mergeTree.getOffset(segment, UniversalSequenceNumber, this.clientId);
    }
    addLocalRef(position) {
        const { segment, offset } = this.getSegmentAndOffset(position);
        const localRef = new LocalReference(segment, offset, ReferenceType.SlideOnRemove);
        this.mergeTree.addLocalReference(localRef);
        return localRef;
    }
    removeLocalRef(localRef) {
        this.mergeTree.removeLocalReference(localRef.getSegment(), localRef);
    }
    localRefToPosition(localRef) {
        return localRef.toPosition(this.mergeTree, UniversalSequenceNumber, this.clientId);
    }
    appendText(text) {
        this.sharedString.insertText(text, this.length);
    }
    insertText(position, text) {
        debug(`insertText(${position},"${text}")`);
        this.sharedString.insertText(text, position);
    }
    replaceWithText(start, end, text) {
        debug(`replaceWithText(${start}, ${end}, "${text}")`);
        this.sharedString.replaceText(start, end, text);
    }
    remove(start, end) {
        debug(`remove(${start},${end})`);
        this.sharedString.removeText(start, end);
    }
    insertParagraph(position) {
        debug(`insertParagraph(${position})`);
        this.sharedString.insertMarker(position, ReferenceType.Tile, FlowDocument.paragraphTileProperties);
    }
    insertLineBreak(position) {
        debug(`insertLineBreak(${position})`);
        this.sharedString.insertMarker(position, ReferenceType.Tile, FlowDocument.lineBreakTileProperties);
    }
    insertHTML(position, content) {
        this.sharedString.insertMarker(position, ReferenceType.Simple, { kind: InclusionKind.HTML, content: content.outerHTML });
    }
    insertComponent(position, serverUrl, docId, chaincode) {
        const docInfo = { kind: InclusionKind.Chaincode, serverUrl, docId, chaincode };
        this.sharedString.insertMarker(position, ReferenceType.Simple, docInfo);
    }
    insertInclusionComponent(position, docId, pkg) {
        const docInfo = { kind: InclusionKind.Component, docId };
        this.sharedString.insertMarker(position, ReferenceType.Simple, docInfo);
        this.runtime.createAndAttachComponent(docId, pkg);
    }
    annotate(start, end, props) {
        this.sharedString.annotateRange(props, start, end);
    }
    findTile(startPos, tileType, preceding = true) {
        return this.mergeTree.findTile(startPos, this.clientId, tileType, preceding);
    }
    findParagraphStart(position) {
        position = Math.min(position, this.length - 1);
        const maybePosAndTile = this.findTile(position, DocSegmentKind.Paragraph);
        return maybePosAndTile ? maybePosAndTile.pos : 0;
    }
    visitRange(callback, startPosition, endPosition) {
        // Note: We pass the leaf callback action as the accumulator, and then use the 'accumAsLeafAction'
        //       actions to invoke the accum for each leaf.  (Paranoid micro-optimization that attempts to
        //       avoid allocation while simplifying the 'LeafAction' signature.)
        this.mergeTree.mapRange(
        /* actions: */ accumAsLeafAction, UniversalSequenceNumber, this.clientId, 
        /* accum: */ callback, startPosition, endPosition);
    }
    create() {
        return __awaiter(this, void 0, void 0, function* () {
            // For 'findTile(..)', we must enable tracking of left/rightmost tiles:
            // (See: https://github.com/Microsoft/Prague/pull/1118)
            Object.assign(this.runtime, { options: Object.assign(this.runtime.options || {}, { blockUpdateMarkers: true }) });
            const text = this.runtime.createChannel("text", SharedStringExtension.Type);
            text.insertMarker(0, ReferenceType.Tile, FlowDocument.eofTileProperties);
            this.root.set("text", text);
        });
    }
}
FlowDocument.type = `${require("../package.json").name}@${require("../package.json").version}`;
FlowDocument.paragraphTileProperties = { [reservedTileLabelsKey]: [DocSegmentKind.Paragraph] };
FlowDocument.lineBreakTileProperties = { [reservedTileLabelsKey]: [DocSegmentKind.LineBreak] };
FlowDocument.eofTileProperties = { [reservedTileLabelsKey]: [DocSegmentKind.EOF] };
//# sourceMappingURL=index.js.map