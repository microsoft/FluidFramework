/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IEditableForest,
    ITreeSubscriptionCursor,
    TreeNavigationResult,
    lookupGlobalFieldSchema,
    Anchor,
    rootFieldKey,
    rootFieldKeySymbol,
} from "../../core";
import {
    BaseProxyTarget,
    EditableField,
    proxifyField,
    UnwrappedEditableField,
} from "./editableTree";

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
    readonly root: EditableField;

    /**
     * Same as `root`, but with unwrapped fields.
     * See ${@link UnwrappedEditableField} for what is unwrapped.
     */
    readonly unwrappedRoot: UnwrappedEditableField;

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
    public readonly withCursors: Set<BaseProxyTarget> = new Set();
    public readonly withAnchors: Set<BaseProxyTarget> = new Set();
    /**
     * A reference to `NeverAnchor` of `AnchorSet`.
     * Used in `BaseProxyTarget` to indicate that the target is empty.
     */
    public readonly neverAnchor: Anchor;
    /**
     * A cursor which is freed.
     * Used as a placeholder in `BaseProxyTarget` for empty targets.
     */
    public readonly neverCursor: ITreeSubscriptionCursor;

    constructor(public readonly forest: IEditableForest) {
        this.neverAnchor = forest.anchors.track(null);
        this.neverCursor = forest.allocateCursor();
        this.neverCursor.free();
    }

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

    public get unwrappedRoot(): UnwrappedEditableField {
        return this.getRoot(true);
    }

    public get root(): EditableField {
        return this.getRoot(false) as EditableField;
    }

    private getRoot(unwrap: boolean): UnwrappedEditableField | EditableField {
        const rootSchema = lookupGlobalFieldSchema(this.forest.schema, rootFieldKey);
        const cursor = this.forest.allocateCursor();
        // TODO: support anchors for fields, and use them here to avoid using first node of root field.
        const destination = this.forest.root(this.forest.rootField);
        const result = this.forest.tryMoveCursorTo(destination, cursor);
        // the cursor must be in fields mode
        if (result === TreeNavigationResult.Ok) {
            cursor.exitNode();
        }
        const proxifiedField = proxifyField(this, rootSchema, rootFieldKeySymbol, cursor, unwrap);
        cursor.free();
        this.forest.anchors.forget(destination);
        return proxifiedField;
    }
}
