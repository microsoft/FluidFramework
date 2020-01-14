/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Char, Direction, getDeltaX, KeyCode } from "@fluid-example/flow-util-lib";
import { ISegment, TextSegment } from "@microsoft/fluid-merge-tree";
import { FlowDocument } from "../";
import { ClipboardFormat } from "../clipboard/paste";
import { Caret } from "../editor/caret";
import { Tag } from "../util/tag";
import { IFormatterState, RootFormatter } from "../view/formatter";
import { eotSegment, ILayoutCursor, Layout } from "../view/layout";
import { debug } from "./debug";

export class PlainTextFormatter<TState extends IFormatterState> extends RootFormatter<TState> {
    public begin(layout: Layout, init: Readonly<Partial<TState>>) {
        const e = layout.pushTag(Tag.pre);
        e.style.whiteSpace = "pre-wrap";
        return init as Readonly<TState>;
    }

    public end(layout: Layout, state: Readonly<TState>) {
        layout.emitText(Char.zeroWidthSpace);
        layout.popNode();
    }

    public visit(layout: Layout, state: Readonly<TState>) {
        const segment = layout.segment;

        if (TextSegment.is(segment)) {
            layout.emitText(segment.text);
        } else {
            layout.emitNode(document.createTextNode(Char.replacementCharacter));
        }

        return { state, consumed: true };
    }

    public onChange() { }

    public onKeyDown(layout: Layout, state: Readonly<TState>, caret: Caret, e: KeyboardEvent) {

        switch (e.code) {
            // Note: Chrome 69 delivers backspace on 'keydown' only (i.e., 'keypress' is not fired.)
            case KeyCode.backspace: {
                this.delete(layout.doc, caret, Direction.left);
                return true;
            }
            case KeyCode.delete: {
                this.delete(layout.doc, caret, Direction.right);
                return true;
            }

            default:
                return false;
        }
    }

    public onKeyPress(layout: Layout, state: Readonly<TState>, caret: Caret, e: KeyboardEvent) {
        switch (e.key) {
            case KeyCode.enter:
                this.insertText(layout, caret, "\n");
                break;
            default:
                // eslint-disable-next-line no-case-declarations
                const text = e.key;
                this.insertText(layout, caret, text);
        }

        return true;
    }

    public onPaste(layout: Layout, state: Readonly<TState>, caret: Caret, e: ClipboardEvent) {
        const content = e.clipboardData.getData(ClipboardFormat.text);
        if (content) {
            debug("paste('%s'): %s", ClipboardFormat.text, content);
            this.insertText(layout, caret, content);
            return true;
        }

        return super.onPaste(layout, state, caret, e);
    }

    public segmentAndOffsetToNodeAndOffset(layout: Layout, state: Readonly<TState>, segment: ISegment, offset: number, cursor: ILayoutCursor): { node: Node, nodeOffset: number } | undefined {
        if (segment === eotSegment) {
            return { node: cursor.previous.lastChild, nodeOffset: 0 };
        }
        return { node: cursor.previous, nodeOffset: offset };
    }

    public nodeAndOffsetToSegmentAndOffset(layout: Layout, state: Readonly<TState>, node: Node, nodeOffset: number, segment: ISegment, cursor: Readonly<ILayoutCursor>) {
        return { segment, offset: nodeOffset };
    }

    protected insertText(layout: Layout, caret: Caret, text: string) {
        const { doc } = layout;
        const { start, end } = caret.selection;
        if (start === end) {
            doc.insertText(end, text);
        } else {
            doc.replaceWithText(start, end, text);
        }
    }

    private delete(doc: FlowDocument, caret: Caret, direction: Direction) {
        let { start, end } = caret.selection;

        if (start === end) {
            // If no range is currently selected, delete the preceding character (if any).
            const dx = getDeltaX(direction);
            if (dx < 0) {
                start--;
            } else {
                end++;
            }
        }

        doc.remove(Math.max(0, start), Math.min(end, doc.length));
        caret.collapseForward();
    }
}

export const plainTextFormatter = Object.freeze(new PlainTextFormatter());
