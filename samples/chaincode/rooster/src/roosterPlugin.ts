import {Editor, EditorPlugin, PluginEvent, PluginEventType, InsertOption, ContentPosition } from "roosterjs";
import { SharedString } from "@prague/sequence";
import { ISequencedDocumentMessage } from "@prague/container-definitions";

interface FormatInputEvent extends InputEvent {
    inputType: string;
}

interface SelectionRange {
    length: number;
    start: number;
    end: number;
}

export class CollabPlugin implements EditorPlugin {
    private editor: Editor

    constructor(private contentString: SharedString) {
    }

    getName() {
        return 'CollabPlugin';
    }

    initialize(editor: Editor) {

        this.editor = editor;
        this.contentString.on("op", (op: ISequencedDocumentMessage, local: boolean, target: SharedString) => {
            this.handleOpEvent(this.editor, op, local, target);
        });
        this.contentString.on("valueChanged", (changed, local, op, target) => {
            console.log("Value Changed");
        });
        this.contentString.on("sequenceDelta", (event, target) => {
            console.log("Sequence Changed");
            console.log(event);
        })

    }

    dispose() {
        this.editor = null;
    }

    willHandleEventExclusively(event: PluginEvent) {
        // This seems to "eat" the event from *other plugins*
        // We probably want to eat the event from the actual editor
        return false;
    }

    onPluginEvent(event: PluginEvent) {
        switch(event.eventType) {
            case PluginEventType.KeyDown:
            case PluginEventType.KeyPress:
            case PluginEventType.KeyUp:
            case PluginEventType.CompositionEnd:
            case PluginEventType.MouseDown:
            case PluginEventType.MouseUp:
            case PluginEventType.ContentChanged:
            case PluginEventType.ExtractContent:
            case PluginEventType.BeforePaste:
            case PluginEventType.EditorReady:
            case PluginEventType.BeforeDispose: {
                break;
            }
            case PluginEventType.Input: {
                console.log("Input")

                let inputEvent = <InputEvent>event.rawEvent; // This seems to have an inputType thing that could be "formatBold"

                if ( inputEvent.data && (inputEvent.data as string).match(/^[a-z0-9!"#$%&'()*+,.\/:;<=>?@\[\] ^_`{|}~-]*$/i) ) {
                    this.handleInsert(inputEvent)
                } else if (inputEvent["inputType"] && inputEvent["inputType"] === "deleteContentBackward") {
                    this.handleDelete(inputEvent as FormatInputEvent);
                } else {
                    console.log(`Not a printable or format character:`)
                    console.log(inputEvent);
                }
                break;
            }
        }
    }

    private handleInsert(event: InputEvent) {
        console.log(`Printable character: ${event.data}`);

        // Not needed because the editor inserts anyway
        // this.editor.insertContent(event.data);
        const pos = this.getPosition()
        this.contentString.insertText(event.data, pos.start - 1); // 1 vs 0 base
    }

    private handleDelete(event: FormatInputEvent) {
        console.log("Delete");

        const pos = this.getPosition();
        
        this.contentString.removeText(pos.start, pos.start+1);
    }

    private getPosition(): SelectionRange {
        const selection = this.editor.getSelection();
        const parent = selection.anchorNode.parentNode;
        const first = parent.firstChild;

        const start = this.distanceBetweenSiblingNodes(first, selection.anchorNode) + selection.anchorOffset;

        return {
            length: 0,
            start,
            end: start + length,
        };
    }

    // Offset is start of node to point in node... so this takes us past the beginning of the no.
    private distanceBetweenSiblingNodes(left: Node, right: Node): number {
        let i = 0;
        while(left.nextSibling && !left.isSameNode(right)) {
            i = i + left.textContent.length;
            left = left.nextSibling;
        }
        return i;
    }

    private handleOpEvent(editor: Editor, op: ISequencedDocumentMessage, local: boolean, target: SharedString) {
        if (this.editor !== undefined) {

            console.log("handleOpEvent");
            console.log(op); // 0123456a789 : op @ pos1 7
            console.log(this.contentString.getText())
            this.editor.focus();
    
            // This is basically what part of the selection to insert at 
            const insertOption: InsertOption = {
                position: ContentPosition.SelectionStart
            };
    
            if (!local) {
                if (op.contents.type === 0) {
                    this.setSelectionFromOp(op);
                    editor.insertContent(op.contents.seg, insertOption);
                } else if (op.contents.type === 1) {
                    // this.setSelectionFromOp(op);
                    // editor.insertContent("", insertOption);
                    this.removeContentsOfSelection(this.setSelectionFromOp(op));
                }
            } else {
                console.log(this.contentString.getText());
            }
        } else {
            console.log("No Editor yet!");
        }
    }

    private removeContentsOfSelection(selection: Selection) {
        // anchorNode && focusNode are the same
        if (selection.anchorNode.isSameNode(selection.focusNode)) {
            this.removeSubstrOfNode(selection.anchorNode, selection.anchorOffset, selection.focusOffset);
        } else { // anchorNode && focusNode are different
            const traverser = this.editor.getBodyTraverser();
            let curNode: Node;
            let withinRange = false;
            do {
                curNode = traverser.currentInlineElement.getContainerNode();

                if (curNode.isSameNode(selection.anchorNode)) {
                    withinRange = true;
                    // What if the anchorNode offset = the length of the anchorNode Text

                    this.removeSubstrOfNode(curNode, selection.anchorOffset);
                } else if (curNode.isSameNode(selection.focusNode)) {
                    this.removeSubstrOfNode(selection.focusNode, 0, selection.focusOffset);

                    // We've addressed the final node
                    break;
                } else if (withinRange) {
                    this.editor.deleteNode(curNode);
                }

            } while (traverser.getNextInlineElement());
        }

    }

    private removeSubstrOfNode(node: Node, start: number, end?: number) {
        // This is when the offset is the length of the textContent
        if (node.textContent.length === start) {
            return;
        }

        let textContent = node.textContent;
        textContent = textContent.substr(0, start) + (end ? textContent.substr(end) : "");
        const dupNode = node.cloneNode()
        dupNode.textContent = textContent;
        this.editor.replaceNode(node, dupNode);
    }

    private setSelectionFromOp(op: ISequencedDocumentMessage): Selection {
        const existingSelection = this.editor.getSelection()
        console.log(existingSelection);
        const traverser = this.editor.getBodyTraverser();
        let length = 0;
        let curNode: Node;

        let startNode: Node;
        let startOffset: number;
        let endNode: Node;
        let endOffset: number;

        do {
            curNode = traverser.currentInlineElement.getContainerNode();
            if (curNode.nodeName === "#text") {
                if (!startNode && length + curNode.textContent.length >= op.contents.pos1) {
                    startNode = curNode;
                    startOffset = op.contents.pos1 - length;
                }

                if (!endNode && op.contents.pos2 && length + curNode.textContent.length >= op.contents.pos2) {
                    endNode = curNode;
                    endOffset = op.contents.pos2 - length;
                }

                if (startNode && ((op.contents.pos2 && endNode) || !op.contents.pos2)) {
                    break;
                }

                length += curNode.textContent.length;
            }
        } while (traverser.getNextInlineElement())

        if (op.contents.pos2) {
            this.editor.select(startNode, startOffset, endNode, endOffset);
        } else {
            this.editor.select(startNode, startOffset);
        }
        console.log(this.editor.getSelection());
        return this.editor.getSelection();
    }
}