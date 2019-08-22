/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Char, randomId } from "@prague/flow-util";
import { MapLike, TextSegment } from "@prague/merge-tree";
import { FlowDocument, getDocSegmentKind } from "../document";
import { emptyArray } from "../util";
import { Tag } from "../util/tag";
import { IFormatterState, RootFormatter } from "../view/formatter";
import { Layout } from "../view/layout";
import { MarkdownParser, MarkdownToken } from "./parser";

const markdownSym = Symbol();

interface IMarkdownInfo {
    start?: { token: MarkdownToken, props?: MapLike<string | number> }[];
    pop?: number;
}

const tokenToTag = Object.freeze({
    // [MarkdownToken.break]:          Tag.p,       // Emit node, not push.
    // [MarkdownToken.code]:           Tag.p,       // Emit multiple tags
    [MarkdownToken.emphasis]:       Tag.em,
    [MarkdownToken.heading1]:       Tag.h1,
    [MarkdownToken.heading2]:       Tag.h2,
    [MarkdownToken.heading3]:       Tag.h3,
    [MarkdownToken.heading4]:       Tag.h4,
    [MarkdownToken.heading5]:       Tag.h5,
    [MarkdownToken.heading6]:       Tag.h6,
    [MarkdownToken.image]:          Tag.img,
    [MarkdownToken.inlineCode]:     Tag.code,
    [MarkdownToken.link]:           Tag.a,
    [MarkdownToken.listItem]:       Tag.li,
    [MarkdownToken.orderedlist]:    Tag.ol,
    [MarkdownToken.paragraph]:      Tag.p,
    [MarkdownToken.strong]:         Tag.strong,
    [MarkdownToken.table]:          Tag.table,
    [MarkdownToken.tableCell]:      Tag.td,
    [MarkdownToken.tableRow]:       Tag.tr,
    [MarkdownToken.text]:           Tag.span,       // TODO: ?
    [MarkdownToken.unorderedlist]:  Tag.ul,
});

class MarkdownFormatter extends RootFormatter<IFormatterState> {
    public begin(layout: Layout) {
        const span = this.pushTag(layout, Tag.span);
        span.style.whiteSpace = "pre-wrap";
    }

    public end(layout: Layout) {
        layout.popNode();
    }

    public visit(layout: Layout) {
        const segment = layout.segment;
        const md = segment[markdownSym] as IMarkdownInfo;

        const pop = md && md.pop;
        for (let i = 0; i < pop; i++) {
            layout.popNode();
        }

        const start = (md && md.start) || emptyArray;
        for (const { token, props } of start) {
            const tag = tokenToTag[token];
            const element = this.pushTag(layout, tag);
            if (props) {
                Object.assign(element, props);
            }
        }

        if (TextSegment.is(segment)) {
            layout.emitText();
        } else {
            console.warn(`Not 'markdown': '${getDocSegmentKind(segment)}'`);
        }

        return true;
    }

    public onChange() { }

    public prepare(layout: Layout, start: number, end: number) {
        const { doc } = layout;
        const parser = new MarkdownParser(
            (position, token, props) => { this.enter(doc, position, token, props); },
            (position, token) => { this.leave(doc, position, token); });
        parser.parse(this.getTextAndResetMDInfo(doc));
        return { start: 0, end: doc.length };
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

    private leave(doc: FlowDocument, position: number, token: MarkdownToken) {
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
