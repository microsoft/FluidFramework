/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Char, KeyCode, randomId } from "@fluid-example/flow-util-lib";
import { ISegment, MapLike, TextSegment } from "@microsoft/fluid-merge-tree";
import { FlowDocument, getDocSegmentKind } from "../document";
import { Caret } from "../editor/caret";
import { PlainTextFormatter } from "../plaintext/formatter";
import { emptyArray, getSegmentRange } from "../util";
import { Tag } from "../util/tag";
import { IFormatterState } from "../view/formatter";
import { ILayoutCursor, Layout } from "../view/layout";
import { MarkdownParser } from "./parser";
import { MarkdownToken } from "./types";

const parserAnnotationSym = Symbol("parserAnnotation");
const modeSym = Symbol("mode");

interface IMarkdownParserAnnotation {
    start?: { token: MarkdownToken, props?: MapLike<string | number> }[];
    pop?: number;
}

interface IMarkdownRenderInfo {
    readonly tags: ReadonlyArray<Tag>;
    readonly emitText: boolean;
}

const undefinedRenderInfo = { tags: emptyArray, emitText: false };

const tokenToRenderInfo: { [index: string]: IMarkdownRenderInfo } = Object.freeze({
    [MarkdownToken.break]: { tags: [Tag.br], emitText: true },
    [MarkdownToken.code]: { tags: [Tag.pre, Tag.code], emitText: true },
    [MarkdownToken.emphasis]: { tags: [Tag.em], emitText: true },
    [MarkdownToken.blockquote]: { tags: [Tag.blockquote], emitText: true },
    [MarkdownToken.heading1]: { tags: [Tag.h1], emitText: true },
    [MarkdownToken.heading2]: { tags: [Tag.h2], emitText: true },
    [MarkdownToken.heading3]: { tags: [Tag.h3], emitText: true },
    [MarkdownToken.heading4]: { tags: [Tag.h4], emitText: true },
    [MarkdownToken.heading5]: { tags: [Tag.h5], emitText: true },
    [MarkdownToken.heading6]: { tags: [Tag.h6], emitText: true },
    [MarkdownToken.image]: { tags: [Tag.img], emitText: true },
    [MarkdownToken.inlineCode]: { tags: [Tag.code], emitText: true },
    [MarkdownToken.link]: { tags: [Tag.a], emitText: true },
    [MarkdownToken.listItem]: { tags: [Tag.li], emitText: false },
    [MarkdownToken.orderedlist]: { tags: [Tag.ol], emitText: true },
    [MarkdownToken.paragraph]: { tags: [Tag.p], emitText: true },
    [MarkdownToken.strong]: { tags: [Tag.strong], emitText: true },
    [MarkdownToken.table]: { tags: [Tag.table], emitText: true },
    [MarkdownToken.tableCell]: { tags: [Tag.td], emitText: true },
    [MarkdownToken.tableRow]: { tags: [Tag.tr], emitText: true },
    [MarkdownToken.text]: { tags: emptyArray, emitText: true },
    [MarkdownToken.unorderedlist]: { tags: [Tag.ul], emitText: true },
});

interface IMarkdownState extends IFormatterState {
    active?: Readonly<MarkdownToken[]>;
}

class MarkdownFormatter extends PlainTextFormatter<IMarkdownState> {
    public begin(layout: Layout, init: Readonly<Partial<IMarkdownState>>) {
        return init;
    }

    public end(layout: Layout, state: Readonly<IMarkdownState>) {
        const { active } = state;
        for (let i = active.length - 1; i >= 0; i--) {
            layout.popNode(this.getRenderInfo(active[i]).tags.length);
        }
    }

    public visit(layout: Layout, state: Readonly<IMarkdownState>) {
        const active = state.active ? [...state.active] : [];
        const { segment } = layout;
        const md = segment[parserAnnotationSym] as IMarkdownParserAnnotation;

        const pop = md && md.pop;
        for (let i = 0; i < pop; i++) {
            layout.popNode(this.getRenderInfo(active.pop()).tags.length);
        }

        const start = (md && md.start) || emptyArray;
        for (const { token, props } of start) {
            active.push(token);
            let element: HTMLElement;
            const tags = this.getRenderInfo(token).tags;
            for (const tag of tags) {
                element = layout.pushTag(tag);
            }
            if (props) {
                Object.assign(element, props);
            }
        }

        segment[modeSym] = this.calculateMode(active);
        const top = active[active.length - 1];

        if (TextSegment.is(segment)) {
            if (this.getRenderInfo(top).emitText) {
                layout.emitText(segment.text);
            }
        } else {
            console.warn(`Not 'markdown': '${getDocSegmentKind(segment)}'`);
        }

        return {
            state: {
                active: active.length > 0
                    ? Object.freeze(active)
                    : emptyArray,
            },
            consumed: true,
        };
    }

    public onChange() { }

    public prepare(layout: Layout, start: number, end: number) {
        const { doc } = layout;
        const parser = new MarkdownParser(
            (position, token, props) => { this.enter(doc, position, token, props); },
            (position) => { this.leave(doc, position); });
        parser.parse(this.getTextAndResetMDInfo(doc));
        return { start: 0, end: doc.length };
    }

    public segmentAndOffsetToNodeAndOffset(layout: Layout, state: Readonly<IMarkdownState>, segment: ISegment, offset: number, cursor: ILayoutCursor): { node: Node, nodeOffset: number } | undefined {
        let { previous: node } = cursor;

        // If there was no previous node, the cursor is located at the first child of the parent.
        if (!node) {
            const { parent } = cursor;
            return { node: parent, nodeOffset: 0 };
        }

        // If the previous node was a non-text element, place the cursor at the end of the non-text element's content.
        while (node.nodeType !== Node.TEXT_NODE) {
            const { childNodes } = node;
            const { length } = childNodes;

            // We cannot descend any further.
            if (length === 0) {
                return { node, nodeOffset: 0 };
            }

            // Coerce NaN to last child
            node = node.childNodes[childNodes.length - 1];

            // If we've found a text node, set the offset to the just after the end of the text.
            if (node.nodeType === Node.TEXT_NODE) {
                offset = node.textContent.length;
            }
        }

        // Coerce NaN to the position after the last character
        {
            const { length } = node.textContent;
            return { node, nodeOffset: offset < length ? offset : length };
        }
    }

    public nodeAndOffsetToSegmentAndOffset(layout: Layout, state: Readonly<IMarkdownState>, node: Node, nodeOffset: number, segment: ISegment, cursor: Readonly<ILayoutCursor>) {
        const top = state.active[state.active.length - 1];

        // If this node's text is suppressed, slide past this segment's content.
        const offset = this.getRenderInfo(top).emitText
            ? nodeOffset
            : segment.cachedLength;

        return { segment, offset };
    }

    public onKeyPress(layout: Layout, state: Readonly<IMarkdownState>, caret: Caret, e: KeyboardEvent) {
        const { doc } = layout;
        const { position } = caret;

        console.log(`${this.getLinePrecedingChars(doc, position)}`);

        if (e.key === KeyCode.enter) {
            const mode = this.getMode(doc, position);
            if (mode === MarkdownToken.paragraph) {
                this.insertText(layout, caret, `\n\n${Char.zeroWidthSpace}`);
                return;
            } else if (mode === MarkdownToken.listItem) {
                if (!this.matchLinePrecedingChars(doc, position, /^\s*(\*\s*)?$/)) {
                    this.insertText(layout, caret, "\n* ");
                    return;
                }
            } else {
                this.insertText(layout, caret, "\n");
                return;
            }
        } else if (e.key === KeyCode.space) {
            if (position >= doc.length) {
                this.insertText(layout, caret, Char.enSpace);
                return;
            } else if (this.getLineFollowingChars(doc, caret.position).startsWith("\n")) {
                this.insertText(layout, caret, Char.enSpace);
                return;
            }
        }

        const preceding = this.getLinePrecedingChars(doc, position);
        const isPlaceholder = preceding.endsWith(Char.zeroWidthSpace);
        if (isPlaceholder) {
            doc.remove(position - 1, position);
        }

        return super.onKeyPress(layout, state, caret, e);
    }

    private calculateMode(active: MarkdownToken[]) {
        for (let i = active.length - 1; i >= 0; i--) {
            const top = active[i];
            if (top !== MarkdownToken.text) {
                return top;
            }
        }

        // If we don't know, assume it's a paragraph.
        return MarkdownToken.paragraph;
    }

    private getMode(doc: FlowDocument, position: number) {
        const segment = position > 0
            ? doc.getSegmentAndOffset(position - 1).segment
            : undefined;
        return segment
            ? segment[modeSym]
            : MarkdownToken.paragraph;
    }

    private getEnsuredParserAnnotation(doc: FlowDocument, position: number): IMarkdownParserAnnotation {
        // Ensure this segment will not coalesce by annotating with a unique id, if it doesn't have one already.
        let { segment } = doc.getSegmentAndOffset(position);
        const tid = segment.properties && segment.properties.tid;
        if (!tid) {
            doc.annotate(position, position + 1, { tid: randomId() });

            // Annotating may have caused the segment to split.  Retrieve it again.
            segment = doc.getSegmentAndOffset(position).segment;
        }

        let tags = segment[parserAnnotationSym];
        if (tags === undefined) {
            segment[parserAnnotationSym] = tags = {};
        }
        return tags;
    }

    private enter(doc: FlowDocument, position: number, token: MarkdownToken, props: MapLike<string | number>) {
        // TODO: To reduce allocation, consider changing the type of 'md.start' to:
        //       token | { token, props } | (token | { token, props })[]
        //
        //       Otherwise, we might as well have the parser always alloc an object.
        const md = this.getEnsuredParserAnnotation(doc, position);
        md.start = md.start || [];
        md.start.push({ token, props });
    }

    private leave(doc: FlowDocument, position: number) {
        if (position < doc.length) {
            const md = this.getEnsuredParserAnnotation(doc, position);
            md.pop = (md.pop | 0) + 1;        // Coerce 'undefined' to 0
        }
    }

    private getTextAndResetMDInfo(doc: FlowDocument) {
        let text = "";

        doc.visitRange((_, segment) => {
            if (segment[parserAnnotationSym]) {
                segment[parserAnnotationSym] = undefined;
            }

            if (TextSegment.is(segment)) {
                text += segment.text;
            } else {
                text += Char.replacementCharacter;
            }

            return true;
        });

        return text;
    }

    private matchLinePrecedingChars(doc: FlowDocument, position: number, regex: RegExp) {
        const chars = this.getLinePrecedingChars(doc, position);
        return regex.exec(chars);
    }

    private getLinePrecedingChars(doc: FlowDocument, position: number) {
        let chars = "";
        position--;
        while (position >= 0) {
            const { segment, offset } = doc.getSegmentAndOffset(position);
            if (TextSegment.is(segment)) {
                const { text } = segment;
                const lineEnd = text.lastIndexOf("\n", offset);
                chars = text.slice(Math.max(lineEnd + 1, offset)) + chars;      // +1 to exclude the \n
                if (lineEnd >= 0) {
                    return chars;
                }
            }
            position = getSegmentRange(position, segment, offset).start - 1;
        }
        return chars;
    }

    private getLineFollowingChars(doc: FlowDocument, pos: number) {
        let chars = "";
        doc.visitRange((position, segment, startOffset, endOffset) => {
            if (TextSegment.is(segment)) {
                const { text } = segment;
                const lineEnd = text.indexOf("\n", startOffset);
                chars += text.slice(Math.max(startOffset, 0), Math.max(lineEnd, text.length));
                return lineEnd < 0;
            }
        }, pos + 1);
        return chars;
    }

    private getRenderInfo(token: MarkdownToken): Readonly<IMarkdownRenderInfo> {
        if (token === undefined) {
            return undefinedRenderInfo;
        }

        const info = tokenToRenderInfo[token];
        assert.notEqual(info, undefined);
        return info;
    }
}

export const markdownFormatter = Object.freeze(new MarkdownFormatter());
