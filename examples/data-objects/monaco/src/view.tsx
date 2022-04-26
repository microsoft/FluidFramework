/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import {
    MergeTreeDeltaType,
    TextSegment,
} from "@fluidframework/merge-tree";
import { SequenceDeltaEvent, SharedString } from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
// eslint-disable-next-line import/no-unresolved
import * as monaco from "monaco-editor";
import React from "react";

/**
 * Compilation options for Monaco to use on Typescript
 */
const defaultCompilerOptions = {
    noImplicitAny: true,
    strictNullChecks: true,
    strictFunctionTypes: true,
    strictPropertyInitialization: true,
    noImplicitThis: true,
    noImplicitReturns: true,

    alwaysStrict: true,
    allowUnreachableCode: false,
    allowUnusedLabels: false,

    downlevelIteration: false,
    noEmitHelpers: false,
    noLib: false,
    noStrictGenericChecks: false,
    noUnusedLocals: false,
    noUnusedParameters: false,

    esModuleInterop: false,
    preserveConstEnums: false,
    removeComments: false,
    skipLibCheck: false,

    experimentalDecorators: false,
    emitDecoratorMetadata: false,

    target: monaco.languages.typescript.ScriptTarget.ES2015,
    jsx: monaco.languages.typescript.JsxEmit.None,

    allowNonTsExtensions: true,
};

export interface IMonacoViewProps {
}

export const MonacoView: React.FC<IMonacoViewProps> = (props: IMonacoViewProps) => {
    return <div></div>;
};

export class MonacoRunnerView implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    /**
     * Root HTML element of the component.
     */
    private viewElement: HTMLDivElement;

    /**
     * Monaco text model object.
     */
    private codeModel: monaco.editor.ITextModel;

    /**
     * Monaco code editor object.
     */
    private codeEditor: monaco.editor.IStandaloneCodeEditor;

    public constructor(private readonly sharedString: SharedString) { }

    public render(elm: HTMLElement): void {
        if (!this.viewElement) {
            this.viewElement = this.createViewElement();
            elm.appendChild(this.viewElement);
        } else {
            if (this.viewElement.parentElement !== elm) {
                this.viewElement.remove();
                elm.appendChild(this.viewElement);
            }
        }
    }

    /**
     * Sets up the Monaco editor for use and attaches its HTML element to the mapHost element.
     * Also sets up eventing to send/receive ops as the text is changed.
     */
    private createViewElement(): HTMLDivElement {
        const viewElement = document.createElement("div");

        // TODO make my dts
        const hostDts = null; // await platform.queryInterface<any>("dts");

        viewElement.style.minHeight = "480px";
        viewElement.style.width = "100%";
        viewElement.style.height = "100%";
        // const outputDiv = document.createElement("div");
        // outputDiv.style.width = "50%";
        // hostWrapper.appendChild(outputDiv);

        monaco.languages.typescript.typescriptDefaults.setCompilerOptions(defaultCompilerOptions);
        if (hostDts) {
            let disposer = monaco.languages.typescript.typescriptDefaults.addExtraLib(
                hostDts.getDefinition(),
                "host.d.ts");
            hostDts.on(
                "definitionsChanged",
                () => {
                    disposer.dispose();
                    disposer = monaco.languages.typescript.typescriptDefaults.addExtraLib(
                        hostDts.getDefinition(),
                        "host.d.ts");
                });
        }

        this.codeModel = monaco.editor.createModel(this.sharedString.getText(), "typescript");
        const outputModel = monaco.editor.createModel("", "javascript");

        this.codeEditor = monaco.editor.create(
            viewElement,
            { model: this.codeModel, automaticLayout: true });

        let ignoreModelContentChanges = false;
        this.codeEditor.onDidChangeModelContent((e) => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            monaco.languages.typescript.getTypeScriptWorker().then((worker) => {
                worker(this.codeModel.uri.toString()).then((client) => {
                    client.getEmitOutput(this.codeModel.uri.toString()).then((r) => {
                        outputModel.setValue(r.outputFiles[0].text);
                    });
                });
            });

            if (ignoreModelContentChanges) {
                return;
            }

            for (const change of e.changes) {
                if (change.text) {
                    if (change.rangeLength === 0) {
                        this.sharedString.insertText(change.rangeOffset, change.text);
                    } else {
                        this.sharedString.replaceText(
                            change.rangeOffset,
                            change.rangeOffset + change.rangeLength,
                            change.text,
                        );
                    }
                } else {
                    this.sharedString.removeText(change.rangeOffset, change.rangeOffset + change.rangeLength);
                }
            }
        });

        this.sharedString.on("sequenceDelta", (ev: SequenceDeltaEvent) => {
            if (ev.isLocal) {
                return;
            }

            try {
                ignoreModelContentChanges = true;
                this.mergeSequenceDelta(ev);
            } finally {
                ignoreModelContentChanges = false;
            }
        });

        return viewElement;
    }

    /**
     * SequenceDeltaEvent merge
     */
    private mergeSequenceDelta(ev: SequenceDeltaEvent): void {
        for (const range of ev.ranges) {
            const segment = range.segment;
            if (TextSegment.is(segment)) {
                switch (range.operation) {
                    case MergeTreeDeltaType.INSERT: {
                        const posRange = this.offsetsToRange(range.position);
                        const text = segment.text || "";
                        this.codeEditor.executeEdits("remote", [{ range: posRange, text }]);
                        break;
                    }

                    case MergeTreeDeltaType.REMOVE: {
                        const posRange = this.offsetsToRange(range.position, range.position + segment.text.length);
                        const text = "";
                        this.codeEditor.executeEdits("remote", [{ range: posRange, text }]);
                        break;
                    }

                    default:
                        break;
                }
            }
        }
    }

    /**
     * Translate the offsets used by the MergeTree into a Range that is
     * interpretable by Monaco.
     * @param offset1 Starting offset
     * @param offset2 Ending offset
     */
    private offsetsToRange(offset1: number, offset2?: number): monaco.Range {
        const pos1 = this.codeModel.getPositionAt(offset1);
        const pos2 = (typeof offset2 === "number") ? this.codeModel.getPositionAt(offset2) : pos1;
        const range = new monaco.Range(pos1.lineNumber, pos1.column, pos2.lineNumber, pos2.column);
        return range;
    }
}
