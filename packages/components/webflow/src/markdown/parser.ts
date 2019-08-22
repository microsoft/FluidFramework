/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// import { strict as assert } from "assert";
import { MapLike } from "@prague/merge-tree";
import { strict as assert } from "assert";
import * as remark from "remark";
import { debug } from "./debug";

type visitFn = (position: number, token: MarkdownToken, props?: MapLike<string | number>) => void;

export const enum MarkdownToken {
    break           = "break",
    code            = "code",
    emphasis        = "emphasis",
    heading1        = "heading1",
    heading2        = "heading2",
    heading3        = "heading3",
    heading4        = "heading4",
    heading5        = "heading5",
    heading6        = "heading6",
    image           = "image",
    inlineCode      = "inlineCode",
    link            = "link",
    listItem        = "listItem",
    orderedlist     = "orderedlist",
    paragraph       = "paragraph",
    softbreak       = "softbreak",
    strong          = "strong",
    table           = "table",
    tableCell       = "tableCell",
    tableRow        = "tableRow",
    text            = "text",
    unorderedlist   = "unorderedlist",
}

// These Remark node 'types' trivially map to MarkdownTokens.
const typeToToken = Object.freeze({
    break:      MarkdownToken.break,
    emphasis:   MarkdownToken.emphasis,
    inlineCode: MarkdownToken.inlineCode,
    listItem:   MarkdownToken.listItem,
    strong:     MarkdownToken.strong,
    table:      MarkdownToken.table,
    tableCell:  MarkdownToken.tableCell,
    tableRow:   MarkdownToken.tableRow,
    text:       MarkdownToken.text,
});

const depthToHeadingLevel = Object.freeze([
    undefined,
    MarkdownToken.heading1,
    MarkdownToken.heading2,
    MarkdownToken.heading3,
    MarkdownToken.heading4,
    MarkdownToken.heading5,
    MarkdownToken.heading6,
]);

interface IMDNode {
    type: string;
    depth?: number;
    ordered?: boolean;
    value?: string;
    spread?: boolean;
    lang?: string;
    url?: string;
    title?: string;
    alt?: string;
}

const textRegex = /([^\n]*)([\n]*)/g;

export class MarkdownParser {
    private readonly path: IMDNode[] = [];

    constructor(private readonly enter: visitFn, private readonly leave: visitFn) { }

    public parse(text: string) {
        this.walk(text, remark().parse(text));
    }

    private walk(text: string, node) {
        const { type, position, children } = node;
        const { start: startPos, end: endPos } = position;
        const start = startPos.offset;
        const end = endPos.offset;

        debug("%s[%d..%d): %s(%o)", start, end, type, node);

        if (type === "text") {
            // Text is always a leaf node.
            assert.equal(node.children, undefined);
            this.processText(start, end, node.value);
        } else {
            this.dispatch(this.enter, text, node, start);
            this.path.push(node);

            if (children) {
                for (const child of children) {
                    this.walk(text, child);
                }
            }

            this.path.pop();
            this.dispatch(this.leave, text, node, end);
        }
    }

    private processText(start: number, end: number, text: string) {
        textRegex.lastIndex = 0;

        // Convert "\n" chars embedded inside text nodes into 'softbreak' tokens.
        do {
            const matches = textRegex.exec(text);
            if (matches[1]) {
                this.enter(start, MarkdownToken.text);
                start += matches[1].length;
                this.leave(start, MarkdownToken.text);
            }
            if (matches[2]) {
                this.enter(start, MarkdownToken.softbreak);
                start += matches[2].length;
                this.leave(start, MarkdownToken.softbreak);
            }
        } while (start < end);
    }

    private peek(index: number) {
        const path = this.path;
        return path[path.length - index];
    }

    private dispatch(fn: visitFn, text: string, node: IMDNode, position: number) {
        let token: MarkdownToken;
        let props: MapLike<string | number>;

        const type = node.type;
        switch (type) {
            case "root":
                // Discard the root node.
                return;
            case "link":
                // For links, capture the url and title properties and match them to their HTML attributes.
                token = MarkdownToken.link;
                props = { href: node.url, title: node.title };
                break;
            case "image":
                // For images, capture the url, title, alt properties and match them to their HTML attributes.
                token = MarkdownToken.image;
                props = { src: node.url, title: node.title, alt: node.alt };
                break;
            case "heading":
                // Map 'heading' node into specific tokens for each heading level (h1, h2, etc.).
                token = depthToHeadingLevel[node.depth];
                break;
            case "list":
                // Map 'list' node into specific ordered/unordered list tokens.
                token = node.ordered
                    ? MarkdownToken.orderedlist
                    : MarkdownToken.unorderedlist;
            case "code":
                token = MarkdownToken.code;
                props = { "data-language": node.lang };
                break;
            case "inlineCode":
                token = MarkdownToken.inlineCode;
                props = { "data-language": node.lang };
                break;
            case "paragraph":
                // Suppress paragraph token if it is the first child of a "tight" list item (in which case it should not be rendered.)
                const maybeList = this.peek(2);
                if (maybeList && !maybeList.spread) {
                    return;
                }
                token = MarkdownToken.paragraph;
                break;
            default:
                token = typeToToken[type];
        }

        if (token === undefined) {
            console.warn(token, `Unknown markdown node type: '${type}'`);
        } else {
            fn(position, token, props);
        }
    }
}
