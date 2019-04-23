// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import { IPlatform } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import {
    IMergeTreeGroupMsg,
    IMergeTreeInsertMsg,
    IMergeTreeOp,
    IMergeTreeRemoveMsg,
    MergeTreeDeltaType,
} from "@prague/merge-tree";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
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

export class MonacoRunner extends EventEmitter implements IPlatform {
    public static async Load(runtime: IComponentRuntime, context: IComponentContext): Promise<MonacoRunner> {
        const runner = new MonacoRunner(runtime);
        await runner.initialize();

        return runner;
    }

    private mapHost: HTMLElement;
    private codeModel: monaco.editor.ITextModel;
    private codeEditor: monaco.editor.IStandaloneCodeEditor;
    private rootView: ISharedMap;

    constructor(private runtime: IComponentRuntime) {
        super();
    }

    public async queryInterface<T>(id: string): Promise<any> {
        return null;
    }

    public detach() {
        console.log("Text detach");
        return;
    }

    // TODO can remove ? once document is fixed in main package
    public async attach(platform: IPlatform): Promise<IPlatform> {
        this.mapHost = await platform.queryInterface<HTMLElement>("div");
        if (!this.mapHost) {
            return;
        }

        const hostDts = await platform.queryInterface<any>("dts");

        if (!this.mapHost.style.width) {
            this.mapHost.style.width = "100vw";
            this.mapHost.style.height = "100vh";
        } else {
            this.mapHost.style.width = "100%";
            // this.mapHost.style.height = "100%";
        }

        const hostWrapper = document.createElement("div");
        hostWrapper.style.display = "flex";
        hostWrapper.style.flex = "1";
        hostWrapper.style.width = "100%";
        hostWrapper.style.height = "100%";

        const inputDiv = document.createElement("div");
        inputDiv.style.width = "50%";
        const outputDiv = document.createElement("div");
        outputDiv.style.width = "50%";

        this.mapHost.appendChild(hostWrapper);
        hostWrapper.appendChild(inputDiv);
        hostWrapper.appendChild(outputDiv);

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
        const outputEditor = monaco.editor.create(
            outputDiv,
            { model: outputModel, automaticLayout: true, readOnly: true });

        this.codeEditor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            () => { this.runCode(outputModel.getValue(), platform); },
            null);

        outputEditor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            () => { this.runCode(outputModel.getValue(), platform); },
            null);

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

        return this;
    }

    private async initialize(): Promise<void> {
        const collabDoc = await Document.Load(this.runtime);
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

    private async runCode(code: string, platform: IPlatform) {
        const root = await platform.queryInterface<any>("root");
        const host = root ? root.entry : null;
        this.exec(host, code);
    }

    private async exec(host: any, code: string) {
        eval(code);
    }
}
