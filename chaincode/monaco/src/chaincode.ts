// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import { ComponentHost } from "@prague/component";
import { IPlatform, ITree } from "@prague/container-definitions";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    MapExtension,
    registerDefaultValueType,
} from "@prague/map";
import {
    IMergeTreeGroupMsg,
    IMergeTreeInsertMsg,
    IMergeTreeOp,
    IMergeTreeRemoveMsg,
    MergeTreeDeltaType,
} from "@prague/merge-tree";
import {
    IChaincode,
    IChaincodeComponent,
    IComponentDeltaHandler,
    IComponentRuntime,
    IRuntime as ILegacyRuntime,
} from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
import * as sequence from "@prague/sequence";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
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
    private mapHost: HTMLElement;
    private codeModel: monaco.editor.ITextModel;
    private codeEditor: monaco.editor.IStandaloneCodeEditor;
    private rootView: ISharedMap;
    private collabDocDeferred = new Deferred<Document>();

    public async run(runtime: ILegacyRuntime, platform: IPlatform) {
        this.initialize(runtime).then(
            (doc) => this.collabDocDeferred.resolve(doc),
            (error) => this.collabDocDeferred.reject(error));
        return this;
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
        await this.collabDocDeferred.promise;

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

        return this;
    }

    private async initialize(runtime: ILegacyRuntime): Promise<Document> {
        const collabDoc = await Document.Load(runtime);
        this.rootView = await collabDoc.getRoot();

        if (!runtime.existing) {
            const codeString = collabDoc.createString();
            codeString.insertText('console.log("Hello, world!");', 0);
            this.rootView.set("text", codeString);
        }

        return collabDoc;
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

class Chaincode extends EventEmitter implements IChaincode {
    private modules = new Map<string, any>();

    /**
     * Constructs a new document from the provided details
     */
    constructor(private runner: any) {
        super();

        // Register default map value types
        registerDefaultValueType(new DistributedSetValueType());
        registerDefaultValueType(new CounterValueType());
        registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
        registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

        // Create channel extensions
        const mapExtension = new MapExtension();
        const sharedStringExtension = new sequence.SharedStringExtension();
        const objectSequenceExtension = new sequence.SharedObjectSequenceExtension();
        const numberSequenceExtension = new sequence.SharedNumberSequenceExtension();

        this.modules.set(MapExtension.Type, mapExtension);
        this.modules.set(sharedStringExtension.type, sharedStringExtension);
        this.modules.set(objectSequenceExtension.type, objectSequenceExtension);
        this.modules.set(numberSequenceExtension.type, numberSequenceExtension);
    }

    public getModule(type: string): any {
        assert(this.modules.has(type));
        return this.modules.get(type);
    }

    /**
     * Stops the instantiated chaincode from running
     */
    public close(): Promise<void> {
        return Promise.resolve();
    }

    public async run(runtime: ILegacyRuntime, platform: IPlatform): Promise<IPlatform> {
        return this.runner.run(runtime, platform);
    }
}

export class MonacoComponent implements IChaincodeComponent {
    private sharedText = new MonacoRunner();
    private chaincode: Chaincode;
    private component: ComponentHost;

    constructor() {
        this.chaincode = new Chaincode(this.sharedText);
    }

    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
        const chaincode = this.chaincode;

        const component = await ComponentHost.LoadFromSnapshot(runtime, chaincode);
        this.component = component;

        return component;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        return this.sharedText.attach(platform);
    }

    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries, sha: null };
    }
}
