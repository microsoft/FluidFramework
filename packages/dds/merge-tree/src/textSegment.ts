/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseSegment, ISegment, Marker } from "./mergeTreeNodes";
import { IJSONSegment } from "./ops";
import { PropertySet } from "./properties";
import { LocalReferenceCollection } from "./localReference";

// Maximum length of text segment to be considered to be merged with other segment.
// Maximum segment length is at least 2x of it (not taking into account initial segment creation).
// The bigger it is, the more expensive it is to break segment into sub-segments (on edits)
// The smaller it is, the more segments we have in snapshots (and in memory) - it's more expensive to load snapshots.
// Small number also makes ReplayTool produce false positives ("same" snapshots have slightly different binary
// representations).  More measurements needs to be done, but it's very likely the right spot is somewhere between
// 1K-2K mark.  That said, we also break segments on newline and there are very few segments that are longer than 256
// because of it.  Must be an even number
const TextSegmentGranularity = 256;

export interface IJSONTextSegment extends IJSONSegment {
    text: string;
}

export class TextSegment extends BaseSegment {
    public static readonly type = "TextSegment";

    public static is(segment: ISegment): segment is TextSegment {
        return segment.type === TextSegment.type;
    }

    public static make(text: string, props?: PropertySet) {
        const seg = new TextSegment(text);
        if (props) {
            seg.addProperties(props);
        }
        return seg;
    }

    public static fromJSONObject(spec: any) {
        if (typeof spec === "string") {
            return new TextSegment(spec);
        } else if (spec && typeof spec === "object" && "text" in spec) {
            const textSpec = spec as IJSONTextSegment;
            return TextSegment.make(textSpec.text, textSpec.props as PropertySet);
        }
        return undefined;
    }

    public readonly type = TextSegment.type;

    constructor(public text: string) {
        super();
        this.cachedLength = text.length;
    }

    public toJSONObject() {
        // To reduce snapshot/ops size, we serialize a TextSegment as a plain 'string' if it is
        // not annotated.
        return this.properties
            ? { text: this.text, props: this.properties }
            : this.text;
    }

    public clone(start = 0, end?: number) {
        const text = this.text.substring(start, end);
        const b = TextSegment.make(text, this.properties);
        this.cloneInto(b);
        return b;
    }

    public canAppend(segment: ISegment): boolean {
        return !this.text.endsWith("\n")
            && TextSegment.is(segment)
            && (this.cachedLength <= TextSegmentGranularity ||
                segment.cachedLength <= TextSegmentGranularity);
    }

    public toString() {
        return this.text;
    }

    public append(segment: ISegment) {
        if (TextSegment.is(segment)) {
            // Note: Must call 'appendLocalRefs' before modifying this segment's length as
            // 'this.cachedLength' is used to adjust the offsets of the local refs.
            LocalReferenceCollection.append(this, segment);

            this.text += segment.text;
            this.cachedLength = this.text.length;
        } else {
            throw new Error("can only append text segment");
        }
    }

    // TODO: retain removed text for undo
    // returns true if entire string removed
    public removeRange(start: number, end: number) {
        let remnantString = "";
        const len = this.text.length;
        if (start > 0) {
            remnantString += this.text.substring(0, start);
        }
        if (end < len) {
            remnantString += this.text.substring(end);
        }
        this.text = remnantString;
        this.cachedLength = remnantString.length;
        return (remnantString.length === 0);
    }

    protected createSplitSegmentAt(pos: number) {
        if (pos > 0) {
            const remainingText = this.text.substring(pos);
            this.text = this.text.substring(0, pos);
            this.cachedLength = this.text.length;
            const leafSegment = new TextSegment(remainingText);
            return leafSegment;
        }
    }
}

export interface IMergeTreeTextHelper{
    /**
     * @deprecated - If consuming via sequence, use `getTextAndMarkers` exported from \@fluidframework/sequence.
     * Otherwise, define your own accumulation model and use `Client.walkSegments`.
     */
    getTextAndMarkers(refSeq: number, clientId: number, label: string, start?: number, end?: number): {
        parallelText: string[];
        parallelMarkers: Marker[]; };
    getText(refSeq: number, clientId: number, placeholder: string, start?: number, end?: number): string;
}
