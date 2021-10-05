/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import * as ClientUI from "@fluid-example/client-ui-lib";
import {
    MergeTreeDeltaType,
    TextSegment,
} from "@fluidframework/merge-tree";
import { SequenceDeltaEvent, SharedString } from "@fluidframework/sequence";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
// eslint-disable-next-line import/no-unresolved
import * as monaco from "monaco-editor";

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

/**
 * Component for using the Monaco text editor.
 */
export class MonacoRunner extends DataObject implements
    IFluidHTMLView, ClientUI.controls.IViewLayout {
    public get IFluidHTMLView() { return this; }
    public get IFluidLoadable() { return this; }
    public get IViewLayout() { return this; }

    /**
     * The chart probably has a preferred aspect ratio - but it can also fill any bounds
     */
    public aspectRatio?: number;
    public minimumWidth?: number;
    public minimumHeight?: number;
    public readonly canInline = true;

    /**
     * Not used
     */
    public readonly preferInline = false;

    /**
     * Root HTML element of the component.
     */
    private mapHost: HTMLElement;

    /**
     * Monaco text model object.
     */
    private codeModel: monaco.editor.ITextModel;

    /**
     * Monaco code editor object.
     */
    private codeEditor: monaco.editor.IStandaloneCodeEditor;

    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        if (!this.mapHost) {
            this.mapHost = document.createElement("div");
            elm.appendChild(this.mapHost);
            this.initializeEditorDiv().catch((error) => { console.error(error); });
        } else {
            if (this.mapHost.parentElement !== elm) {
                this.mapHost.remove();
                elm.appendChild(this.mapHost);
            }
        }
    }

    /**
     * Creates the SharedString and inserts some sample text. create() is called only once
     * per component.
     */
    protected async initializingFirstTime() {
        const codeString = SharedString.create(this.runtime);
        codeString.insertText(0, 'console.log("Hello, world!");');
        this.root.set("text", codeString.handle);
    }

    /**
     * Sets up the Monaco editor for use and attaches its HTML element to the mapHost element.
     * Also sets up eventing to send/receive ops as the text is changed.
     */
    private async initializeEditorDiv(): Promise<void> {
        // TODO make my dts
        const hostDts = null; // await platform.queryInterface<any>("dts");

        this.mapHost.style.minHeight = "480px";
        this.mapHost.style.width = "100%";
        this.mapHost.style.height = "100%";
        // const outputDiv = document.createElement("div");
        // outputDiv.style.width = "50%";
        // hostWrapper.appendChild(outputDiv);

        const textHandle = await this.root.wait<IFluidHandle<SharedString>>("text");
        const text = await textHandle.get();

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

        this.codeModel = monaco.editor.createModel(text.getText(), "typescript");
        const outputModel = monaco.editor.createModel("", "javascript");

        this.codeEditor = monaco.editor.create(
            this.mapHost,
            { model: this.codeModel, automaticLayout: true });
        // const outputEditor = monaco.editor.create(
        //     outputDiv,
        //     { model: outputModel, automaticLayout: true, readOnly: true });

        this.codeEditor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            () => { this.runCode(outputModel.getValue()); },
            null);

        // outputEditor.addCommand(
        //     monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        //     () => { this.runCode(outputModel.getValue(), platform); },
        //     null);

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
                        text.insertText(change.rangeOffset, change.text);
                    } else {
                        text.replaceText(change.rangeOffset, change.rangeOffset + change.rangeLength, change.text);
                    }
                } else {
                    text.removeText(change.rangeOffset, change.rangeOffset + change.rangeLength);
                }
            }
        });

        text.on("sequenceDelta", (ev: SequenceDeltaEvent) => {
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
    }

    /**
     * SequenceDeltaEvent merge
     */
    private mergeSequenceDelta(ev: SequenceDeltaEvent): void {
        for(const range of ev.ranges) {
            const segment = range.segment;

            if (range.operation === MergeTreeDeltaType.INSERT) {
                if (TextSegment.is(segment)) {
                    const posRange = this.offsetsToRange(range.position);
                    const text = segment.text || "";
                    this.codeEditor.executeEdits("remote", [{ range: posRange, text }]);
                }
            } else if (range.operation === MergeTreeDeltaType.REMOVE) {
                if (TextSegment.is(segment)) {
                    const posRange = this.offsetsToRange(range.position, range.position + segment.text.length);
                    const text = "";
                    this.codeEditor.executeEdits("remote", [{ range: posRange, text }]);
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

    /**
     * Evals the passed string as script.  Used to allow code execution on Ctrl+Enter.
     * @param code String of JS to eval
     */
    private async runCode(code: string): Promise<void> {
        // const root = await platform.queryInterface<any>("root");
        // const host = root ? root.entry : null;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.exec(/* host, */ code);
    }

    /**
     * Evals the passed string as script.
     * @param code String of JS to eval
     */
    private async exec(/* host: any, */ code: string) {
        // eslint-disable-next-line no-eval
        eval(code);
    }
}
