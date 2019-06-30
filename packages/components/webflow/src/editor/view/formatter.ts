/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@prague/merge-tree";
import { Tag } from "../../util/tag";
import { Layout } from "./layout";

export interface IFormatterState {
    root?: Node;
}

export abstract class Formatter<TState extends IFormatterState> {
    // tslint:disable-next-line:variable-name
    public abstract begin(
        state: TState,
        layout: Layout,
        position: number,
        segment: ISegment,
        startOffset: number,
        endOffset: number,
    ): void;

    public abstract visit(
        state: Readonly<TState>,
        layout: Layout,
        position: number,
        segment: ISegment,
        startOffset: number,
        endOffset: number,
    ): boolean;

    public abstract end(
        state: Readonly<TState>,
        layout: Layout,
        position: number,
        segment: ISegment,
        startOffset: number,
        endOffset: number,
    );

    public abstract createState(): TState;

    public toString() { return this.constructor.name; }

    protected pushTag(layout: Layout, position: number, segment: ISegment, tag: Tag, existing?: Element) {
        if (existing && existing.tagName !== tag) {
            existing.remove();
            existing = null;
        }

        existing = existing || document.createElement(tag);
        layout.pushNode(existing, position, segment);
        return existing;
    }
}
