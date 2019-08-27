/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Char, KeyCode, randomId } from "@prague/flow-util";
import { ISegment, MapLike, TextSegment } from "@prague/merge-tree";
import { FlowDocument, getDocSegmentKind } from "../document";
import { Caret } from "../editor/caret";
import { PlainTextFormatter } from "../plaintext/formatter";
import { emptyArray } from "../util";
import { Tag } from "../util/tag";
import { IFormatterState } from "../view/formatter";
import { eotSegment, ILayoutCursor, Layout } from "../view/layout";
import { MarkdownParser } from "./parser";
import { MarkdownToken } from "./types";

const markdownSym = Symbol();
const modeSym = Symbol();

interface IMarkdownInfo {
    start?: { token: MarkdownToken, props?: MapLike<string | number> }[];
    pop?: number;
}

const tokenToTags = Object.freeze({
    [MarkdownToken.break]:          [ Tag.br ],
    [MarkdownToken.code]:           [ Tag.pre ],
    [MarkdownToken.emphasis]:       [ Tag.em ],
    [MarkdownToken.blockquote]:     [ Tag.blockquote ],
    [MarkdownToken.heading1]:       [ Tag.h1 ],
    [MarkdownToken.heading2]:       [ Tag.h2 ],
    [MarkdownToken.heading3]:       [ Tag.h3 ],
    [MarkdownToken.heading4]:       [ Tag.h4 ],
    [MarkdownToken.heading5]:       [ Tag.h5 ],
    [MarkdownToken.heading6]:       [ Tag.h6 ],
    [MarkdownToken.image]:          [ Tag.img ],
    [MarkdownToken.inlineCode]:     [ Tag.code ],
    [MarkdownToken.link]:           [ Tag.a ],
    [MarkdownToken.listItem]:       [ Tag.li ],
    [MarkdownToken.orderedlist]:    [ Tag.ol ],
    [MarkdownToken.paragraph]:      [ Tag.p ],
    [MarkdownToken.strong]:         [ Tag.strong ],
    [MarkdownToken.table]:          [ Tag.table ],
    [MarkdownToken.tableCell]:      [ Tag.td ],
    [MarkdownToken.tableRow]:       [ Tag.tr ],
    [MarkdownToken.text]:           [],
    [MarkdownToken.unorderedlist]:  [ Tag.ul ],
});

interface IMarkdownState extends IFormatterState {
    active?: Readonly<MarkdownToken[]>;
}

class MarkdownFormatter extends PlainTextFormatter<IMarkdownState> {
    public begin(layout: Layout, init: Readonly<Partial<IMarkdownState>>) {
        // const span = layout.pushTag(Tag.span);
        // span.style.whiteSpace = "pre-wrap";
        return init;
    }

    public end(layout: Layout, state: Readonly<IMarkdownState>) {
        const { active } = state;
        for (let i = active.length - 1; i >= 0; i--) {
            layout.popNode(tokenToTags[active[i]].length);
        }

        // layout.emitText(Char.zeroWidthSpace);
        // layout.popNode();
    }

    public visit(layout: Layout, state: Readonly<IMarkdownState>) {
        const active = state.active ? [...state.active] : [];
        const { segment } = layout;
        const md = segment[markdownSym] as IMarkdownInfo;

        const pop = md && md.pop;
        for (let i = 0; i < pop; i++) {
            const token = active.pop();
            const tags = tokenToTags[token];
            if (tags) {
                layout.popNode(tags.length);
            } else {
                console.warn(`Unknown MarkdownToken: ${token}`);
            }
        }

        const start = (md && md.start) || emptyArray;
        for (const { token, props } of start) {
            active.push(token);
            let element: HTMLElement;
            const tags = tokenToTags[token];
            if (tags) {
                for (const tag of tokenToTags[token]) {
                    element = layout.pushTag(tag);
                }
                if (props) {
                    Object.assign(element, props);
                }
            } else {
                console.warn(`Unknown MarkdownToken: ${token}`);
            }
        }

        segment[modeSym] = this.getMode(active);
        const top = active[active.length - 1];

        if (TextSegment.is(segment)) {
            if (top === undefined) {

            } else if (top === MarkdownToken.softbreak) {
                layout.emitText(Char.zeroWidthSpace);
            } else if (top !== MarkdownToken.listItem) {
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
            (position, token) => { this.leave(doc, position); });
        parser.parse(this.getTextAndResetMDInfo(doc));
        return { start: 0, end: doc.length };
    }

    public segmentAndOffsetToNodeAndOffset(layout: Layout, state: Readonly<IMarkdownState>, segment: ISegment, offset: number, cursor: ILayoutCursor): { node: Node, nodeOffset: number } | undefined {
        if (segment === eotSegment) {
            const node = cursor.previous.lastChild;
            return { node, nodeOffset: node.textContent.length };
        }
        return { node: cursor.previous, nodeOffset: offset };
    }

    public nodeAndOffsetToSegmentAndOffset(layout: Layout, state: Readonly<IMarkdownState>, node: Node, nodeOffset: number, segment: ISegment, cursor: Readonly<ILayoutCursor>) {
        return { segment, offset: nodeOffset };
    }

    public onKeyPress(layout: Layout, state: Readonly<IMarkdownState>, caret: Caret, e: KeyboardEvent) {
        if (e.key === KeyCode.enter) {
            const { position } = caret;
            const segment = position > 0
                ? layout.doc.getSegmentAndOffset(position - 1).segment
                : undefined;
            if (!segment || segment[modeSym] === MarkdownToken.paragraph) {
                this.insertText(layout, caret, `\n\n${Char.zeroWidthSpace}`);
            } else {
                this.insertText(layout, caret, `\n${Char.zeroWidthSpace}`);
            }
        }

        return super.onKeyPress(layout, state, caret, e);
    }

    private getMode(active: MarkdownToken[]) {
        for (let i = active.length - 1; i >= 0; i--) {
            const top = active[i];
            if (top !== MarkdownToken.text) {
                return top;
            }
        }

        // If we don't know, assume it's a paragraph.
        return MarkdownToken.paragraph;
    }

    private getEnsuredTags(doc: FlowDocument, position: number): IMarkdownInfo {
        // Ensure this segment will not coalesce by annotating with a unique id, if it doesn't have one already.
        let { segment } = doc.getSegmentAndOffset(position);
        const tid = segment.properties && segment.properties.tid;
        if (!tid) {
            doc.annotate(position, position + 1, { tid: randomId() });

            // Annotating may have caused the segment to split.  Retrieve it again.
            segment = doc.getSegmentAndOffset(position).segment;
        }

        let tags = segment[markdownSym];
        if (tags === undefined) {
            segment[markdownSym] = tags = {};
        }
        return tags;
    }

    private enter(doc: FlowDocument, position: number, token: MarkdownToken, props: MapLike<string | number>) {
        // TODO: To reduce allocation, consider changing the type of 'md.start' to:
        //       token | { token, props } | (token | { token, props })[]
        //
        //       Otherwise, we might as well have the parser always alloc an object.
        const md = this.getEnsuredTags(doc, position);
        md.start = md.start || [];
        md.start.push({ token, props });
    }

    private leave(doc: FlowDocument, position: number) {
        if (position < doc.length) {
            const md = this.getEnsuredTags(doc, position);
            // tslint:disable-next-line:no-bitwise
            md.pop = (md.pop | 0) + 1;        // Coerce 'undefined' to 0
        }
    }

    private getTextAndResetMDInfo(doc: FlowDocument) {
        let text = "";

        doc.visitRange((_, segment) => {
            if (segment[markdownSym]) {
                segment[markdownSym] = undefined;
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
}

export const markdownFormatter = Object.freeze(new MarkdownFormatter());
