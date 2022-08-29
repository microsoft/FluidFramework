/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIntegerRange } from "./base";
import { ISegment, Marker } from "./mergeTreeNodes";
import { refHasTileLabel } from "./referencePositions";
import { MergeTree } from "./mergeTree";
import { IMergeTreeTextHelper, TextSegment } from "./textSegment";

interface ITextAccumulator {
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

/**
 * @deprecated  for internal use only. public export will be removed.
 * @internal
 */
export class MergeTreeTextHelper implements IMergeTreeTextHelper {
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
            let beginTags = "";
            let endTags = "";
            if (isTextAndMarkerAccumulator(accumText)) {
                // TODO: let clients pass in function to get tag
                const tags = [] as string[];
                const initTags = [] as string[];

                if (segment.properties?.["font-weight"]) {
                    tags.push("b");
                }
                if (segment.properties?.["text-decoration"]) {
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
                if (refHasTileLabel(marker, accumText.parallelMarkerLabel)) {
                    accumText.parallelMarkers.push(marker);
                    accumText.parallelText.push(accumText.textSegment.text);
                    accumText.textSegment.text = "";
                }
            }
        }

        return true;
    };
}
