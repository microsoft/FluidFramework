/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import {
    IComponent,
    IComponentHTMLViewable,
    IComponentLoadable,
    IHTMLView,
    ISharedComponent,
} from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import {
    IMergeTreeGroupMsg,
    IMergeTreeInsertMsg,
    IMergeTreeOp,
    IMergeTreeRemoveMsg,
    MergeTreeDeltaType,
} from "@prague/merge-tree";
import {
    ComponentDisplayType,
    IComponentContext,
    IComponentLayout,
    IComponentRenderHTML,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
import { EventEmitter } from "events";
import * as monaco from "monaco-editor";
import { Document } from "./document";

/**
 * Compilation options for Monaco to use on Typescript
 */
// tslint:disable
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
// tslint:enable

/**
 * Component for using the Monaco text editor.
 */
export class MonacoRunner extends EventEmitter implements
    ISharedComponent, IComponentHTMLViewable, IComponentRenderHTML, IComponentLoadable, IComponentLayout {

    /**
     * Interfaces supported by this component.
     */
    public static supportedInterfaces = [
        "IComponentHTMLViewable",
        "IComponentRenderHTML",
        "IComponentLoadable",
        "IComponentLayout",
    ];

    /**
     * Get a new MonacoRunner with the given runtime.
     * @param runtime The runtime for the MonacoRunner
     * @param context Not used
     */
    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<MonacoRunner> {
        const runner = new MonacoRunner(runtime);
        await runner.initialize();

        return runner;
    }

    /**
     * The chart probably has a preferred aspect ratio - but it can also fill any bounds
     */
    public aspectRatio?: number;

    /**
     * Not used
     */
    public minimumWidthBlock?: number;

    /**
     * Not used
     */
    public minimumHeightInline?: number;

    /**
     * Not used
     */
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

    /**
     * Root map for the Document.
     */
    private rootView: ISharedMap;

    /**
     * Get the id of the component within the document.
     */
    public get url(): string {
        return this.runtime.id;
    }

    /**
     * Create a new MonacoRunner with the given runtime.
     * @param runtime The runtime for the MonacoRunner
     */
    constructor(private runtime: IComponentRuntime) {
        super();
    }

    /**
     * Returns this if the given interface id is in the list of supported interfaces.
     * @param id The requested interface id
     */
    public query(id: string): any {
        return MonacoRunner.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    /**
     * Get a list the supported interfaces.
     */
    public list(): string[] {
        return MonacoRunner.supportedInterfaces;
    }

    /**
     * Get the component's height in pixels.
     */
    public heightInLines() {
        // Component will want to describe its height in pixels
        // Right now we're assuming it's 22px per line
        // 30 is simply an arbitrary number and was chosen to differ from the pinpoint map's choice of 24
        return 30;
    }

    /**
     * Parents the view under the given element, creating and initializing it if needed.
     * @param elm The element parent of the view
     * @param displayType Not used
     */
    public render(elm: HTMLElement, displayType: ComponentDisplayType): void {
        if (!this.mapHost) {
            this.mapHost = document.createElement("div");
            this.mapHost.style.width = "100%";
            this.mapHost.style.height = "100%";
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
     * Creates and initializes the view, returning the root element.  Only supports
     * one view currently.
     * @param host Not used
     * @param element The element parent of the view
     */
    public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLView> {
        if (this.mapHost) {
            return Promise.reject("Only one view supported");
        }

        this.mapHost = document.createElement("div");
        element.appendChild(this.mapHost);

        await this.initializeEditorDiv();

        return this;
    }

    /**
     * Drop the reference to the root element.
     */
    public remove() {
        this.mapHost = null;
    }

    /**
     * Sets up the Monaco editor for use and attaches its HTML element to the mapHost element.
     * Also sets up eventing to send/receive ops as the text is changed.
     */
    private async initializeEditorDiv(): Promise<void> {
        // TODO make my dts
        const hostDts = null; // await platform.queryInterface<any>("dts");

        if (!this.mapHost.style.width) {
            this.mapHost.style.width = "100vw";
            this.mapHost.style.height = "100vh";
        }

        const hostWrapper = document.createElement("div");
        hostWrapper.style.display = "flex";
        hostWrapper.style.flex = "1";
        hostWrapper.style.width = "100%";
        hostWrapper.style.height = "100%";

        const inputDiv = document.createElement("div");
        inputDiv.style.width = "100%";
        // const outputDiv = document.createElement("div");
        // outputDiv.style.width = "50%";

        this.mapHost.appendChild(hostWrapper);
        hostWrapper.appendChild(inputDiv);
        // hostWrapper.appendChild(outputDiv);

        const root = await this.rootView;
        const text = await root.wait<SharedString>("text");

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
            inputDiv,
            { model: this.codeModel, automaticLayout: true });
        // const outputEditor = monaco.editor.create(
        //     outputDiv,
        //     { model: outputModel, automaticLayout: true, readOnly: true });

        this.codeEditor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            () => { this.runCode(outputModel.getValue()); },
            null);

        // outputEditor.addCommand(
        //     monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        //     () => { this.runCode(outputModel.getValue(), platform); },
        //     null);

        let ignoreModelContentChanges = false;
        this.codeEditor.onDidChangeModelContent((e) => {
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
                        text.insertText(change.text, change.rangeOffset);
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
     * Loads the document.  If this is the first time, creates the SharedString
     * and inserts some sample text.
     */
    private async initialize(): Promise<void> {
        const collabDoc = await Document.load(this.runtime);
        this.rootView = await collabDoc.getRoot();

        if (!this.runtime.existing) {
            const codeString = collabDoc.createString();
            codeString.insertText('console.log("Hello, world!");', 0);
            this.rootView.set("text", codeString);
        }
    }

    /**
     * Merge changes to the text from incoming ops.
     * @param delta The incoming op contents
     */
    private mergeDelta(delta: IMergeTreeOp): void {
        switch (delta.type) {
            case MergeTreeDeltaType.GROUP:
                this.mergeDeltaGroup(delta as IMergeTreeGroupMsg);
                break;
            case MergeTreeDeltaType.INSERT:
                this.mergeInsertDelta(delta as IMergeTreeInsertMsg);
                break;
            case MergeTreeDeltaType.REMOVE:
                this.mergeRemoveDelta(delta as IMergeTreeRemoveMsg);
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
        this.codeEditor.executeEdits("remote", [ { range, text } ]);
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
        this.codeEditor.executeEdits("remote", [ { range, text } ]);
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
        this.exec(/* host, */ code);
    }

    /**
     * Evals the passed string as script.
     * @param code String of JS to eval
     */
    private async exec(/* host: any, */ code: string) {
        eval(code);
    }
}
