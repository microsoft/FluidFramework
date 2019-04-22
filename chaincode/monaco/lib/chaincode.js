var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import { ComponentHost } from "@prague/component";
import { CounterValueType, DistributedSetValueType, MapExtension, registerDefaultValueType, } from "@prague/map";
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
export class MonacoRunner extends EventEmitter {
    constructor() {
        super(...arguments);
        this.collabDocDeferred = new Deferred();
    }
    run(runtime, platform) {
        return __awaiter(this, void 0, void 0, function* () {
            this.initialize(runtime).then((doc) => this.collabDocDeferred.resolve(doc), (error) => this.collabDocDeferred.reject(error));
            return this;
        });
    }
    queryInterface(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return null;
        });
    }
    detach() {
        console.log("Text detach");
        return;
    }
    // TODO can remove ? once document is fixed in main package
    attach(platform) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collabDocDeferred.promise;
            this.mapHost = yield platform.queryInterface("div");
            if (!this.mapHost) {
                return;
            }
            const hostDts = yield platform.queryInterface("dts");
            if (!this.mapHost.style.width) {
                this.mapHost.style.width = "100vw";
                this.mapHost.style.height = "100vh";
            }
            else {
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
            const root = yield this.rootView;
            const text = yield root.wait("text");
            monaco.languages.typescript.typescriptDefaults.setCompilerOptions(defaultCompilerOptions);
            if (hostDts) {
                let disposer = monaco.languages.typescript.typescriptDefaults.addExtraLib(hostDts.getDefinition(), "host.d.ts");
                hostDts.on("definitionsChanged", () => {
                    disposer.dispose();
                    disposer = monaco.languages.typescript.typescriptDefaults.addExtraLib(hostDts.getDefinition(), "host.d.ts");
                });
            }
            this.codeModel = monaco.editor.createModel(text.getText(), "typescript");
            const outputModel = monaco.editor.createModel("", "javascript");
            this.codeEditor = monaco.editor.create(inputDiv, { model: this.codeModel, automaticLayout: true });
            const outputEditor = monaco.editor.create(outputDiv, { model: outputModel, automaticLayout: true, readOnly: true });
            this.codeEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { this.runCode(outputModel.getValue(), platform); }, null);
            outputEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { this.runCode(outputModel.getValue(), platform); }, null);
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
                        }
                        else {
                            text.replaceText(change.rangeOffset, change.rangeOffset + change.rangeLength, change.text);
                        }
                    }
                    else {
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
                }
                finally {
                    ignoreModelContentChanges = false;
                }
            });
            return this;
        });
    }
    initialize(runtime) {
        return __awaiter(this, void 0, void 0, function* () {
            const collabDoc = yield Document.Load(runtime);
            this.rootView = yield collabDoc.getRoot();
            if (!runtime.existing) {
                const codeString = collabDoc.createString();
                codeString.insertText('console.log("Hello, world!");', 0);
                this.rootView.set("text", codeString);
            }
            return collabDoc;
        });
    }
    mergeDelta(delta) {
        switch (delta.type) {
            case 3 /* GROUP */:
                this.mergeDeltaGroup(delta);
                break;
            case 0 /* INSERT */:
                this.mergeInsertDelta(delta);
                break;
            case 1 /* REMOVE */:
                this.mergeRemoveDelta(delta);
                break;
        }
    }
    mergeDeltaGroup(delta) {
        for (const op of delta.ops) {
            this.mergeDelta(op);
        }
    }
    mergeInsertDelta(delta) {
        if (typeof delta.pos1 !== "number" ||
            typeof delta.seg !== "string") {
            return;
        }
        const range = this.offsetsToRange(delta.pos1, delta.pos2);
        const text = delta.seg || "";
        this.codeEditor.executeEdits("remote", [{ range, text }]);
    }
    mergeRemoveDelta(delta) {
        if (typeof delta.pos1 !== "number" ||
            typeof delta.pos2 !== "number") {
            return;
        }
        const range = this.offsetsToRange(delta.pos1, delta.pos2);
        const text = "";
        this.codeEditor.executeEdits("remote", [{ range, text }]);
    }
    offsetsToRange(offset1, offset2) {
        const pos1 = this.codeModel.getPositionAt(offset1);
        const pos2 = (typeof offset2 === "number") ? this.codeModel.getPositionAt(offset2) : pos1;
        const range = new monaco.Range(pos1.lineNumber, pos1.column, pos2.lineNumber, pos2.column);
        return range;
    }
    runCode(code, platform) {
        return __awaiter(this, void 0, void 0, function* () {
            const root = yield platform.queryInterface("root");
            const host = root ? root.entry : null;
            this.exec(host, code);
        });
    }
    exec(host, code) {
        return __awaiter(this, void 0, void 0, function* () {
            eval(code);
        });
    }
}
class Chaincode extends EventEmitter {
    /**
     * Constructs a new document from the provided details
     */
    constructor(runner) {
        super();
        this.runner = runner;
        this.modules = new Map();
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
    getModule(type) {
        assert(this.modules.has(type));
        return this.modules.get(type);
    }
    /**
     * Stops the instantiated chaincode from running
     */
    close() {
        return Promise.resolve();
    }
    run(runtime, platform) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.runner.run(runtime, platform);
        });
    }
}
export class MonacoComponent {
    constructor() {
        this.sharedText = new MonacoRunner();
        this.chaincode = new Chaincode(this.sharedText);
    }
    getModule(type) {
        return null;
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            return;
        });
    }
    run(runtime) {
        return __awaiter(this, void 0, void 0, function* () {
            const chaincode = this.chaincode;
            const component = yield ComponentHost.LoadFromSnapshot(runtime, chaincode);
            this.component = component;
            return component;
        });
    }
    attach(platform) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sharedText.attach(platform);
        });
    }
    snapshot() {
        const entries = this.component.snapshotInternal();
        return { entries, sha: null };
    }
}
//# sourceMappingURL=chaincode.js.map