/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IEditableForest, TreeNavigationResult } from "../../forest";
import { lookupGlobalFieldSchema } from "../../schema-stored";
import { rootFieldKey } from "../../tree";
import { proxifyField, ProxyTarget, UnwrappedEditableField } from "./editableTree";
import { getFieldKind } from "./utilities";

/**
 * A common context of a "forest" of EditableTrees.
 * It handles group operations like transforming cursors into anchors for edits.
 * TODO: add test coverage.
 */
export interface EditableTreeContext {
    /**
     * Gets a Javascript Proxy providing a JavaScript object like API for interacting with the tree.
     *
     * Use built-in JS functions to get more information about the data stored e.g.
     * ```
     * for (const key of Object.keys(context.root)) { ... }
     * // OR
     * if ("foo" in data) { ... }
     * context.free();
     * ```
     *
     * Not (yet) supported: create properties, set values and delete properties.
     */
    readonly root: UnwrappedEditableField;

    /**
     * Call before editing.
     *
     * Note that after performing edits, EditableTrees for nodes that no longer exist are invalid to use.
     * TODO: maybe add an API to check if a specific EditableTree still exists,
     * and only make use other than that invalid.
     */
    prepareForEdit(): void;

    /**
     * Call to free resources.
     * EditableTrees created in this context are invalid to use after this.
     */
    free(): void;
}

export class ProxyContext implements EditableTreeContext {
    public readonly withCursors: Set<ProxyTarget> = new Set();
    public readonly withAnchors: Set<ProxyTarget> = new Set();

    constructor(public readonly forest: IEditableForest) {}

    public prepareForEdit(): void {
        for (const target of this.withCursors) {
            target.prepareForEdit();
        }
        assert(this.withCursors.size === 0, 0x3c0 /* prepareForEdit should remove all cursors */);
    }

    public free(): void {
        for (const target of this.withCursors) {
            target.free();
        }
        for (const target of this.withAnchors) {
            target.free();
        }
        assert(this.withCursors.size === 0, 0x3c1 /* free should remove all cursors */);
        assert(this.withAnchors.size === 0, 0x3c2 /* free should remove all anchors */);
    }

    public get root(): UnwrappedEditableField {
        const cursor = this.forest.allocateCursor();
        const destination = this.forest.root(this.forest.rootField);
        const cursorResult = this.forest.tryMoveCursorTo(destination, cursor);
        const targets: ProxyTarget[] = [];
        if (cursorResult === TreeNavigationResult.Ok) {
            do {
                targets.push(new ProxyTarget(this, cursor));
            } while (cursor.seek(1) === TreeNavigationResult.Ok);
        }
        cursor.free();
        this.forest.anchors.forget(destination);
        const rootSchema = lookupGlobalFieldSchema(this.forest.schema, rootFieldKey);
        return proxifyField(getFieldKind(rootSchema), targets);
    }
}
