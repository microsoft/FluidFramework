/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { ReferenceType } from "@microsoft/fluid-merge-tree";
import { SharedString } from "@microsoft/fluid-sequence";
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
/**
 * Used by 'FlowDocument.visitRange'.  Uses the otherwise unused 'accum' object to pass the
 * leaf action callback, allowing us to simplify the the callback signature and (maybe)
 * avoiding an unnecessary allocation to wrap the given 'callback'.
 */
const accumAsLeafAction = (segment, position, refSeq, clientId, startOffset, endOffset, accum) => (accum)(position, segment, startOffset, endOffset);
const localAnnotationSym = Symbol("SourceDocument.localAnnotation");
export class SourceDocument extends PrimedComponent {
    constructor(runtime, context) {
        super(runtime, context);
    }
    get sharedString() { return this.maybeSharedString; }
    get length() { return this.sharedString.getLength(); }
    getSegmentAndOffset(position) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        return position === this.length
            ? endOfTextSegmentAndOffset
            : this.sharedString.getContainingSegment(position);
    }
    getPosition(segment) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        return segment === endOfTextSegment
            ? this.length
            : this.sharedString.getPosition(segment);
    }
    addLocalRef(position) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        if (position >= this.length) {
            return this.sharedString.createPositionReference(endOfTextSegment, 0, ReferenceType.Transient);
        }
        const { segment, offset } = this.getSegmentAndOffset(position);
        const localRef = this.sharedString.createPositionReference(segment, offset, ReferenceType.SlideOnRemove);
        return localRef;
    }
    removeLocalRef(localRef) {
        const segment = localRef.getSegment();
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        if (segment !== endOfTextSegment) {
            this.sharedString.removeLocalReference(localRef);
        }
    }
    localRefToPosition(localRef) {
        // Special case for LocalReference to end of document.  (See comments on 'endOfTextSegment').
        return localRef.getSegment() === endOfTextSegment
            ? this.length
            : localRef.toPosition();
    }
    insertText(position, text) {
        debug(`insertText(${position},"${text}")`);
        this.sharedString.insertText(position, text);
    }
    replaceWithText(start, end, text) {
        debug(`replaceWithText(${start}, ${end}, "${text}")`);
        this.sharedString.replaceText(start, end, text);
    }
    remove(start, end) {
        debug(`remove(${start},${end})`);
        this.sharedString.removeRange(start, end);
    }
    visitRange(callback, start = 0, end = this.length) {
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
    on(event, listener) {
        this.maybeSharedString.on(event, listener);
        return this;
    }
    off(event, listener) {
        this.maybeSharedString.removeListener(event, listener);
        return this;
    }
    /* eslint-enable max-len */
    getPreviousSegment(current) {
        const position = this.getPosition(current);
        return position > 0
            ? this.getSegmentAndOffset(position - 1).segment
            : undefined;
    }
    annotate(start, end, props) {
        this.sharedString.annotateRange(start, end, props);
    }
    annotateLocal(start, end, props) {
        this.ensureIntervalBoundary(start);
        this.ensureIntervalBoundary(end);
        this.visitRange((_, segment) => {
            segment[localAnnotationSym] = Object.assign(Object.assign({}, segment[localAnnotationSym]), props);
            return true;
        }, start, end);
    }
    async componentInitializingFirstTime() {
        this.root.set("text", SharedString.create(this.runtime, "text").handle);
    }
    async componentHasInitialized() {
        this.maybeSharedString = await (await this.root.wait("text")).get();
    }
    ensureIntervalBoundary(position) {
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
//# sourceMappingURL=document.js.map