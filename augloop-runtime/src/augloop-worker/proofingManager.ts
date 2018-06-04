import { SharedString } from "@prague/routerlicious/dist/shared-string";
import * as winston from "winston";
import { AugLoopRuntime, IAugResult } from "../augloop-runtime";
import { ISlice } from "./definitons";
import { ParagrapgSlicer } from "./paragraphSlicer";
import { SliceManager } from "./sliceManager";

export interface ICritique {
    categoryTitle: string;
    explanation: string;
    start: number;
    length: number;
    suggestions: any[];
}

export interface IAnnotationRange {
    annotation: IAnnotation;
    begin: number;
    end: number;
}

export interface IAnnotation {
    text: string;
    alternates: ISuggestion[];
    color: string;
    explanation: string;
}

export interface ISuggestion {
    text: string;
    invDistance: number;
    val: number;
}

export class ProofingManager {
    private sliceManager: SliceManager;
    constructor(private root: SharedString, private runtime: AugLoopRuntime) {
    }

    public run() {
        this.root.loaded.then(() => {
            const slicer = new ParagrapgSlicer(this.root);
            this.sliceManager = new SliceManager(this.root, this.runtime, this.applyInsight);
            this.sliceManager.on("error", (error) => {
                winston.error(error);
            });
            slicer.on("slice", (slice: ISlice) => {
                if (slice.text.length > 0) {
                    this.sliceManager.submit(slice.range.begin, slice.range.end, slice.text);
                }
            });
            slicer.run();
        });
    }

    private applyInsight(result: IAugResult) {
        const startPos = result.input.begin;
        const content = result.input.content;
        const endPos = startPos + content.length;
        const critiques: ICritique[] = result.output.critiques;
        const annotationRanges: IAnnotationRange[] = [];

        // No critiques from spellchecker service. Clear the whole paragraph.
        if (critiques === undefined || critiques.length === 0) {
            annotationRanges.push({
                annotation: null,
                begin: startPos,
                end: endPos,
            });
            return annotationRanges;
        }

        // Go through each critique and create annotation ranges.
        let runningStart = startPos;
        for (const critique of critiques) {
            const localStartOffset = critique.start;
            const localEndOffset = localStartOffset + critique.length;
            const origWord = content.substring(localStartOffset, localEndOffset);
            const globalStartOffset = startPos + localStartOffset;
            const globalEndOffset = startPos + localEndOffset;
            const alternates: ISuggestion[] = [];

            // Correctly spelled range. Send null and update runningStart.
            if (runningStart < globalStartOffset) {
                annotationRanges.push({
                    annotation: null,
                    begin: globalStartOffset,
                    end: globalEndOffset,
                });
            }
            runningStart = globalEndOffset;

            // Spelling error but no suggestions found. Continue to next critique.
            if (critique.suggestions.length === 0 || critique.suggestions[0].text === "No suggestions") {
                if (critique.categoryTitle === "Grammar") {
                    annotationRanges.push({
                        annotation: { text: origWord, alternates, color: "paulgreen", explanation: null},
                        begin: globalStartOffset,
                        end: globalEndOffset,
                    });
                } else if (critique.categoryTitle === "Spelling") {
                    annotationRanges.push({
                        annotation: { text: origWord, alternates, color: "paul", explanation: null},
                        begin: globalStartOffset,
                        end: globalEndOffset,
                    });
                } else {
                    annotationRanges.push({
                        annotation: { text: origWord, alternates, color: "paulgolden", explanation: null },
                        begin: globalStartOffset,
                        end: globalEndOffset,
                    });
                }
                continue;
            }
            // Suggestions found. Create annotation ranges.
            for (let i = 0; i < Math.min(7, critique.suggestions.length); ++i) {
                alternates.push({ text: critique.suggestions[i].text, invDistance: i, val: i });
            }
            if (critique.categoryTitle === "Grammar") {
                annotationRanges.push({
                    annotation: { text: origWord, alternates, color: "paulgreen", explanation: critique.explanation },
                    begin: globalStartOffset,
                    end: globalEndOffset,
                });
            } else if (critique.categoryTitle === "Spelling") {
                annotationRanges.push({
                    annotation: { text: origWord, alternates, color: "paul", explanation: null },
                    begin: globalStartOffset,
                    end: globalEndOffset,
                });
            } else {
                annotationRanges.push({
                    annotation: { text: origWord, alternates, color: "paulgolden", explanation: critique.explanation },
                    begin: globalStartOffset,
                    end: globalEndOffset,
                });
            }
        }
        // No more critiques. Send null for rest of the text.
        if (runningStart < endPos) {
            annotationRanges.push({ annotation: null, begin: runningStart, end: endPos });
        }

        // Apply annotations.
        for (const annotation of annotationRanges) {
            this.root.annotateRange({textError: annotation.annotation}, annotation.begin, annotation.end);
        }
    }
}
