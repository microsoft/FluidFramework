/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
    ): void;

    public abstract visit(
        state: Readonly<TState>,
        layout: Layout,
    ): boolean;

    public abstract end(
        state: Readonly<TState>,
        layout: Layout,
    );

    public abstract createState(): TState;

    public toString() { return this.constructor.name; }

    protected pushTag(layout: Layout, tag: Tag, existing?: Element) {
        if (existing && existing.tagName !== tag) {
            existing.remove();
            existing = null;
        }

        existing = existing || document.createElement(tag);
        layout.pushNode(existing);
        return existing;
    }
}
