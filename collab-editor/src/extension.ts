// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { api, sharedString as SharedString, socketStorage } from 'routerlicious';

socketStorage.registerAsDefault("http://localhost:3000");
const extension = api.defaultRegistry.getExtension(SharedString.CollaboritiveStringExtension.Type);
let services = api.getDefaultServices();

class FlowFilter {
    constructor(public sharedString: SharedString.SharedString) {
    }

    setEvents() {
        let editor = vscode.window.activeTextEditor;
        vscode.workspace.onDidChangeTextDocument((e) => {
            for (let change of e.contentChanges) {
                console.log(`change ${change.range.start.line}, ${change.range.start.character} ${change.text}`);
                let pos1 = this.sharedString.client.mergeTree.lcToPos(change.range.start.line, change.range.start.character);
                let pos2 = this.sharedString.client.mergeTree.lcToPos(change.range.end.line, change.range.end.character);
                console.log(`change pos: ${pos1} ${pos2}`);
                // assume insert for now
                if (change.text.length < 100) {
                    this.sharedString.insertText(change.text, pos1);
                }
            }
        });
        
        this.sharedString.on("op", (msg: api.IMessageBase) => {
            if (msg && msg.op) {
                let seqmsg = <api.ISequencedMessage>msg;
                if (seqmsg.clientId != this.sharedString.client.longClientId) {
                    let delta = <api.IMergeTreeDeltaMsg>msg.op;
                    if (delta.type === api.MergeTreeMsgType.INSERT) {
                        let editor = vscode.window.activeTextEditor;
                        editor.edit((editBuilder) => {
                            let lc = this.sharedString.client.mergeTree.posToLc(delta.pos1);
                            let vspos = new vscode.Position(lc.line, lc.column);
                            editBuilder.insert(vspos, delta.text);
                        });
                    }
                }
            }
        });

    }

    insertTree() {
        let editor = vscode.window.activeTextEditor;
        editor.edit((editBuilder) => {
            let line = 0;

            function renderSegment(segment: SharedString.Segment, segPos: number, refSeq: number,
                clientId: number, start: number, end: number) {
                let textSegment = <SharedString.TextSegment>segment;
                let vspos = new vscode.Position(line, 0);
                editBuilder.insert(vspos, textSegment.text);
                line++;
                return true;
            }

            this.sharedString.client.mergeTree.mapRange({ leaf: renderSegment }, SharedString.UniversalSequenceNumber,
                this.sharedString.client.getClientId());
        });
    }
}

function initializeSnapshot() {
    let editor = vscode.window.activeTextEditor;
    let doc = editor.document;

    const sharedString = extension.load("ddd", services, api.defaultRegistry) as SharedString.SharedString;

    sharedString.on("partialLoad", (data: api.MergeTreeChunk) => {
    });

    sharedString.on("loadFinshed", (data: api.MergeTreeChunk) => {
        if (sharedString.client.getLength() !== 0) {
            let flowFilter = new FlowFilter(sharedString);
            flowFilter.insertTree();
            flowFilter.setEvents();
        } else {
            let text = doc.getText();
            console.log("local load...");
            const segments = SharedString.loadSrcSegments(text);
            for (const segment of segments) {
                let textSegment = <SharedString.TextSegment>segment;
                sharedString.insertText(textSegment.text, sharedString.client.getLength(),
                    textSegment.properties);
            }
        }
    });
}

export function activate(context: vscode.ExtensionContext) {
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.collab', () => {
        // The code you place here will be executed every time your command is executed
        initializeSnapshot();
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
