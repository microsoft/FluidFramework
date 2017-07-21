// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { api, sharedString as SharedString, socketStorage } from 'routerlicious';

socketStorage.registerAsDefault("http://localhost:3000");
const extension = api.defaultRegistry.getExtension(SharedString.CollaboritiveStringExtension.Type);
let services = api.getDefaultServices();
let collabDocs = {};

interface ILineCountBlock extends SharedString.Block {
    lineCount: number;
}

function lcToPos(mergeTree: SharedString.MergeTree, line: number, column: number) {
    let pos: number;
    let shift = (node: SharedString.Node) => {
        line -= getLineCount(node);
        return true;
    }
    let contains = (node: SharedString.Node) => {
        return line < getLineCount(node);
    }
    let leaf = (segment: SharedString.Segment, segpos: number) => {
        if (segment.getType() == SharedString.SegmentType.Marker) {
            let marker = <SharedString.Marker>segment;
            if (marker.type == "line") {
                pos = column + segpos + 1;
            }
        }
        else {
            console.log(`expected marker; got ${segment.getType()}`);
        }
        return false;
    }

    mergeTree.search(Number.MAX_SAFE_INTEGER, SharedString.UniversalSequenceNumber,
        mergeTree.collabWindow.clientId, { leaf, shift, contains });
    return pos;
}

function getRightmostMarker(node: SharedString.Node): SharedString.Marker {
    if (node.isLeaf()) {
        return <SharedString.Marker>node;
    }
    else {
        let block = <SharedString.Block>node;
        return block.rightmostMarkers["line"];
    }
}

function posToLc(mergeTree: SharedString.MergeTree, pos: number) {
    let line = -1;
    let lineMarker: SharedString.Marker;
    let column = -1;
    let shift = (node: SharedString.Node, segpos: number, refSeq: number, clientId: number, offset: number) => {
        let lineCount = getLineCount(node);
        if (lineCount > 0) {
            line += lineCount;
            lineMarker = getRightmostMarker(node);
        }
        return true;
    }
    let leaf = (segment: SharedString.Segment, segpos: number) => {
        let linePos = mergeTree.getOffset(lineMarker, SharedString.UniversalSequenceNumber, mergeTree.collabWindow.clientId);
        column = pos - (1 + linePos);
        return false;
    };
    if (pos === 0) {
        return { line: 0, column: 0 };
    }
    else {
        mergeTree.search(pos, SharedString.UniversalSequenceNumber, mergeTree.collabWindow.clientId,
            { shift, leaf });
        return { line, column };
    }
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
        if ((<ILineCountBlock>node).lineCount !== undefined) {
            return (<ILineCountBlock>node).lineCount;
        }
        else {
            return 0;
        }
    }
}

function blockUpdateChild(block: SharedString.Block, index: number) {
    let lineBlock = <ILineCountBlock>block;
    if (index == 0) {
        lineBlock.lineCount = 0;
    }
    let node = block.children[index];
    lineBlock.lineCount += getLineCount(node);
}


class FlowAdapter {
    serverChange = false;
    serverLive = false;
    editorBusy = false;
    checkOnCursor = false;
    serverEventQ = SharedString.Collections.ListMakeHead<api.IMessageBase>();
    editor: vscode.TextEditor; // for now assume 1:1 document and editor and that editor doesn't change

    constructor(public sharedString: SharedString.SharedString) {
        sharedString.client.mergeTree.blockUpdateActions = { child: blockUpdateChild };
    }

    setClientEvents() {
        vscode.workspace.onDidChangeTextDocument((e) => {
            console.log(`server change: ${this.serverChange}`);
            if (!this.serverChange) {
                if (this === collabDocs[e.document.fileName]) {
                    for (let change of e.contentChanges) {
                        let pos1 = lcToPos(this.sharedString.client.mergeTree, change.range.start.line, change.range.start.character);
                        if (change.rangeLength > 0) {
                            let pos2 = lcToPos(this.sharedString.client.mergeTree, change.range.end.line, change.range.end.character);
                            this.sharedString.removeText(pos1, pos2);
                        }
                        if (change.text && (change.text.length > 0)) {
                            // TODO: split by lines; for now, assume only '\n'
                            if (change.text == "\n") {
                                this.sharedString.insertMarker(pos1, "line",
                                    api.MarkerBehaviors.PropagatesForward);
                            }
                            else {
                                this.sharedString.insertText(change.text, pos1);
                            }
                        }
                    }
                }
            }
        });
        if (this.checkOnCursor) {
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (e.kind === vscode.TextEditorSelectionChangeKind.Keyboard) {
                    if (this === collabDocs[e.textEditor.document.fileName]) {
                        let sel = e.selections[0];
                        let pos = lcToPos(this.sharedString.client.mergeTree, sel.active.line, sel.active.character);
                        let lc = posToLc(this.sharedString.client.mergeTree, pos);
                        if ((sel.active.line != lc.line) || (sel.active.character != lc.column)) {
                            console.log(`mismatch: event (${sel.active.line}, ${sel.active.character}) vs. (${lc.line},${lc.column})`);
                        }
                        else {
                            console.log(`roundtrip!!! (${sel.active.line},${sel.active.character})`);
                        }
                    }
                }
            });
        }

    }

    setServerEvents() {
        this.sharedString.on("op", (msg: api.IMessageBase) => {
            if (msg && msg.op) {
                if (this.serverLive && (!this.editorBusy)) {
                    this.processServerEvent(msg);
                }
                else {
                    this.serverEventQ.enqueue(msg);
                }
            }
        });
    }

    setEditorBusy() {
        this.editorBusy = true;
        this.serverChange = true;
    }

    setEditorAvailable() {
        this.editorBusy = false;
        this.serverChange = false;
        if (!this.serverEventQ.empty()) {
            let msg = this.serverEventQ.dequeue();
            this.processServerEvent(msg);
        }
    }

    processServerEvent(msg: api.IMessageBase) {
        let seqmsg = <api.ISequencedMessage>msg;
        if (seqmsg.clientId != this.sharedString.client.longClientId) {
            let editor = this.editor;
            let delta = <api.IMergeTreeOp>msg.op;
            if (delta.type === api.MergeTreeDeltaType.INSERT) {
                let text = "";
                if (delta.text !== undefined) {
                    text = delta.text;
                }
                else if (delta.marker && (delta.marker.type == "line")) {
                    text = "\n";
                }
                if (text.length > 0) {
                    let pos = delta.pos1;
                    this.setEditorBusy();
                    editor.edit((editBuilder) => {
                        let localPos = this.sharedString.client.mergeTree.refPosToLocalPos(pos, seqmsg.referenceSequenceNumber,
                            this.sharedString.client.getShortClientId(seqmsg.clientId));
                        let lc = posToLc(this.sharedString.client.mergeTree, localPos);
                        let vspos = new vscode.Position(lc.line, lc.column);
                        console.log(`insert pos ${pos} localPos ${localPos} lc ${lc.line} ${lc.column} txt: ${text}`);
                        editBuilder.insert(vspos, text);
                    }).then((b) => {
                        this.setEditorAvailable();
                    });
                }
            }
            else if (delta.type === api.MergeTreeDeltaType.REMOVE) {
                this.setEditorBusy();
                let pos1 = delta.pos1;
                let pos2 = delta.pos2;
                // TODO: deal with local insert splitting remove range
                // need segment list from actual remove and can then get multiple ranges from this
                editor.edit((editBuilder) => {
                    let localPos1 = this.sharedString.client.mergeTree.refPosToLocalPos(pos1, seqmsg.referenceSequenceNumber,
                        this.sharedString.client.getShortClientId(seqmsg.clientId));
                    let lc1 = posToLc(this.sharedString.client.mergeTree, localPos1);
                    let vspos1 = new vscode.Position(lc1.line, lc1.column);
                    let localPos2 = this.sharedString.client.mergeTree.refPosToLocalPos(pos2, seqmsg.referenceSequenceNumber,
                        this.sharedString.client.getShortClientId(seqmsg.clientId));
                    let lc2 = posToLc(this.sharedString.client.mergeTree, localPos2);
                    let vspos2 = new vscode.Position(lc2.line, lc2.column);
                    let range = new vscode.Range(vspos1, vspos2);
                    console.log(`remove pos1 ${pos1} localPos1 ${localPos1} lc1 ${lc1.line} ${lc1.column} pos2 ${pos2} localPos2 ${localPos2} lc2 ${lc2.line} ${lc2.column}`);
                    editBuilder.delete(range);
                }).then((b) => {
                    this.setEditorAvailable();
                });
            }
        }
        else {
            this.setEditorAvailable();
        }
    }

    insertTree() {
        let editor = vscode.window.activeTextEditor;
        this.setEditorBusy();
        editor.edit((editBuilder) => {
            let line = -1;
            let col = 0;

            function renderSegment(segment: SharedString.Segment, segPos: number, refSeq: number,
                clientId: number, start: number, end: number) {
                if (segment.getType() == SharedString.SegmentType.Text) {
                    let textSegment = <SharedString.TextSegment>segment;
                    let vspos = new vscode.Position(line, col);
                    editBuilder.insert(vspos, textSegment.text);
                    col += textSegment.text.length;
                }
                else if (segment.getType() == SharedString.SegmentType.Marker) {
                    // assume line marker
                    if (line >= 0) {
                        let vspos = new vscode.Position(line, col);
                        editBuilder.insert(vspos, "\n");
                    }
                    col = 0;
                    line++;
                }
                return true;
            }

            this.sharedString.client.mergeTree.mapRange({ leaf: renderSegment }, SharedString.UniversalSequenceNumber,
                this.sharedString.client.getClientId());
        }).then((b) => {
            this.setEditorAvailable();
            this.serverLive = true;
        });
    }
}

function initializeSnapshot(invite: boolean) {
    let editor = vscode.window.activeTextEditor;
    let doc = editor.document;
    SharedString.MergeTree.initBlockUpdateActions = { child: blockUpdateChild };
    vscode.window.showInputBox({ prompt: "sessionId: " }).then((sessionId?: string) => {
        if (sessionId) {
            const sharedString = extension.load(sessionId, services, api.defaultRegistry) as SharedString.SharedString;

            sharedString.on("partialLoad", (data: api.MergeTreeChunk) => {
            });

            function connect() {
                let flowAdapter = new FlowAdapter(sharedString);
                flowAdapter.editor = editor;
                collabDocs[doc.fileName] = flowAdapter;
                flowAdapter.setClientEvents();
                flowAdapter.setServerEvents();
                if (!invite) {
                    flowAdapter.insertTree();
                }
                else {
                    flowAdapter.setEditorAvailable();
                    flowAdapter.serverLive = true;
                }
            }

            sharedString.on("loadFinshed", (data: api.MergeTreeChunk) => {
                if (sharedString.client.getLength() !== 0) {
                    connect();
                } else if (invite) {
                    let text = doc.getText();
                    console.log("local load...");
                    const lines = text.split(/\r\n|\n/);
                    for (const line of lines) {
                        sharedString.insertMarker(sharedString.client.getLength(), "line", api.MarkerBehaviors.PropagatesForward);
                        if (line.length > 0) {
                            sharedString.insertText(line, sharedString.client.getLength());
                        }
                    }
                    connect();
                }
            });
        }
    });
}

export function activate(context: vscode.ExtensionContext) {
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.collabInvite', () => {
        // The code you place here will be executed every time your command is executed
        initializeSnapshot(true);
    });

    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('extension.collabJoin', () => {
        // The code you place here will be executed every time your command is executed
        initializeSnapshot(false);
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
}
