/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Tag } from "../../util/tag";
import { Layout } from "./layout";

// tslint:disable-next-line:no-empty-interface
export interface IFormatterState { }

export abstract class Formatter<TState extends IFormatterState> {
    public abstract begin(
        layout: Layout,
        state: TState,
    ): void;

    public abstract visit(
        layout: Layout,
        state: Readonly<TState>,
    ): boolean;

    public abstract end(
        layout: Layout,
        state: Readonly<TState>,
    );

    public toString() { return this.constructor.name; }

    protected pushTag(layout: Layout, tag: Tag, existing?: Node | Element) {
        existing = this.elementForTag(layout, tag, existing);
        layout.pushNode(existing);
        return existing as Element;
    }

    protected emitTag(layout: Layout, tag: Tag, existing?: Node | Element) {
        existing = this.elementForTag(layout, tag, existing);
        layout.emitNode(existing);
        return existing as Element;
    }

    protected elementForTag(layout: Layout, tag: Tag, existing?: Node | Element) {
        // Reuse the existing element if possible, otherwise create a new one.  Note that
        // 'layout.pushNode(..)' will clean up the old node if needed.
        return existing && "tagName" in existing && existing.tagName === tag && layout.nodeToSegment(existing) === layout.segment
            ? existing as Element
            : document.createElement(tag);
    }
}
