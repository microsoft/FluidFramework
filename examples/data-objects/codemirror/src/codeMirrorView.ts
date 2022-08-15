/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    MergeTreeDeltaType,
    TextSegment,
    ReferenceType,
    reservedTileLabelsKey,
    Marker,
} from "@fluidframework/merge-tree";
import { getTextAndMarkers, SharedString, SequenceDeltaEvent } from "@fluidframework/sequence";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import CodeMirror from "codemirror";

/* eslint-disable @typescript-eslint/no-require-imports,
import/no-internal-modules, import/no-unassigned-import */
require("codemirror/lib/codemirror.css");
require("./style.css");
require("codemirror/mode/javascript/javascript.js");
/* eslint-enable @typescript-eslint/no-require-imports,
import/no-internal-modules, import/no-unassigned-import */

import { CodeMirrorPresenceManager, PresenceManager } from "./presence";

export class CodeMirrorView implements IFluidHTMLView {
    private textArea: HTMLTextAreaElement | undefined;
    private codeMirror: CodeMirror.EditorFromTextArea | undefined;
    private codeMirrorPresenceManager: CodeMirrorPresenceManager | undefined;

    // TODO would be nice to be able to distinguish local edits across different uses of a sequence so that when
    // bridging to another model we know which one to update
    private updatingSequence: boolean = false;
    private updatingCodeMirror: boolean = false;

    private sequenceDeltaCb: any;

    public get IFluidHTMLView() { return this; }

    constructor(private readonly text: SharedString, private readonly presenceManager: PresenceManager) {
    }

    public remove(): void {
        // Text area being removed will dispose of CM
        // https://stackoverflow.com/questions/18828658/how-to-kill-a-codemirror-instance

        if (this.sequenceDeltaCb) {
            this.text.removeListener("sequenceDelta", this.sequenceDeltaCb);
            this.sequenceDeltaCb = undefined;
        }

        if (this.codeMirrorPresenceManager) {
            this.codeMirrorPresenceManager.removeAllListeners();
            this.codeMirrorPresenceManager = undefined;
        }
    }

    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        // Create base textarea
        if (!this.textArea) {
            this.textArea = document.createElement("textarea");
        }

        // Reparent if needed
        if (this.textArea.parentElement !== elm) {
            this.textArea.remove();
            elm.appendChild(this.textArea);
        }

        if (!this.codeMirror) {
            this.setupEditor();
        }
    }

    private setupEditor() {
        this.codeMirror = CodeMirror.fromTextArea(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.textArea!,
            {
                lineNumbers: true,
                mode: "text/typescript",
                viewportMargin: Infinity,
            });

        this.codeMirrorPresenceManager = new CodeMirrorPresenceManager(this.codeMirror, this.presenceManager);

        const { parallelText } = getTextAndMarkers(this.text, "pg");
        const text = parallelText.join("\n");
        this.codeMirror.setValue(text);

        this.codeMirror.on(
            "beforeChange",
            (instance, changeObj) => {
                // Ignore this callback if it is a local change
                if (this.updatingSequence) {
                    return;
                }

                // Mark that our editor is making the edit
                this.updatingCodeMirror = true;

                const doc = instance.getDoc();

                // We add in line to adjust for paragraph markers
                let from = doc.indexFromPos(changeObj.from);
                const to = doc.indexFromPos(changeObj.to);

                if (from !== to) {
                    this.text.removeText(from, to);
                }

                const changeText = changeObj.text;
                changeText.forEach((value, index) => {
                    // Insert the updated text
                    if (value) {
                        this.text.insertText(from, value);
                        from += value.length;
                    }

                    // Add in a paragraph marker if this is a multi-line update
                    if (index !== changeText.length - 1) {
                        this.text.insertMarker(
                            from,
                            ReferenceType.Tile,
                            { [reservedTileLabelsKey]: ["pg"] });
                        from++;
                    }
                });

                this.updatingCodeMirror = false;
            });

        this.sequenceDeltaCb = (ev: SequenceDeltaEvent) => {
            // If in the middle of making an editor change to our instance we can skip this update
            if (this.updatingCodeMirror) {
                return;
            }

            // Mark that we are making a local edit so that when "beforeChange" fires we don't attempt
            // to submit new ops
            this.updatingSequence = true;

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const doc = this.codeMirror!.getDoc();
            for (const range of ev.ranges) {
                const segment = range.segment;

                if (range.operation === MergeTreeDeltaType.INSERT) {
                    if (TextSegment.is(segment)) {
                        doc.replaceRange(
                            segment.text,
                            doc.posFromIndex(range.position));
                    } else if (Marker.is(segment)) {
                        doc.replaceRange(
                            "\n",
                            doc.posFromIndex(range.position));
                    }
                } else if (range.operation === MergeTreeDeltaType.REMOVE) {
                    if (TextSegment.is(segment)) {
                        const textSegment = range.segment as TextSegment;
                        doc.replaceRange(
                            "",
                            doc.posFromIndex(range.position),
                            doc.posFromIndex(range.position + textSegment.text.length));
                    } else if (Marker.is(segment)) {
                        doc.replaceRange(
                            "",
                            doc.posFromIndex(range.position),
                            doc.posFromIndex(range.position + 1));
                    }
                }
            }

            // And then flip the bit back since we are done making codemirror changes
            this.updatingSequence = false;
        };

        this.text.on("sequenceDelta", this.sequenceDeltaCb);
    }
}
