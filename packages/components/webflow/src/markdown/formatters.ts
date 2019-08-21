/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Char, randomId } from "@prague/flow-util";
import { TextSegment } from "@prague/merge-tree";
import { FlowDocument, getDocSegmentKind } from "../document";
import { Tag } from "../util/tag";
import { IFormatterState, RootFormatter } from "../view/formatter";
import { Layout } from "../view/layout";
import { MarkdownParser } from "./parser";

const markdownSym = Symbol();

interface IMarkdownInfo {
    start?: Tag[];
    pop?: number;
}

class MarkdownFormatter extends RootFormatter<IFormatterState> {
    public begin() { }
    public end() { }

    public visit(layout: Layout) {
        const segment = layout.segment;
        const md = segment[markdownSym] as IMarkdownInfo;

        const pop = md && md.pop;
        for (let i = 0; i < pop; i++) {
            layout.popNode();
        }

        const start = md && md.start;
        if (start) {
            for (const tag of start) {
                const element = this.pushTag(layout, tag);
                if (tag === Tag.span) {
                    element.className = "text";
                }
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
            (tag, position) => { this.enter(doc, tag, position); },
            (_, position) => { this.leave(doc, position); });
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

    private enter(doc: FlowDocument, tag: Tag, position: number) {
        const md = this.getEnsuredTags(doc, position);
        md.start = md.start || [];
        md.start.push(tag);
    }

    private leave(doc: FlowDocument, position: number) {
        if (position < doc.length) {
            const md = this.getEnsuredTags(doc, position);
            // tslint:disable-next-line:strict-boolean-expressions
            md.pop = md.pop || 0;
            md.pop++;
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
