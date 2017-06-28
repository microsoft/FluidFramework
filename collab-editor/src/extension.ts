// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { api, sharedString as SharedString, socketStorage } from 'routerlicious';

socketStorage.registerAsDefault("http://localhost:3000");
const extension = api.defaultRegistry.getExtension(SharedString.CollaboritiveStringExtension.Type);
let services = api.getDefaultServices();

interface ILineCountBlock extends SharedString.Block {
    lineCount: number;
}

function lcToPos(mergeTree: SharedString.MergeTree, line: number, column: number) {
    let pos: number;
    let shift = (node: SharedString.Node) => {
        line -= getLineCount(node);
        return true;
    }
    let leaf = (segment: SharedString.Segment, segpos: number) => {
        if (line == 0) {
            if (segment.getType() == SharedString.SegmentType.Marker) {
                let marker = <SharedString.Marker>segment;
                if (marker.type == "line") {
                    pos = column + segpos;
                    return false;
                }
            }
        }
        return true;
    }

    mergeTree.mapRange({ leaf: leaf, shift: shift },
        SharedString.UniversalSequenceNumber, mergeTree.collabWindow.clientId);
    return pos;
}

function posToLc(mergeTree: SharedString.MergeTree, pos: number) {
    let line = 0;
    let linePos: number;
    let shift = (node: SharedString.Node, segpos: number, refSeq: number, clientId: number, offset: number) => {
        line += getLineCount(node);
        if (node.isLeaf() && ((<SharedString.Segment>node).getType() == SharedString.SegmentType.Marker)) {
            linePos = segpos;
        }
        return true;
    }
    mergeTree.search(pos, SharedString.UniversalSequenceNumber, mergeTree.collabWindow.clientId,
        { shift: shift });
    return { line: line, column: pos - linePos };
}

function getLineCount(node: SharedString.Node) {
    if (node.isLeaf()) {
        let segment = <SharedString.Segment>node;
        if (segment.getType() == SharedString.SegmentType.Marker) {
            let marker = <SharedString.Marker>segment;
            if (marker.type == "line") {
                return 1;
            }
        }
        return 0;
    }
    else {
        return (<ILineCountBlock>node).lineCount;
    }
}

class FlowFilter {
    serverChange = false;
    constructor(public sharedString: SharedString.SharedString) {
        sharedString.client.mergeTree.blockUpdateActions = {
            child: (block, index) => {
                this.blockUpdateChild(<ILineCountBlock>block, index);
            }
        }
    }

    blockUpdateChild(block: ILineCountBlock, index: number) {
        if (index == 0) {
            block.lineCount = 0;
        }
        let node = block.children[index];
        block.lineCount += getLineCount(node);
    }

    setEvents() {
        let editor = vscode.window.activeTextEditor;
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (!this.serverChange) {
                for (let change of e.contentChanges) {
                    console.log(`change ${change.range.start.line}, ${change.range.start.character} ${change.text}`);
                    let pos1 = lcToPos(this.sharedString.client.mergeTree, change.range.start.line, change.range.start.character);
                    let pos2 = lcToPos(this.sharedString.client.mergeTree, change.range.end.line, change.range.end.character);
                    console.log(`change pos: ${pos1} ${pos2}`);
                    // assume insert for now
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
                        this.serverChange = true;
                        editor.edit((editBuilder) => {
                            let lc = posToLc(this.sharedString.client.mergeTree, delta.pos1);
                            let vspos = new vscode.Position(lc.line, lc.column);
                            editBuilder.insert(vspos, delta.text);
                        }).then((b) => {
                            this.serverChange = false;
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
                if (segment.getType() == SharedString.SegmentType.Text) {
                    let textSegment = <SharedString.TextSegment>segment;
                    let vspos = new vscode.Position(line, 0);
                    editBuilder.insert(vspos, textSegment.text + '\n');
                    line++;
                }
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

    const sharedString = extension.load("eee", services, api.defaultRegistry) as SharedString.SharedString;

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
            const lines = text.split(/\n|\r\n/);
            for (const line of lines) {
                sharedString
                else {
                    let textSegment = <SharedString.TextSegment>segment;
                    sharedString.insertText(textSegment.text, sharedString.client.getLength(),
                        textSegment.properties);
                }
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
