/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIntegerRange } from "./base";
import { BaseSegment, glc, ISegment, Marker, MergeTree } from "./mergeTree";
import * as ops from "./ops";
import * as Properties from "./properties";
import { LocalReferenceCollection } from "./localReference";

export interface IJSONTextSegment extends ops.IJSONSegment {
    text: string;
}

export class TextSegment extends BaseSegment {
    public static readonly type = "TextSegment";

    public static is(segment: ISegment): segment is TextSegment {
        return segment.type === TextSegment.type;
    }

    public static make(text: string, props?: Properties.PropertySet) {
        const tseg = new TextSegment(text);
        if (props) {
            tseg.addProperties(props);
        }
        return tseg;
    }

    public static fromJSONObject(spec: any) {
        if (typeof spec === "string") {
            return new TextSegment(spec);
        } else if (spec && typeof spec === "object" && "text" in spec) {
            const textSpec = spec as IJSONTextSegment;
            return TextSegment.make(textSpec.text, textSpec.props as Properties.PropertySet);
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

    public canAppend(segment: ISegment) {
        return !this.text.endsWith("\n")
            && TextSegment.is(segment)
            && (this.cachedLength <= MergeTree.TextSegmentGranularity ||
                segment.cachedLength <= MergeTree.TextSegmentGranularity);
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

interface ITextAccumulator  {
    textSegment: TextSegment;
    placeholder?: string;
    parallelArrays?: boolean;
}

interface ITextAndMarkerAccumulator extends ITextAccumulator {
    parallelArrays: true;
    parallelText: string[];
    parallelMarkers: Marker[];
    parallelMarkerLabel: string;
    tagsInProgress: string[];
}

function isTextAndMarkerAccumulator(accum: ITextAccumulator): accum is ITextAndMarkerAccumulator {
    return accum.parallelArrays === true;
}

type ITextAccumulatorType = ITextAccumulator | ITextAndMarkerAccumulator;
export class MergeTreeTextHelper {
    constructor(private readonly mergeTree: MergeTree) { }

    public getTextAndMarkers(refSeq: number, clientId: number, label: string, start?: number, end?: number) {
        const range = this.getValidRange(start, end, refSeq, clientId);
        const accum: ITextAndMarkerAccumulator = {
            parallelArrays: true,
            parallelMarkerLabel: label,
            parallelMarkers: [],
            parallelText: [],
            tagsInProgress: [],
            textSegment: new TextSegment(""),
        };

        if (MergeTree.traceGatherText) {
            console.log(
                `get text on cli ${glc(this.mergeTree, this.mergeTree.collabWindow.clientId)} ` +
                `ref cli ${glc(this.mergeTree, clientId)} refSeq ${refSeq}`);
        }
        this.mergeTree.mapRange<ITextAndMarkerAccumulator>(
            { leaf: this.gatherText },
            refSeq,
            clientId,
            accum,
            range.start,
            range.end);

        return { parallelText: accum.parallelText, parallelMarkers: accum.parallelMarkers };
    }

    public getText(refSeq: number, clientId: number, placeholder = "", start?: number, end?: number) {
        const range = this.getValidRange(start, end, refSeq, clientId);

        const accum: ITextAccumulator = { textSegment: new TextSegment(""), placeholder };

        if (MergeTree.traceGatherText) {
            console.log(
                `get text on cli ${glc(this.mergeTree, this.mergeTree.collabWindow.clientId)} ` +
                `ref cli ${glc(this.mergeTree, clientId)} refSeq ${refSeq}`);
        }
        this.mergeTree.mapRange<ITextAccumulator>(
            { leaf: this.gatherText },
            refSeq,
            clientId,
            accum,
            range.start,
            range.end);
        return accum.textSegment.text;
    }

    private getValidRange(
        start: number | undefined,
        end: number | undefined,
        refSeq: number,
        clientId: number,
    ): IIntegerRange {
        const range: IIntegerRange = {
            end: end ?? this.mergeTree.getLength(refSeq, clientId),
            start: start ?? 0,
        };
        return range;
    }

    private readonly gatherText = (segment: ISegment, pos: number, refSeq: number, clientId: number, start: number,
        end: number, accumText: ITextAccumulatorType) => {
        let _start = start;
        if (TextSegment.is(segment)) {
            if (MergeTree.traceGatherText) {
                console.log(
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    `@cli ${this.mergeTree.getLongClientId!(this.mergeTree.collabWindow.clientId)} ` +
                    `gather seg seq ${segment.seq} rseq ${segment.removedSeq} text ${segment.text}`);
            }
            let beginTags = "";
            let endTags = "";
            if (isTextAndMarkerAccumulator(accumText)) {
                // TODO: let clients pass in function to get tag
                const tags = [] as string[];
                const initTags = [] as string[];

                if (segment.properties && (segment.properties["font-weight"])) {
                    tags.push("b");
                }
                if (segment.properties && (segment.properties["text-decoration"])) {
                    tags.push("u");
                }
                const remTags = [] as string[];
                if (tags.length > 0) {
                    for (const tag of tags) {
                        if (!accumText.tagsInProgress.includes(tag)) {
                            beginTags += `<${tag}>`;
                            initTags.push(tag);
                        }
                    }
                    for (const accumTag of accumText.tagsInProgress) {
                        if (!tags.includes(accumTag)) {
                            endTags += `</${accumTag}>`;
                            remTags.push(accumTag);
                        }
                    }
                    for (const initTag of initTags.reverse()) {
                        accumText.tagsInProgress.push(initTag);
                    }
                } else {
                    for (const accumTag of accumText.tagsInProgress) {
                        endTags += `</${accumTag}>`;
                        remTags.push(accumTag);
                    }
                }
                for (const remTag of remTags) {
                    const remdex = accumText.tagsInProgress.indexOf(remTag);
                    if (remdex >= 0) {
                        accumText.tagsInProgress.splice(remdex, 1);
                    }
                }
            }
            accumText.textSegment.text += endTags;
            accumText.textSegment.text += beginTags;
            if ((_start <= 0) && (end >= segment.text.length)) {
                accumText.textSegment.text += segment.text;
            } else {
                if (_start < 0) {
                    _start = 0;
                }
                if (end >= segment.text.length) {
                    accumText.textSegment.text += segment.text.substring(_start);
                } else {
                    accumText.textSegment.text += segment.text.substring(_start, end);
                }
            }
        } else {
            if (accumText.placeholder && (accumText.placeholder.length > 0)) {
                if (accumText.placeholder === "*") {
                    const marker = segment as Marker;
                    accumText.textSegment.text += `\n${marker.toString()}`;
                } else {
                    for (let i = 0; i < segment.cachedLength; i++) {
                        accumText.textSegment.text += accumText.placeholder;
                    }
                }
            } else if (isTextAndMarkerAccumulator(accumText)) {
                const marker = segment as Marker;
                if (marker.hasTileLabel(accumText.parallelMarkerLabel)) {
                    accumText.parallelMarkers.push(marker);
                    accumText.parallelText.push(accumText.textSegment.text);
                    accumText.textSegment.text = "";
                }
            }
        }

        return true;
    };
}
