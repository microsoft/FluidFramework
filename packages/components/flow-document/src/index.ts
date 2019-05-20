import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { TokenList } from "@prague/flow-util";
import { MapExtension } from "@prague/map";
import {
    BaseSegment,
    ISegment,
    LocalReference,
    Marker,
    MergeTree,
    PropertySet,
    ReferencePosition,
    ReferenceType,
    reservedTileLabelsKey,
    TextSegment,
    UniversalSequenceNumber,
} from "@prague/merge-tree";
import { SharedString, SharedStringExtension } from "@prague/sequence";
import { Deferred } from "@prague/utils";
import { debug } from "./debug";
import { SegmentSpan } from "./segmentspan";

export { SegmentSpan };

export enum DocSegmentKind {
    Text = "text",
    Paragraph = "<p>",
    LineBreak = "<br>",
    Inclusion = "<?>",
    EOF = "<eof>",
}

export enum InclusionKind {
    HTML = "<html>",
    Chaincode = "<@chaincode>",
    Component = "<@component>",
}

export const getInclusionKind = (marker: Marker): InclusionKind => marker.properties.kind;
export const getInclusionHtml = (marker: Marker) => {
    const template = document.createElement("template");
    // tslint:disable-next-line:no-inner-html
    template.innerHTML = marker.properties.content;
    return template.content.firstElementChild as HTMLElement;
};

const styleProperty = "style";
export const getStyle = (segment: BaseSegment): CSSStyleDeclaration => segment.properties && segment.properties[styleProperty];
export const setStyle = (segment: BaseSegment, style: CSSStyleDeclaration) => {
    segment.properties = Object.assign(segment.properties || {}, { [styleProperty]: style });
};

export const getDocSegmentKind = (segment: ISegment): DocSegmentKind => {
    if (TextSegment.is(segment)) {
        return DocSegmentKind.Text;
    } else if (Marker.is(segment)) {
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
    } else {
        throw new Error(`Unknown Segment Type.`);
    }
};

export function getCssClassList(segment: ISegment): string {
    const props = segment.properties;
    const classes = props && props.classes;
    return (classes !== undefined) ? classes : "";
}

type LeafAction = (position: number, segment: ISegment, startOffset: number, endOffset: number) => boolean;

/**
 * Used by 'FlowDocument.visitRange'.  Uses the otherwise unused 'accum' object to pass the
 * leaf action callback, allowing us to simplify the the callback signature and while (maybe)
 * avoiding unnecessary allocation to wrap the given 'callback'.
 */
const accumAsLeafAction = {
    leaf: (
        segment: ISegment,
        position: number,
        refSeq: number,
        clientId: number,
        startOffset: number,
        endOffset: number,
        accum?: LeafAction,
    ) => (accum as LeafAction)(position, segment, startOffset, endOffset),
};

export class FlowDocument extends Component {
    public get ready() {
        return this.readyDeferred.promise;
    }

    private get sharedString() { return this.maybeSharedString; }
    private get mergeTree() { return this.maybeMergeTree; }
    private get clientId() { return this.maybeClientId; }

    public get length() {
        return this.mergeTree.getLength(UniversalSequenceNumber, this.clientId);
    }

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;

    public static markAsParagraph(marker: Marker) {
        marker.properties = Object.assign(marker.properties || {}, FlowDocument.paragraphTileProperties);
        return marker;
    }
    private static readonly paragraphTileProperties = { [reservedTileLabelsKey]: [DocSegmentKind.Paragraph] };
    private static readonly lineBreakTileProperties = { [reservedTileLabelsKey]: [DocSegmentKind.LineBreak] };
    private static readonly eofTileProperties       = { [reservedTileLabelsKey]: [DocSegmentKind.EOF] };

    private maybeSharedString?: SharedString;
    private maybeMergeTree?: MergeTree;
    private maybeClientId?: number;
    private readonly readyDeferred = new Deferred<void>();

    constructor() {
        super([
            [MapExtension.Type, new MapExtension()],
            [SharedStringExtension.Type, new SharedStringExtension()],
        ]);
    }

    public async opened() {
        this.maybeSharedString = await this.root.wait("text") as SharedString;
        this.maybeSharedString.on("sequenceDelta", (...args) => { this.emit("sequenceDelta", ...args); });
        const client = this.sharedString.client;
        this.maybeClientId = client.getClientId();
        this.maybeMergeTree = client.mergeTree;
        this.readyDeferred.resolve();
    }

    public async getInclusionComponent(marker: Marker, services: ReadonlyArray<[string, Promise<any>]>) {
        const store = await DataStore.from(marker.properties.serverUrl, "anonymous-coward");

        // TODO: Component should record serverUrl, not rely on passed-through datastore instance?
        return store.open(
            marker.properties.docId,
            marker.properties.chaincode,
            "",
            services.concat([["datastore", Promise.resolve(store)]]));
    }

    public async getInclusionContainerComponent(marker: Marker, services: ReadonlyArray<[string, Promise<any>]>) {
        await this.runtime.openComponent(marker.properties.docId, true, services);
    }

    public getSegmentAndOffset(position: number) {
        return this.mergeTree.getContainingSegment(position, UniversalSequenceNumber, this.clientId);
    }

    public getPosition(segment: ISegment) {
        return this.mergeTree.getOffset(segment, UniversalSequenceNumber, this.clientId);
    }

    public addLocalRef(position: number) {
        const { segment, offset } = this.getSegmentAndOffset(position);
        const localRef = new LocalReference(segment as BaseSegment, offset, ReferenceType.SlideOnRemove);
        this.mergeTree.addLocalReference(localRef);
        return localRef;
    }

    public removeLocalRef(localRef: LocalReference) {
        this.mergeTree.removeLocalReference(localRef.getSegment(), localRef);
    }

    public localRefToPosition(localRef: LocalReference) {
        return localRef.toPosition(this.mergeTree, UniversalSequenceNumber, this.clientId);
    }

    public insertText(position: number, text: string) {
        debug(`insertText(${position},"${text}")`);
        this.sharedString.insertText(text, position);
    }

    public replaceWithText(start: number, end: number, text: string) {
        debug(`replaceWithText(${start}, ${end}, "${text}")`);
        this.sharedString.replaceText(start, end, text);
    }

    public remove(start: number, end: number) {
        debug(`remove(${start},${end})`);
        this.sharedString.removeText(start, end);
    }

    public insertParagraph(position: number) {
        debug(`insertParagraph(${position})`);
        this.sharedString.insertMarker(position, ReferenceType.Tile, FlowDocument.paragraphTileProperties);
    }

    public insertLineBreak(position: number) {
        debug(`insertLineBreak(${position})`);
        this.sharedString.insertMarker(position, ReferenceType.Tile, FlowDocument.lineBreakTileProperties);
    }

    public insertHTML(position: number, content: HTMLElement) {
        this.sharedString.insertMarker(position, ReferenceType.Simple, { kind: InclusionKind.HTML, content: content.outerHTML });
    }

    public insertComponent(position: number, serverUrl: string, docId: string, chaincode?: string) {
        const docInfo = { kind: InclusionKind.Chaincode, serverUrl, docId, chaincode };
        this.sharedString.insertMarker(position, ReferenceType.Simple, docInfo);
    }

    public insertInclusionComponent(position: number, docId: string, pkg: string) {
        const docInfo = { kind: InclusionKind.Component, docId };
        this.sharedString.insertMarker(position, ReferenceType.Simple, docInfo);
        this.runtime.createAndAttachComponent(docId, pkg);
    }

    public annotate(start: number, end: number, props: PropertySet) {
        this.sharedString.annotateRange(props, start, end);
    }

    public addCssClass(start: number, end: number, ...classNames: string[]) {
        if (classNames.length > 0) {
            this.removeCssClass(start, end, ...classNames);

            const newClasses = classNames.join(" ");
            this.updateCssClassList(start, end, (classList) => TokenList.appendToken(classList, newClasses));
        }
    }

    public removeCssClass(start: number, end: number, ...classNames: string[]) {
        this.updateCssClassList(start, end,
                (classList) => classNames.reduce(
                    (updatedList, className) => TokenList.removeToken(updatedList, className),
                    classList));
    }

    public toggleCssClass(start: number, end: number, ...classNames: string[]) {
        // Pre-visit the range to see if any of the new styles have already been set.
        // If so, change the add to a removal by setting the map value to 'undefined'.
        const toAdd = classNames.slice(0);
        const toRemove = new Set<string>();

        this.updateCssClassList(start, end,
            (classList) => {
                TokenList.computeToggle(classList, toAdd, toRemove);
                return classList;
            });

        this.removeCssClass(start, end, ...toRemove);
        this.addCssClass(start, end, ...toAdd);
    }

    public findTile(startPos: number, tileType: string, preceding): { tile: ReferencePosition, pos: number } {
        return this.mergeTree.findTile(startPos, this.clientId, tileType, preceding);
    }

    public findParagraph(position: number) {
        position = Math.min(position, this.length - 1);

        const maybeStart = this.findTile(position, DocSegmentKind.Paragraph, /* preceding: */ true);
        const start = maybeStart ? maybeStart.pos : 0;

        const maybeEnd = this.findTile(position, DocSegmentKind.Paragraph, /* preceding: */ false);
        const end = maybeEnd ? maybeEnd.pos : this.length;

        return { start, end };
    }

    public visitRange(callback: LeafAction, startPosition = 0, endPosition = +Infinity) {
        // Early exit if passed an empty or invalid range (e.g., NaN).
        if (!(startPosition < endPosition)) {
            return;
        }

        // Note: We pass the leaf callback action as the accumulator, and then use the 'accumAsLeafAction'
        //       actions to invoke the accum for each leaf.  (Paranoid micro-optimization that attempts to
        //       avoid allocation while simplifying the 'LeafAction' signature.)
        this.mergeTree.mapRange(
            /* actions: */ accumAsLeafAction,
            UniversalSequenceNumber,
            this.clientId,
            /* accum: */ callback,
            startPosition,
            endPosition);
    }

    protected async create() {
        // For 'findTile(..)', we must enable tracking of left/rightmost tiles:
        // (See: https://github.com/Microsoft/Prague/pull/1118)
        Object.assign(this.runtime, { options: Object.assign(this.runtime.options || {}, { blockUpdateMarkers: true }) });

        const text = this.runtime.createChannel("text", SharedStringExtension.Type) as SharedString;
        text.insertMarker(0, ReferenceType.Tile, FlowDocument.eofTileProperties);
        this.root.set("text", text);
    }

    private updateCssClassList(start: number, end: number, callback: (classList: string) => string) {
        // tslint:disable-next-line:prefer-array-literal
        const updates: Array<{span: SegmentSpan, classList: string}> = [];

        this.visitRange((position, segment, startOffset, endOffset) => {
            const oldList = getCssClassList(segment);
            const newList = callback(oldList);

            if (newList !== oldList) {
                updates.push({
                    classList: newList,
                    span: new SegmentSpan(position, segment, startOffset, endOffset),
                });
            }

            return true;
        }, start, end);

        for (const { span, classList } of updates) {
            this.annotate(span.startPosition, span.endPosition, { classes: classList });
        }
    }
}
