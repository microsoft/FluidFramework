/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// import { strict as assert } from "assert";
import * as remark from "remark";
import { Tag } from "../util/tag";
import { debug } from "./debug";

const headingLevels = [
    undefined,
    Tag.h1,
    Tag.h2,
    Tag.h3,
    Tag.h4,
    Tag.h5,
    Tag.h6,
];

const tokenToTag = Object.freeze({
    break: Tag.br,
    emphasis: Tag.em,
    inlineCode: Tag.code,
    listItem: Tag.li,
    strong: Tag.strong,
    table: Tag.table,
    tableCell: Tag.td,
    tableRow: Tag.tr,
});

const htmlToTag = Object.freeze({
    "<br/>": Tag.br,
});

interface IMDNode {
    type: string;
    depth?: number;
    ordered?: boolean;
    value?: string;
    spread?: boolean;
}

export class MarkdownParser {
    private readonly path: IMDNode[] = [];

    constructor(
        private readonly enter: (tag: Tag, position: number, ...args: any[]) => void,
        private readonly leave: (tag: Tag, position: number, ...args: any[]) => void,
    ) { }

    public parse(text: string) {
        this.walk(remark().parse(text));
    }

    private walk(node) {
        const { type, position, children } = node;
        const { start: startPos, end: endPos } = position;
        const start = startPos.offset;
        const end = endPos.offset;

        debug("[%d..%d): %s(%o)", start, end, type, node);
        const tag = this.nodeToTag(node);
        if (tag) {
            debug("  enter(%s@%d)", tag, start);
            this.enter(tag, start);
        }

        this.path.push(node);

        if (children) {
            for (const child of children) {
                this.walk(child);
            }
        }

        this.path.pop();

        if (tag) {
            debug("  leave(%s@%d)", tag, end);
            this.leave(tag, end);
        }
    }

    private peek(index: number) {
        const path = this.path;
        return path[path.length - index];
    }

    private nodeToTag(node: IMDNode) {
        const type = node.type;
        switch (type) {
            case "link":
                return Tag.a;       // TODO: Fill in href
            case "image":
                return Tag.img;     // TODO: Fill in src, alt, title
            case "html": {
                const tag = htmlToTag[node.value];
                if (!tag) { console.warn(tag, `Unknown html tag: '${node.value}'`); }
                return tag;
            }
            case "heading":
                return headingLevels[node.depth];
            case "list":
                return node.ordered
                    ? Tag.ol
                    : Tag.ul;
            case "code":
                return Tag.pre;     // TODO: Emit <pre><code /><pre>
            case "paragraph":
                const maybeList = this.peek(2);
                if (maybeList && !maybeList.spread) {
                    return undefined;
                }
                return Tag.p;       // TODO: Suppress in a non-spread list.
            case "text":
                return Tag.span;
            case "root":
                return undefined;
            default: {
                const tag = tokenToTag[type];
                if (!tag) { console.warn(tag, `Unknown markdown token: '${type}'`); }
                return tag;
            }
        }
    }
}
