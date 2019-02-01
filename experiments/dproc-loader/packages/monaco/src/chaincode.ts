// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import { Component, Document } from "@prague/app-component";
import {
    IChaincodeComponent,
    IComponentPlatform,
    IComponentRuntime,
    IDeltaHandler,
} from "@prague/container-definitions";
import { ComponentHost } from "@prague/container-utils";
import {
    IMergeTreeGroupMsg,
    IMergeTreeInsertMsg,
    IMergeTreeOp,
    IMergeTreeRemoveMsg,
    MergeTreeDeltaType,
} from "@prague/merge-tree";
import { IChaincode, IPlatform, ITree } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
import { Deferred } from "@prague/utils";
import * as monaco from "monaco-editor";

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

class MonacoRunner extends Document {
    private mapHost: HTMLElement;
    private codeModel: monaco.editor.ITextModel;
    private codeEditor: monaco.editor.IStandaloneCodeEditor;
    private ready = new Deferred<void>();

    public async opened() {
        this.ready.resolve();
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        await this.ready.promise;

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

        const root = await this.root.getView();
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
                        text.replaceText(change.text, change.rangeOffset, change.rangeOffset + change.rangeLength);
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

    protected async create(): Promise<void> {
        const codeString = this.createString();
        codeString.insertText('console.log("Hello, world!");', 0);
        this.root.set("text", codeString);
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
            typeof delta.text !== "string"
        ) {
            return;
        }

        const range = this.offsetsToRange(delta.pos1, delta.pos2);
        const text = delta.text || "";
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

/**
 * A document is a collection of collaborative types.
 */
export class MonacoComponent implements IChaincodeComponent {
    private monaco = new MonacoRunner();
    private chaincode: IChaincode;
    private component: ComponentHost;

    constructor() {
        this.chaincode = Component.instantiate(this.monaco);
    }

    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IDeltaHandler> {
        const chaincode = this.chaincode;

        // All of the below would be hidden from a developer
        // Is this an await or does it just go?
        const component = await ComponentHost.LoadFromSnapshot(
            runtime,
            runtime.tenantId,
            runtime.documentId,
            runtime.id,
            runtime.parentBranch,
            runtime.existing,
            runtime.options,
            runtime.clientId,
            runtime.user,
            runtime.blobManager,
            runtime.baseSnapshot,
            chaincode,
            runtime.deltaManager,
            runtime.getQuorum(),
            runtime.storage,
            runtime.connectionState,
            runtime.branch,
            runtime.minimumSequenceNumber,
            runtime.snapshotFn,
            runtime.closeFn);
        this.component = component;

        return component;
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        return this.monaco.attach(platform);
    }

    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries };
    }
}
