/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MapLike } from "@microsoft/fluid-merge-tree";
import * as remark from "remark";
import { debug } from "./debug";
import { MarkdownToken } from "./types";

type visitFn = (position: number, token: MarkdownToken, props?: MapLike<string | number>) => void;

// These Remark node 'types' trivially map to MarkdownTokens.
const typeToToken = Object.freeze({
    blockquote: MarkdownToken.blockquote,
    break: MarkdownToken.break,
    emphasis: MarkdownToken.emphasis,
    inlineCode: MarkdownToken.inlineCode,
    listItem: MarkdownToken.listItem,
    strong: MarkdownToken.strong,
    table: MarkdownToken.table,
    tableCell: MarkdownToken.tableCell,
    tableRow: MarkdownToken.tableRow,
    text: MarkdownToken.text,
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
    position: {
        start: { offset: number };
        end: { offset: number };
    };
}

// const newlineExp = /([^\n]+)([\n]+)/g;

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

        debug("[%d..%d): %s(%o)", start, end, type, node);

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

    // private processText(start: number, end: number, text: string) {
    //     newlineExp.lastIndex = start;
    //     do {
    //         const chars = text.match(/[^\n]*/g)[0];
    //         if (chars) {
    //             this.enter(start, MarkdownToken.text);
    //             this.leave(chars.length, MarkdownToken.text);
    //             start += chars.length;
    //         }

    //         const linefeeds = text.match(/\n*/g)[0];
    //         if (linefeeds) {
    //             this.enter(start, MarkdownToken.softbreak);
    //             this.leave(linefeeds.length, MarkdownToken.softbreak);
    //             start += linefeeds.length;
    //         }
    //     } while (start < end);
    // }

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
                break;
            case "code":
                token = MarkdownToken.code;
                props = { "data-language": node.lang };
                break;
            case "inlineCode":
                token = MarkdownToken.inlineCode;
                props = { "data-language": node.lang };
                break;
            case "paragraph":
                // Suppress paragraph token if it is the first child of a "tight" list item (in which case it should not
                // be rendered.)
                // eslint-disable-next-line no-case-declarations
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
