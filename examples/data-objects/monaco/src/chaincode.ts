/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
    IMergeTreeGroupMsg,
    IMergeTreeInsertMsg,
    IMergeTreeOp,
    IMergeTreeRemoveMsg,
    MergeTreeDeltaType,
} from "@fluidframework/merge-tree";
import { SharedString } from "@fluidframework/sequence";
import { IFluidMountableView } from "@fluidframework/view-interfaces";
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
export class MonacoRunner extends DataObject implements IFluidMountableView {
    public get IFluidMountableView() { return this; }
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

    public mount(elm: HTMLElement): void {
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

    public unmount() {
        console.log("unmount");
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

        this.codeEditor = monaco.editor.create(
            this.mapHost,
            { model: this.codeModel, automaticLayout: true });

        let ignoreModelContentChanges = false;
        this.codeEditor.onDidChangeModelContent((e) => {
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

        text.on("op", (op, local) => {
            if (local) {
                return;
            }

            try {
                ignoreModelContentChanges = true;
                this.mergeDelta(op.contents);
            } finally {
                ignoreModelContentChanges = false;
            }
        });
    }

    /**
     * Merge changes to the text from incoming ops.
     * @param delta The incoming op contents
     */
    private mergeDelta(delta: IMergeTreeOp): void {
        switch (delta.type) {
            case MergeTreeDeltaType.GROUP:
                this.mergeDeltaGroup(delta);
                break;
            case MergeTreeDeltaType.INSERT:
                this.mergeInsertDelta(delta);
                break;
            case MergeTreeDeltaType.REMOVE:
                this.mergeRemoveDelta(delta);
                break;
            default:
                break;
        }
    }

    /**
     * Unpack group ops to merge them individually.
     * @param delta The incoming op contents
     */
    private mergeDeltaGroup(delta: IMergeTreeGroupMsg): void {
        for (const op of delta.ops) {
            this.mergeDelta(op);
        }
    }

    /**
     * Merge an insert operation.
     * @param delta The insert message
     */
    private mergeInsertDelta(delta: IMergeTreeInsertMsg): void {
        if (typeof delta.pos1 !== "number" ||
            typeof delta.seg !== "string"
        ) {
            return;
        }

        const range = this.offsetsToRange(delta.pos1, delta.pos2);
        const text = delta.seg || "";
        this.codeEditor.executeEdits("remote", [{ range, text }]);
    }

    /**
     * Merge a remove operation.
     * @param delta The remove message
     */
    private mergeRemoveDelta(delta: IMergeTreeRemoveMsg): void {
        if (typeof delta.pos1 !== "number" ||
            typeof delta.pos2 !== "number"
        ) {
            return;
        }

        const range = this.offsetsToRange(delta.pos1, delta.pos2);
        const text = "";
        this.codeEditor.executeEdits("remote", [{ range, text }]);
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
