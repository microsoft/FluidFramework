import { Component } from "@prague/app-component";
import { ServicePlatform } from "@prague/component-runtime";
import { randomId, TokenList } from "@prague/flow-util";
import { MapExtension } from "@prague/map";
import {
    BaseSegment,
    createInsertSegmentOp,
    createRemoveRangeOp,
    IMergeTreeRemoveMsg,
    ISegment,
    LocalReference,
    Marker,
    MergeTree,
    MergeTreeDeltaType,
    PropertySet,
    ReferencePosition,
    ReferenceType,
    reservedMarkerIdKey,
    reservedRangeLabelsKey,
    reservedTileLabelsKey,
    TextSegment,
    UniversalSequenceNumber,
} from "@prague/merge-tree";
import { IComponent } from "@prague/runtime-definitions";
import { SharedString, SharedStringExtension } from "@prague/sequence";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { debug } from "./debug";
import { SegmentSpan } from "./segmentspan";

export { SegmentSpan };

export const enum DocSegmentKind {
    text = "text",
    paragraph = "<p>",
    lineBreak = "<br>",
    beginTag = "<t>",
    inclusion = "<?>",
    endRange = "</>",
}

const tilesAndRanges = [ DocSegmentKind.paragraph, DocSegmentKind.lineBreak, DocSegmentKind.beginTag, DocSegmentKind.inclusion ];

export const enum DocTile {
    paragraph = DocSegmentKind.paragraph,
}

const styleProperty = "style";
export const getStyle = (segment: BaseSegment): CSSStyleDeclaration => segment.properties && segment.properties[styleProperty];
export const setStyle = (segment: BaseSegment, style: CSSStyleDeclaration) => {
    segment.properties = Object.assign(segment.properties || {}, { [styleProperty]: style });
};

export const getDocSegmentKind = (segment: ISegment): DocSegmentKind => {
    if (TextSegment.Is(segment)) {
        return DocSegmentKind.text;
    } else if (Marker.is(segment)) {
        const markerType = segment.refType;
        switch (markerType) {
            case ReferenceType.Tile:
            case ReferenceType.NestBegin:
                const tileLabel = segment.getTileLabels()[0];
                const kind = (tileLabel || segment.getRangeLabels()[0]) as DocSegmentKind;

                assert(tilesAndRanges.indexOf(kind) >= 0,
                    `Unknown tile/range label ${kind}.`);

                return kind;
            default:
                assert(markerType === ReferenceType.NestEnd);
                return DocSegmentKind.endRange;
        }
    } else {
        assert.fail(`Unknown Segment Type: '${segment.toJSONObject()}'`);
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

// TODO: We need the ability to create LocalReferences to the end of the document. Our
//       workaround creates a LocalReference with a sentinal segment that is never inserted
//       into the MergeTree.  We then special case this segment in localRefToPosition.
//
//       See: https://github.com/microsoft/Prague/issues/2408
const endOfTextSegment = {} as unknown as BaseSegment;

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

    private static readonly paragraphProperties = { [reservedTileLabelsKey]: [DocSegmentKind.paragraph] };
    private static readonly lineBreakProperties = { [reservedTileLabelsKey]: [DocSegmentKind.lineBreak] };
    private static readonly inclusionProperties = { [reservedTileLabelsKey]: [DocSegmentKind.inclusion] };

    private static readonly beginTagProperties  = { [reservedRangeLabelsKey]: [DocSegmentKind.beginTag] };
    private static readonly endRangeProperties  = { };

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

    public async getComponent(marker: Marker, services: ReadonlyArray<[string, Promise<any>]>) {
        const url = marker.properties.url as string;
        if (url.indexOf("/") === 0) {
            const response = await this.context.hostRuntime.request({ url });
            if (response.status !== 200 || response.mimeType !== "prague/component") {
                return Promise.reject("Not found");
            }

            const component = response.value as IComponent;
            await component.attach(new ServicePlatform(services));
        } else {
            await this.runtime.openComponent(url, true, services);
        }
    }

    public getSegmentAndOffset(position: number) {
        return this.mergeTree.getContainingSegment(position, UniversalSequenceNumber, this.clientId);
    }

    public getPosition(segment: ISegment) {
        return this.mergeTree.getOffset(segment, UniversalSequenceNumber, this.clientId);
    }

    public addLocalRef(position: number) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        if (position === this.length) {
            return new LocalReference(endOfTextSegment);
        }

        const { segment, offset } = this.getSegmentAndOffset(position);
        const localRef = new LocalReference(segment as BaseSegment, offset, ReferenceType.SlideOnRemove);
        this.mergeTree.addLocalReference(localRef);
        return localRef;
    }

    public removeLocalRef(localRef: LocalReference) {
        const segment = localRef.getSegment();

        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        if (segment !== endOfTextSegment) {
            this.mergeTree.removeLocalReference(segment, localRef);
        }
    }

    public localRefToPosition(localRef: LocalReference) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        if (localRef.getSegment() === endOfTextSegment) {
            return this.length;
        }

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
        const ops: IMergeTreeRemoveMsg[] = [];

        this.visitRange((position: number, segment: ISegment) => {
            switch (getDocSegmentKind(segment)) {
                case DocSegmentKind.beginTag: {
                    // Removing a start tag implicitly removes its matching end tag.
                    // Check if the end tag is already included in the range being removed.
                    const endTag = this.getEnd(segment as Marker);
                    const endPos = this.getPosition(endTag);

                    // Note: The end tag must appear after the position of the current start tag.
                    console.assert(position < endPos);

                    if (!(endPos < end)) {
                        // If not, add the end tag removal to the group op.
                        debug(`  also remove end tag '</${endTag.properties.tag}>' at ${endPos}.`);
                        ops.push(createRemoveRangeOp(endPos, endPos + 1));
                    }
                    break;
                }
                case DocSegmentKind.endRange: {
                    // The end tag should be preserved unless the start tag is also included in
                    // the removed range.  Check if range being removed includes the start tag.
                    const startTag = this.getStart(segment as Marker);
                    const startPos = this.getPosition(startTag);

                    // Note: The start tag must appear before the position of the current end tag.
                    console.assert(startPos < position);

                    if (!(start <= startPos)) {
                        // If not, remove any positions up to, but excluding the current segment
                        // and adjust the pending removal range to just after this marker.
                        debug(`  exclude end tag '</${segment.properties.tag}>' at ${position}.`);
                        ops.push(createRemoveRangeOp(start, position));
                        start = position + 1;
                    }
                    break;
                }
                default:
            }
            return true;
        }, start, end);

        if (start !== end) {
            ops.push(createRemoveRangeOp(start, end));
        }

        // Perform removals in descending order, otherwise earlier deletions will shift the positions
        // of later ops.  Because each effected interval is non-overlapping, a simple sort suffices.
        ops.sort((left, right) => right.pos1 - left.pos1);

        this.sharedString.groupOperation({
            ops,
            type: MergeTreeDeltaType.GROUP,
        });
    }

    public insertParagraph(position: number) {
        debug(`insertParagraph(${position})`);
        this.sharedString.insertMarker(position, ReferenceType.Tile, FlowDocument.paragraphProperties);
    }

    public insertLineBreak(position: number) {
        debug(`insertLineBreak(${position})`);
        this.sharedString.insertMarker(position, ReferenceType.Tile, FlowDocument.lineBreakProperties);
    }

    public insertComponent(position: number, url: string) {
        const ops = [];
        const id = randomId();

        const endMarker = new Marker(ReferenceType.NestEnd);
        endMarker.properties = { tag: "SPAN", ...FlowDocument.endRangeProperties, [reservedMarkerIdKey]: `end-${id}` };
        ops.push(createInsertSegmentOp(position, endMarker));

        const inclusionMarker = new Marker(ReferenceType.Tile);
        inclusionMarker.properties = { url, ...FlowDocument.inclusionProperties };
        ops.push(createInsertSegmentOp(position, inclusionMarker));

        const beginMarker = new Marker(ReferenceType.NestBegin);
        beginMarker.properties = {  tag: "SPAN", ...FlowDocument.beginTagProperties, [reservedMarkerIdKey]: `begin-${id}` };
        ops.push(createInsertSegmentOp(position, beginMarker));

        // Note: Insert the endMarker prior to the beginMarker to avoid needing to compensate for the
        //       change in positions.
        this.sharedString.groupOperation({
            ops,
            type: MergeTreeDeltaType.GROUP,
        });
    }

    public insertTags(tags: string[], start: number, end: number) {
        const ops = [];
        for (const tag of tags) {
            const id = randomId();

            const endMarker = new Marker(ReferenceType.NestEnd);
            endMarker.properties = { tag, ...FlowDocument.endRangeProperties, [reservedMarkerIdKey]: `end-${id}` };
            ops.push(createInsertSegmentOp(end, endMarker));

            const beginMarker = new Marker(ReferenceType.NestBegin);
            beginMarker.properties = { tag, ...FlowDocument.beginTagProperties, [reservedMarkerIdKey]: `begin-${id}` };
            ops.push(createInsertSegmentOp(start, beginMarker));

            // Increment start/end prior to inserting the next tag.
            start++;
            end++;
        }

        // Note: Insert the endMarker prior to the beginMarker to avoid needing to compensate for the
        //       change in positions.
        this.sharedString.groupOperation({
            ops,
            type: MergeTreeDeltaType.GROUP,
        });
    }

    public getStart(marker: Marker) {
        return this.getOppositeMarker(marker, /* "end".length = */ 3, "begin");
    }

    public getEnd(marker: Marker) {
        return this.getOppositeMarker(marker, /* "begin".length = */ 5, "end");
    }

    public getTags(position: number) {
        const tags = this.mergeTree.getStackContext(position, this.clientId, ["tag"]).tag;
        return tags && tags.items;
    }

    public annotate(start: number, end: number, props: PropertySet) {
        this.sharedString.annotateRange(props, start, end);
    }

    public addCssClass(start: number, end: number, ...classNames: string[]) {
        if (classNames.length > 0) {
            const newClasses = classNames.join(" ");
            this.updateCssClassList(start, end, (classList) => TokenList.set(classList, newClasses));
        }
    }

    public removeCssClass(start: number, end: number, ...classNames: string[]) {
        this.updateCssClassList(start, end,
            (classList) => classNames.reduce(
                (updatedList, className) => TokenList.unset(updatedList, className),
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

    public findTile(position: number, tileType: DocTile, preceding: boolean): { tile: ReferencePosition, pos: number } {
        return this.mergeTree.findTile(position, this.clientId, tileType as unknown as string, preceding);
    }

    public findParagraph(position: number) {
        const maybeStart = this.findTile(position, DocTile.paragraph, /* preceding: */ true);
        const start = maybeStart ? maybeStart.pos : 0;

        const maybeEnd = this.findTile(position, DocTile.paragraph, /* preceding: */ false);
        const end = maybeEnd ? maybeEnd.pos + 1 : this.length;

        return { start, end };
    }

    public visitRange(callback: LeafAction, start = 0, end = +Infinity) {
        // Early exit if passed an empty or invalid range (e.g., NaN).
        if (!(start < end)) {
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
            start,
            end);
    }

    protected async create() {
        // For 'findTile(..)', we must enable tracking of left/rightmost tiles:
        // (See: https://github.com/Microsoft/Prague/pull/1118)
        Object.assign(this.runtime, { options: Object.assign(this.runtime.options || {}, { blockUpdateMarkers: true }) });

        const text = this.runtime.createChannel("text", SharedStringExtension.Type) as SharedString;
        this.root.set("text", text);
    }

    protected async opened() {
        this.maybeSharedString = await this.root.wait("text") as SharedString;
        this.maybeSharedString.on("sequenceDelta", (...args) => { this.emit("sequenceDelta", ...args); });
        const client = this.sharedString.client;
        this.maybeClientId = client.getClientId();
        this.maybeMergeTree = client.mergeTree;
        this.readyDeferred.resolve();
    }

    private getOppositeMarker(marker: Marker, oldPrefixLength: number, newPrefix: string) {
        return this.mergeTree.idToSegment[`${newPrefix}${marker.getId().slice(oldPrefixLength)}`];
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
