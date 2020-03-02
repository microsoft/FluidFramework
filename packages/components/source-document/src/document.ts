/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISegment, LocalReference, PropertySet, ReferenceType } from "@microsoft/fluid-merge-tree";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SequenceDeltaEvent, SequenceMaintenanceEvent, SharedString } from "@microsoft/fluid-sequence";
import { debug } from "./debug";
// eslint-disable-next-line import/no-internal-modules
import { clamp } from "./util/clamp";

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
const endOfTextSegment = undefined;
const endOfTextSegmentAndOffset = Object.freeze({ segment: endOfTextSegment, offset: 0 });

type LeafAction = (position: number, segment: ISegment, startOffset: number, endOffset: number) => boolean;

/**
 * Used by 'FlowDocument.visitRange'.  Uses the otherwise unused 'accum' object to pass the
 * leaf action callback, allowing us to simplify the the callback signature and (maybe)
 * avoiding an unnecessary allocation to wrap the given 'callback'.
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

const localAnnotationSym = Symbol("SourceDocument.localAnnotation");

export class SourceDocument extends PrimedComponent {
    private get sharedString() { return this.maybeSharedString; }
    public get length() { return this.sharedString.getLength(); }

    private maybeSharedString?: SharedString;

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    public getSegmentAndOffset(position: number) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        return position === this.length
            ? endOfTextSegmentAndOffset
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
        return localRef.getSegment() === endOfTextSegment
            ? this.length
            : localRef.toPosition();
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
        debug(`remove(${start},${end})`);
        this.sharedString.removeRange(start, end);
    }

    public visitRange(callback: LeafAction, start = 0, end = this.length) {
        // eslint-disable-next-line no-param-reassign
        end = clamp(0, end, this.length);
        // eslint-disable-next-line no-param-reassign
        start = clamp(0, start, end);

        // Early exit if passed an empty or invalid range (e.g., NaN).
        if (!(start < end)) {
            return;
        }

        // Note: We pass the leaf callback action as the accumulator, and then use the 'accumAsLeafAction'
        //       actions to invoke the accum for each leaf.  (Paranoid micro-optimization that attempts to
        //       avoid allocation while simplifying the 'LeafAction' signature.)
        this.sharedString.walkSegments(accumAsLeafAction, start, end, callback);
    }

    /* eslint-disable max-len */
    public on(event: "maintenance", listener: (event: SequenceMaintenanceEvent, target: SharedString, ...args: any[]) => void): this;
    public on(event: "sequenceDelta", listener: (event: SequenceDeltaEvent, target: SharedString, ...args: any[]) => void): this;
    public on(event: "maintenance" | "sequenceDelta", listener: (event: any, target: SharedString, ...args: any[]) => void): this {
        this.maybeSharedString.on(event, listener);
        return this;
    }

    public off(event: "maintenance", listener: (event: SequenceMaintenanceEvent, target: SharedString, ...args: any[]) => void): this;
    public off(event: "sequenceDelta", listener: (event: SequenceDeltaEvent, target: SharedString, ...args: any[]) => void): this;
    public off(event: "maintenance" | "sequenceDelta", listener: (event: any, target: SharedString, ...args: any[]) => void): this {
        this.maybeSharedString.removeListener(event, listener);
        return this;
    }
    /* eslint-enable max-len */

    public getPreviousSegment(current: ISegment) {
        const position = this.getPosition(current);
        return position > 0
            ? this.getSegmentAndOffset(position - 1).segment
            : undefined;
    }

    public annotate(start: number, end: number, props: PropertySet) {
        this.sharedString.annotateRange(start, end, props);
    }

    public annotateLocal(start: number, end: number, props: PropertySet) {
        this.ensureIntervalBoundary(start);
        this.ensureIntervalBoundary(end);

        this.visitRange((_, segment) => {
            segment[localAnnotationSym] = { ...segment[localAnnotationSym], ...props };
            return true;
        }, start, end);
    }

    protected async componentInitializingFirstTime() {
        this.root.set("text", SharedString.create(this.runtime, "text").handle);
    }

    protected async componentHasInitialized() {
        this.maybeSharedString = await (await this.root.wait<IComponentHandle<SharedString>>("text")).get();
    }

    private ensureIntervalBoundary(position: number) {
        // Ensure this segment will not coalesce by annotating with a unique id, if it doesn't have one already.
        let { segment } = this.getSegmentAndOffset(position);
        const tid = segment.properties && segment.properties.tid;
        if (!tid) {
            // tslint:disable-next-line:insecure-random
            this.annotate(position, position + 1, { tid: Math.random().toString(36).slice(2) });

            // Annotating may have caused the segment to split.  Retrieve it again.
            segment = this.getSegmentAndOffset(position).segment;
        }
    }
}
