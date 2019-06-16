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

export class MonacoRunner extends EventEmitter implements
    ISharedComponent, IComponentHTMLViewable, IComponentRenderHTML, IComponentLoadable, IComponentLayout {

    public static supportedInterfaces = [
        "IComponentHTMLViewable",
        "IComponentRenderHTML",
        "IComponentLoadable",
        "IComponentLayout",
    ];

    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<MonacoRunner> {
        const runner = new MonacoRunner(runtime);
        await runner.initialize();

        return runner;
    }

    // The chart probably has a preferred aspect ratio - but it can also fill any bounds
    public aspectRatio?: number;
    public minimumWidthBlock?: number;
    public minimumHeightInline?: number;
    public readonly canInline = true;
    public readonly preferInline = false;

    private mapHost: HTMLElement;
    private codeModel: monaco.editor.ITextModel;
    private codeEditor: monaco.editor.IStandaloneCodeEditor;
    private rootView: ISharedMap;

    public get url(): string {
        return this.runtime.id;
    }

    constructor(private runtime: IComponentRuntime) {
        super();
    }

    public query(id: string): any {
        return MonacoRunner.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return MonacoRunner.supportedInterfaces;
    }

    public heightInLines() {
        // Component will want to describe its height in pixels
        // Right now we're assuming it's 22px per line
        // 30 is simply an arbitrary number and was chosen to differ from the pinpoint map's choice of 24
        return 30;
    }

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

    // TODO can remove ? once document is fixed in main package
    public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLView> {
        if (this.mapHost) {
            return Promise.reject("Only one view supported");
        }

        this.mapHost = document.createElement("div");
        element.appendChild(this.mapHost);

        await this.initializeEditorDiv();

        return this;
    }

    public remove() {
        this.mapHost = null;
    }

    private async initializeEditorDiv() {
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

    private async initialize(): Promise<void> {
        const collabDoc = await Document.load(this.runtime);
        this.rootView = await collabDoc.getRoot();

        if (!this.runtime.existing) {
            const codeString = collabDoc.createString();
            codeString.insertText('console.log("Hello, world!");', 0);
            this.rootView.set("text", codeString);
        }
    }

    private mergeDelta(delta: IMergeTreeOp) {
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

    private mergeDeltaGroup(delta: IMergeTreeGroupMsg): void {
        for (const op of delta.ops) {
            this.mergeDelta(op);
        }
    }

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

    private offsetsToRange(offset1: number, offset2?: number): monaco.Range {
        const pos1 = this.codeModel.getPositionAt(offset1);
        const pos2 = (typeof offset2 === "number") ? this.codeModel.getPositionAt(offset2) : pos1;
        const range = new monaco.Range(pos1.lineNumber, pos1.column, pos2.lineNumber, pos2.column);
        return range;
    }

    private async runCode(code: string) {
        // const root = await platform.queryInterface<any>("root");
        // const host = root ? root.entry : null;
        this.exec(/* host, */ code);
    }

    private async exec(/* host: any, */ code: string) {
        eval(code);
    }
}
