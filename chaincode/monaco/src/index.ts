// inspiration for this example taken from https://github.com/agentcooper/typescript-play

import { Component, Document } from "@prague/app-component";
import {
     IMergeTreeGroupMsg,
     IMergeTreeInsertMsg,
     IMergeTreeOp,
     IMergeTreeRemoveMsg,
     MergeTreeDeltaType,
} from "@prague/merge-tree";
import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
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
};
// tslint:enable

// tslint:disable
(self as any).MonacoEnvironment = {
	getWorkerUrl: function (moduleId, label) {
		switch (label) {
			case 'json': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/json/json.worker');
			case 'css': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/css/css.worker');
			case 'html': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/html/html.worker');
			case 'typescript':
			case 'javascript': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/typescript/ts.worker');
			default:
				return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/editor/editor.worker');
		}
	}
};
// tslint:enable

class MonacoDocument extends Document {
    private mapHost: HTMLElement;
    private codeModel: monaco.editor.ITextModel;
    private codeEditor: monaco.editor.IStandaloneCodeEditor;

    public async opened(): Promise<void> {
        this.mapHost = await this.platform.queryInterface<HTMLElement>("div");
        if (!this.mapHost) {
            return;
        }

        const hostDts = await this.platform.queryInterface<any>("dts");

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

        this.codeModel = monaco.editor.createModel(text.getText(), "typescript", monaco.Uri.parse("code.ts"));
        const outputModel = monaco.editor.createModel("", "javascript", monaco.Uri.parse("code.js"));

        this.codeEditor = monaco.editor.create(
            inputDiv,
            { model: this.codeModel, automaticLayout: true });
        const outputEditor = monaco.editor.create(
            outputDiv,
            { model: outputModel, automaticLayout: true, readOnly: true });

        this.codeEditor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            () => { this.runCode(outputModel.getValue(), this.platform); },
            null);

        outputEditor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            () => { this.runCode(outputModel.getValue(), this.platform); },
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

export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new MonacoDocument());
}
