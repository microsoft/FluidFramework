/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Char, randomId } from "@fluid-example/flow-util-lib";
import { MapLike, TextSegment } from "@microsoft/fluid-merge-tree";
import { FlowDocument, getDocSegmentKind } from "../document";
import { PlainTextFormatter } from "../plaintext/formatter";
import { emptyArray } from "../util";
import { Tag } from "../util/tag";
import { IFormatterState } from "../view/formatter";
import { Layout } from "../view/layout";
import * as styles from "./index.css";
import { MarkdownParser } from "./parser";
import { MarkdownToken } from "./types";

const parserAnnotationSym = Symbol("parserAnnotation");

interface IMarkdownParserAnnotation {
    start?: { token: MarkdownToken, props?: MapLike<string | number> }[];
    pop?: number;
}

interface IMarkdownState extends IFormatterState {
    active?: Readonly<MarkdownToken[]>;
}

interface IMarkdownRenderInfo {
    readonly tag: Tag;
    readonly className: string;
}

const undefinedRenderInfo = { tag: Tag.span, className: undefined };

const tokenToRenderInfo: { [index: string]: IMarkdownRenderInfo } = Object.freeze({
    [MarkdownToken.break]: { tag: Tag.span, className: styles.break },
    [MarkdownToken.code]: { tag: Tag.span, className: styles.code },
    [MarkdownToken.emphasis]: { tag: Tag.span, className: styles.emphasis },
    [MarkdownToken.blockquote]: { tag: Tag.span, className: styles.blockquote },
    [MarkdownToken.heading1]: { tag: Tag.span, className: styles.heading1 },
    [MarkdownToken.heading2]: { tag: Tag.span, className: styles.heading2 },
    [MarkdownToken.heading3]: { tag: Tag.span, className: styles.heading3 },
    [MarkdownToken.heading4]: { tag: Tag.span, className: styles.heading4 },
    [MarkdownToken.heading5]: { tag: Tag.span, className: styles.heading5 },
    [MarkdownToken.heading6]: { tag: Tag.span, className: styles.heading6 },
    [MarkdownToken.image]: { tag: Tag.span, className: styles.image },
    [MarkdownToken.inlineCode]: { tag: Tag.span, className: styles.inlineCode },
    [MarkdownToken.link]: { tag: Tag.span, className: styles.link },
    [MarkdownToken.listItem]: { tag: Tag.span, className: styles.listItem },
    [MarkdownToken.orderedlist]: { tag: Tag.span, className: styles.orderedlist },
    [MarkdownToken.paragraph]: { tag: Tag.span, className: styles.paragraph },
    [MarkdownToken.strong]: { tag: Tag.span, className: styles.strong },
    [MarkdownToken.table]: { tag: Tag.span, className: styles.table },
    [MarkdownToken.tableCell]: { tag: Tag.span, className: styles.tableCell },
    [MarkdownToken.tableRow]: { tag: Tag.span, className: styles.tableRow },
    [MarkdownToken.text]: { tag: Tag.span, className: styles.text },
    [MarkdownToken.unorderedlist]: { tag: Tag.span, className: styles.unorderedlist },
});

class MarkdownHighlightFormatter extends PlainTextFormatter<IMarkdownState> {
    public begin(layout: Layout, init: Readonly<Partial<IMarkdownState>>) {
        super.begin(layout, init);

        (layout.cursor.parent as Element).className = styles.root;

        return init;
    }

    public end(layout: Layout, state: Readonly<IMarkdownState>) {
        const { active } = state;
        layout.popNode(active.length);

        super.end(layout, state);
    }

    public visit(layout: Layout, state: Readonly<IMarkdownState>) {
        let active = state.active ? [...state.active] : [];
        const { segment } = layout;
        const md = segment[parserAnnotationSym] as IMarkdownParserAnnotation;

        if (md && md.pop) {
            layout.popNode(md.pop);
            active = active.slice(0, -md.pop);
        }

        const start = (md && md.start) || emptyArray;
        for (const { token } of start) {
            const info = this.getRenderInfo(token);
            active.push(token);
            const element = layout.pushTag(info.tag);
            element.className = info.className;
        }

        if (TextSegment.is(segment)) {
            layout.emitText(segment.text);
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

    private getRenderInfo(token: MarkdownToken): Readonly<IMarkdownRenderInfo> {
        if (token === undefined) {
            return undefinedRenderInfo;
        }

        const info = tokenToRenderInfo[token];
        assert.notEqual(info, undefined);
        return info;
    }
}

export const markdownHighlightFormatter = Object.freeze(new MarkdownHighlightFormatter());
