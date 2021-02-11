/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { randomId, TokenList, TagName } from "@fluid-example/flow-util-lib";
import { LazyLoadedDataObject, LazyLoadedDataObjectFactory } from "@fluidframework/data-object-base";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
    createInsertSegmentOp,
    createRemoveRangeOp,
    IMergeTreeRemoveMsg,
    ISegment,
    LocalReference,
    Marker,
    MergeTreeDeltaType,
    PropertySet,
    ReferencePosition,
    ReferenceType,
    reservedMarkerIdKey,
    reservedRangeLabelsKey,
    reservedTileLabelsKey,
    TextSegment,
} from "@fluidframework/merge-tree";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import {
    SharedString,
    SharedStringSegment,
    SequenceMaintenanceEvent,
    SequenceDeltaEvent,
} from "@fluidframework/sequence";
import { ISharedDirectory, SharedDirectory } from "@fluidframework/map";
import { IFluidHTMLOptions } from "@fluidframework/view-interfaces";
import { IEvent } from "@fluidframework/common-definitions";
import { clamp, emptyArray } from "../util";
import { IHTMLAttributes } from "../util/attr";
import { documentType } from "../package";
import { debug } from "./debug";
import { SegmentSpan } from "./segmentspan";

export const enum DocSegmentKind {
    text = "text",
    paragraph = "<p>",
    lineBreak = "<br>",
    beginTags = "<t>",
    inclusion = "<?>",
    endTags = "</>",

    // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
    endOfText = "eot",
}

const tilesAndRanges = new Set([DocSegmentKind.paragraph, DocSegmentKind.lineBreak, DocSegmentKind.beginTags, DocSegmentKind.inclusion]);

const enum Workaround { checkpoint = "*" }

export const enum DocTile {
    paragraph = DocSegmentKind.paragraph,
    checkpoint = Workaround.checkpoint,
}

export const getDocSegmentKind = (segment: ISegment): DocSegmentKind => {
    // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
    if (segment === endOfTextSegment) {
        return DocSegmentKind.endOfText;
    }

    if (TextSegment.is(segment)) {
        return DocSegmentKind.text;
    } else if (Marker.is(segment)) {
        const markerType = segment.refType;
        switch (markerType) {
            case ReferenceType.Tile:
            case ReferenceType.Tile | ReferenceType.NestBegin:

                const kind = (segment.hasRangeLabels() ? segment.getRangeLabels()[0] :
                    segment.getTileLabels()[0]) as DocSegmentKind;

                assert(tilesAndRanges.has(kind), `Unknown tile/range label '${kind}'.`);

                return kind;
            default:
                assert(markerType === (ReferenceType.Tile | ReferenceType.NestEnd));

                // Ensure that 'nestEnd' range label matches the 'beginTags' range label (otherwise it
                // will not close the range.)
                assert(segment.getRangeLabels()[0] === DocSegmentKind.beginTags, `Unknown refType '${markerType}'.`);
                return DocSegmentKind.endTags;
        }
    }
};

const empty = Object.freeze({});

export const getCss = (segment: ISegment): Readonly<{ style?: string, classList?: string }> => segment.properties || empty;

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
export const getComponentOptions = (segment: ISegment): IFluidHTMLOptions | undefined => (segment.properties && segment.properties.componentOptions) || empty;

type LeafAction = (position: number, segment: ISegment, startOffset: number, endOffset: number) => boolean;

/**
 * Used by 'FlowDocument.visitRange'.  Uses the otherwise unused 'accum' object to pass the
 * leaf action callback, allowing us to simplify the the callback signature and while (maybe)
 * avoiding unnecessary allocation to wrap the given 'callback'.
 */
const accumAsLeafAction = (
    segment: ISegment,
    position: number,
    refSeq: number,
    clientId: number,
    startOffset: number,
    endOffset: number,
    accum?: LeafAction,
) => (accum)(position, segment, startOffset, endOffset);

// TODO: We need the ability to create LocalReferences to the end of the document. Our
//       workaround creates a LocalReference with an 'undefined' segment that is never
//       inserted into the MergeTree.  We then special case this segment in localRefToPosition,
//       addLocalRef, removeLocalRef, etc.
//
//       Note, we use 'undefined' for our sentinel value to also workaround the case where
//       the user deletes the entire sequence.  (The SlideOnRemove references end up pointing
//       to undefined segments.)
//
//       See: https://github.com/microsoft/FluidFramework/issues/86
const endOfTextSegment = undefined as unknown as SharedStringSegment;

export interface IFlowDocumentEvents extends IEvent {
    (event: "sequenceDelta", listener: (event: SequenceDeltaEvent, target: SharedString) => void);
    (event: "maintenance", listener: (event: SequenceMaintenanceEvent, target: SharedString) => void);
}

export class FlowDocument extends LazyLoadedDataObject<ISharedDirectory, IFlowDocumentEvents> {
    private static readonly factory = new LazyLoadedDataObjectFactory<FlowDocument>(
        documentType,
        FlowDocument,
        /* root: */ SharedDirectory.getFactory(),
        [SharedString.getFactory()]);

    public static getFactory(): IFluidDataStoreFactory { return FlowDocument.factory; }

    public static async create(parentContext: IFluidDataStoreContext, props?: any) {
        return FlowDocument.factory.create(parentContext, props);
    }

    private get sharedString() { return this.maybeSharedString; }

    public get length() {
        return this.sharedString.getLength();
    }

    private static readonly paragraphProperties = Object.freeze({ [reservedTileLabelsKey]: [DocSegmentKind.paragraph, DocTile.checkpoint], tag: TagName.p });
    private static readonly lineBreakProperties = Object.freeze({ [reservedTileLabelsKey]: [DocSegmentKind.lineBreak, DocTile.checkpoint] });
    private static readonly inclusionProperties = Object.freeze({ [reservedTileLabelsKey]: [DocSegmentKind.inclusion, DocTile.checkpoint] });
    private static readonly tagsProperties = Object.freeze({
        [reservedTileLabelsKey]: [DocSegmentKind.inclusion, DocTile.checkpoint],
        [reservedRangeLabelsKey]: [DocSegmentKind.beginTags],
    });

    private maybeSharedString?: SharedString;

    public create() {
        // For 'findTile(..)', we must enable tracking of left/rightmost tiles:
        Object.assign(this.runtime, { options: { ...(this.runtime.options || {}), blockUpdateMarkers: true } });

        this.maybeSharedString = SharedString.create(this.runtime, "text");
        this.root.set("text", this.maybeSharedString.handle);
        if (this.maybeSharedString !== undefined) {
            this.forwardEvent(this.maybeSharedString, "sequenceDelta", "maintenance");
        }
    }

    public async load() {
        // For 'findTile(..)', we must enable tracking of left/rightmost tiles:
        Object.assign(this.runtime, { options: { ...(this.runtime.options || {}), blockUpdateMarkers: true } });

        const handle = await this.root.wait<IFluidHandle<SharedString>>("text");
        this.maybeSharedString = await handle.get();
        if (this.maybeSharedString !== undefined) {
            this.forwardEvent(this.maybeSharedString, "sequenceDelta", "maintenance");
        }
    }

    public async getComponentFromMarker(marker: Marker) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return marker.properties.handle.get();
    }

    public getSegmentAndOffset(position: number) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        return position === this.length
            ? { segment: endOfTextSegment, offset: 0 }
            : this.sharedString.getContainingSegment(position);
    }

    public getPosition(segment: ISegment) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        return segment === endOfTextSegment
            ? this.length
            : this.sharedString.getPosition(segment);
    }

    public addLocalRef(position: number) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        if (position >= this.length) {
            return this.sharedString.createPositionReference(endOfTextSegment, 0, ReferenceType.Transient);
        }

        const { segment, offset } = this.getSegmentAndOffset(position);
        const localRef = this.sharedString.createPositionReference(segment, offset, ReferenceType.SlideOnRemove);

        return localRef;
    }

    public removeLocalRef(localRef: LocalReference) {
        const segment = localRef.getSegment();

        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        if (segment !== endOfTextSegment) {
            this.sharedString.removeLocalReference(localRef);
        }
    }

    public localRefToPosition(localRef: LocalReference) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        if (localRef.getSegment() === endOfTextSegment) {
            return this.length;
        }

        return localRef.toPosition();
    }

    public insertText(position: number, text: string) {
        debug(`insertText(${position},"${text}")`);
        this.sharedString.insertText(position, text);
    }

    public replaceWithText(start: number, end: number, text: string) {
        debug(`replaceWithText(${start}, ${end}, "${text}")`);
        this.sharedString.replaceText(start, end, text);
    }

    public remove(start: number, end: number) {
        let _start = start;
        debug(`remove(${_start},${end})`);
        const ops: IMergeTreeRemoveMsg[] = [];

        this.visitRange((position: number, segment: ISegment) => {
            switch (getDocSegmentKind(segment)) {
                case DocSegmentKind.beginTags: {
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
                case DocSegmentKind.endTags: {
                    // The end tag should be preserved unless the start tag is also included in
                    // the removed range.  Check if range being removed includes the start tag.
                    const startTag = this.getStart(segment as Marker);
                    const startPos = this.getPosition(startTag);

                    // Note: The start tag must appear before the position of the current end tag.
                    console.assert(startPos < position);

                    if (!(_start <= startPos)) {
                        // If not, remove any positions up to, but excluding the current segment
                        // and adjust the pending removal range to just after this marker.
                        debug(`  exclude end tag '</${segment.properties.tag}>' at ${position}.`);

                        // If the preserved end tag is at the beginning of the removal range, no remove op
                        // is necessary.  Just skip over it.
                        if (_start !== position) {
                            ops.push(createRemoveRangeOp(_start, position));
                        }
                        _start = position + 1;
                    }
                    break;
                }
                default:
                    break;
            }
            return true;
        }, _start, end);

        // If there is a non-empty span remaining, generate its remove op now.
        if (_start !== end) {
            ops.push(createRemoveRangeOp(_start, end));
        }

        // Perform removals in descending order, otherwise earlier deletions will shift the positions
        // of later ops.  Because each effected interval is non-overlapping, a simple sort suffices.
        ops.sort((left, right) => right.pos1 - left.pos1);

        this.sharedString.groupOperation({
            ops,
            type: MergeTreeDeltaType.GROUP,
        });
    }

    public insertParagraph(position: number, tag?: TagName) {
        debug(`insertParagraph(${position})`);
        this.sharedString.insertMarker(position, ReferenceType.Tile, Object.freeze({ ...FlowDocument.paragraphProperties, tag }));
    }

    public insertLineBreak(position: number) {
        debug(`insertLineBreak(${position})`);
        this.sharedString.insertMarker(position, ReferenceType.Tile, FlowDocument.lineBreakProperties);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public insertComponent(position: number, handle: IFluidHandle, view: string, componentOptions: object, style?: string, classList?: string[]) {
        this.sharedString.insertMarker(position, ReferenceType.Tile, Object.freeze({
            ...FlowDocument.inclusionProperties,
            componentOptions, handle, style, classList: classList && classList.join(" "), view,
        }));
    }

    public setFormat(position: number, tag: TagName) {
        const { start } = this.findParagraph(position);

        // If inside an existing paragraph marker, update it with the new formatting tag.
        if (start < this.length) {
            const pgSeg = this.getSegmentAndOffset(start).segment;
            if (getDocSegmentKind(pgSeg) === DocSegmentKind.paragraph) {
                pgSeg.properties.tag = tag;
                this.annotate(start, start + 1, { tag });
                return;
            }
        }

        // Otherwise, insert a new paragraph marker.
        this.insertParagraph(start, tag);
    }

    public insertTags(tags: TagName[], start: number, end = start) {
        const ops = [];
        const id = randomId();

        const endMarker = new Marker(ReferenceType.Tile | ReferenceType.NestEnd);
        endMarker.properties = Object.freeze({ ...FlowDocument.tagsProperties, [reservedMarkerIdKey]: `end-${id}` });
        ops.push(createInsertSegmentOp(end, endMarker));

        const beginMarker = new Marker(ReferenceType.Tile | ReferenceType.NestBegin);
        beginMarker.properties = Object.freeze({ ...FlowDocument.tagsProperties, tags, [reservedMarkerIdKey]: `begin-${id}` });
        ops.push(createInsertSegmentOp(start, beginMarker));

        // Note: Insert the endMarker prior to the beginMarker to avoid needing to compensate for the
        //       change in positions.
        this.sharedString.groupOperation({
            ops,
            type: MergeTreeDeltaType.GROUP,
        });
    }

    public getTags(position: number): Readonly<Marker[]> {
        const tags = this.sharedString.getStackContext(position, [DocSegmentKind.beginTags])[DocSegmentKind.beginTags];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return (tags && tags.items) || emptyArray;
    }

    public getStart(marker: Marker) {
        return this.getOppositeMarker(marker, /* "end".length = */ 3, "begin");
    }

    public getEnd(marker: Marker) {
        return this.getOppositeMarker(marker, /* "begin".length = */ 5, "end");
    }

    public annotate(start: number, end: number, props: PropertySet) {
        this.sharedString.annotateRange(start, end, props);
    }

    public setCssStyle(start: number, end: number, style: string) {
        this.sharedString.annotateRange(start, end, { style });
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

    public setAttr(start: number, end: number, attr: IHTMLAttributes) {
        this.sharedString.annotateRange(start, end, { attr });
    }

    public findTile(position: number, tileType: DocTile, preceding: boolean): { tile: ReferencePosition, pos: number } {
        return this.sharedString.findTile(position, tileType as unknown as string, preceding);
    }

    public findParagraph(position: number) {
        const maybeStart = this.findTile(position, DocTile.paragraph, /* preceding: */ true);
        const start = maybeStart ? maybeStart.pos : 0;

        const maybeEnd = this.findTile(position, DocTile.paragraph, /* preceding: */ false);
        const end = maybeEnd ? maybeEnd.pos + 1 : this.length;

        return { start, end };
    }

    public visitRange(callback: LeafAction, start = 0, end = this.length) {
        const _end = clamp(0, end, this.length);
        const _start = clamp(0, start, end);

        // Early exit if passed an empty or invalid range (e.g., NaN).
        if (!(_start < _end)) {
            return;
        }

        // Note: We pass the leaf callback action as the accumulator, and then use the 'accumAsLeafAction'
        //       actions to invoke the accum for each leaf.  (Paranoid micro-optimization that attempts to
        //       avoid allocation while simplifying the 'LeafAction' signature.)
        this.sharedString.walkSegments(accumAsLeafAction, _start, _end, callback);
    }

    public getText(start?: number, end?: number): string {
        return this.sharedString.getText(start, end);
    }

    public toString() {
        const s: string[] = [];
        this.visitRange((position, segment) => {
            let _segment = segment;
            const kind = getDocSegmentKind(_segment);
            switch (kind) {
                case DocSegmentKind.text:
                    s.push((_segment as TextSegment).text);
                    break;
                case DocSegmentKind.beginTags:
                    for (const tag of _segment.properties.tags) {
                        s.push(`<${tag}>`);
                    }
                    break;
                case DocSegmentKind.endTags:
                    _segment = this.getStart(_segment as Marker);
                    const tags = _segment.properties.tags.slice().reverse();
                    for (const tag of tags) {
                        s.push(`</${tag}>`);
                    }
                    break;
                default:
                    s.push(kind);
            }
            return true;
        });
        return s.join("");
    }

    private getOppositeMarker(marker: Marker, oldPrefixLength: number, newPrefix: string) {
        return this.sharedString.getMarkerFromId(`${newPrefix}${marker.getId().slice(oldPrefixLength)}`);
    }

    private updateCssClassList(start: number, end: number, callback: (classList: string) => string) {
        const updates: { span: SegmentSpan, classList: string }[] = [];

        this.visitRange((position, segment, startOffset, endOffset) => {
            const oldList = getCss(segment).classList;
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
            this.annotate(span.startPosition, span.endPosition, { classList });
        }
    }
}
