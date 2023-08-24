/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	IEditableForest,
	moveToDetachedField,
	FieldAnchor,
	Anchor,
	ForestEvents,
	FieldStoredSchema,
	FieldKey,
	SchemaData,
} from "../../core";
import { ISubscribable } from "../../events";
import { DefaultEditBuilder } from "../default-field-kinds";
import { NodeKeyManager } from "../node-key";
import { FieldGenerator, NewFieldContent } from "../contextuallyTyped";
import { EditableField, UnwrappedEditableField } from "./editableTreeTypes";
import { makeField, unwrappedField } from "./editableField";
import { ProxyTarget } from "./ProxyTarget";

/**
 * A common context of a "forest" of EditableTrees.
 * It handles group operations like transforming cursors into anchors for edits.
 * @alpha
 */
export interface EditableTreeContext extends ISubscribable<ForestEvents> {
	/**
	 * Gets the root field of the tree.
	 */
	get root(): EditableField;

	/**
	 * Gets the root field of the tree.
	 *
	 * See {@link UnwrappedEditableField} for what is unwrapped.
	 */
	get unwrappedRoot(): UnwrappedEditableField;

	/**
	 * Sets the content of the root field of the tree.
	 *
	 * The input data must be formed depending
	 * on the multiplicity of the field, on if it's polymorphic or not and, for non-sequence multiplicities,
	 * on if the field's node declares its primary function by means of a primary field (see `getPrimaryField`):
	 * - For `Sequence` multiplicities and "primary fielded" nodes, an array of a {@link ContextuallyTypedNodeData}
	 * or an {@link EditableField} is expected.
	 * Use an empty array to delete all nodes of a sequence field.
	 * - For `Optional` multiplicities, `ContextuallyTypedNodeDataObject | undefined` is expected.
	 * If the input data is `undefined`, the field node will be deleted if it exists.
	 * - For `Value` multiplicities, `ContextuallyTypedNodeDataObject` is expected.
	 *
	 * A `PrimitiveValue` can be used instead of a `ContextuallyTypedNodeDataObject`
	 * to create/replace or to set the value of the primitive node
	 * if the field is a non-sequence and some of its types declare to follow
	 * the `String`, `Number` or `Boolean` value schema (see `ValueSchema`).
	 * For this to work, it must be possible to resolve the node type by unambiguously matching
	 * a basic TypeScript type of the input data to one of the types allowed by the field,
	 * or, if the field types are undefined, to one of the types available in the global tree schema.
	 * If it's not possible, a `ContextuallyTypedNodeDataObject` with an explicitly provided
	 * type and a value (using a `typeNameSymbol` and a `valueSymbol`) must be used instead.
	 *
	 * Note that currently a setter implementation replaces the nodes and not the field itself,
	 * as this is the only option available in the low-level editing API.
	 * Replacing the nodes has different merge semantics than replacing the field:
	 * it should not overwrite concurrently inserted content while replacing the field should.
	 * This might be changed in the future once the low-level editing API is available.
	 */
	setContent(data: NewFieldContent): void;

	/**
	 * Schema used within this context.
	 * All data must conform to these schema.
	 */
	readonly schema: SchemaData;

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
	 * It is invalid to use the context after this.
	 */
	free(): void;

	/**
	 * Release any cursors and anchors held by EditableTrees created in this context.
	 * The EditableTrees are invalid to use after this, but the context may still be used
	 * to create new trees starting from the root.
	 */
	clear(): void;

	/**
	 * FieldSource used to get a FieldGenerator to populate required fields during procedural contextual data generation.
	 */
	fieldSource?(key: FieldKey, schema: FieldStoredSchema): undefined | FieldGenerator;
}

/**
 * Implementation of `EditableTreeContext`.
 *
 * An editor is required to edit the EditableTrees.
 */
export class ProxyContext implements EditableTreeContext {
	public readonly withCursors: Set<ProxyTarget<Anchor | FieldAnchor>> = new Set();
	public readonly withAnchors: Set<ProxyTarget<Anchor | FieldAnchor>> = new Set();

	private readonly eventUnregister: (() => void)[];

	/**
	 * @param forest - the Forest
	 * @param editor - an editor that makes changes to the forest.
	 * @param nodeKeys - an object which handles node key generation and conversion
	 * @param nodeKeyFieldKey - an optional field key under which node keys are stored in this tree.
	 * If present, clients may query the {@link LocalNodeKey} of a node directly via the {@link localNodeKeySymbol}.
	 */
	public constructor(
		public readonly forest: IEditableForest,
		public readonly editor: DefaultEditBuilder,
		public readonly nodeKeys: NodeKeyManager,
		public readonly nodeKeyFieldKey?: FieldKey,
	) {
		this.eventUnregister = [
			this.forest.on("beforeDelta", () => {
				this.prepareForEdit();
			}),
		];
	}

	public prepareForEdit(): void {
		for (const target of this.withCursors) {
			target.prepareForEdit();
		}
		assert(this.withCursors.size === 0, 0x3c0 /* prepareForEdit should remove all cursors */);
	}

	public free(): void {
		this.clear();
		for (const unregister of this.eventUnregister) {
			unregister();
		}
		this.eventUnregister.length = 0;
	}

	public clear(): void {
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

	public setContent(value: NewFieldContent): void {
		// Note that an implementation of `set root` might change in the future.
		// This setter might want to keep the `replaceNodes` semantics for the cases when the root is unwrapped,
		// and use `replaceField` only if the root is a sequence field i.e.
		// it's unwrapped to the field itself.
		// TODO: update implementation once the low-level editing API is available.
		const rootField = this.getRoot(false);
		rootField.setContent(value);
	}

	public get root(): EditableField {
		return this.getRoot(false);
	}

	private getRoot(unwrap: false): EditableField;
	private getRoot(unwrap: true): UnwrappedEditableField;
	private getRoot(unwrap: boolean): UnwrappedEditableField | EditableField {
		const rootSchema = this.schema.rootFieldSchema;
		const cursor = this.forest.allocateCursor();
		moveToDetachedField(this.forest, cursor);
		const proxifiedField = unwrap
			? unwrappedField(this, rootSchema, cursor)
			: makeField(this, rootSchema, cursor);
		cursor.free();
		return proxifiedField;
	}

	public get schema(): SchemaData {
		return this.forest.schema;
	}

	public on<K extends keyof ForestEvents>(eventName: K, listener: ForestEvents[K]): () => void {
		return this.forest.on(eventName, listener);
	}
}

/**
 * A simple API for a Forest to interact with the tree.
 *
 * @param forest - the Forest
 * @param editor - an editor that makes changes to the forest.
 * @param nodeKeyManager - an object which handles node key generation and conversion
 * @param nodeKeyFieldKey - an optional field key under which node keys are stored in this tree.
 * If present, clients may query the {@link LocalNodeKey} of a node directly via the {@link localNodeKeySymbol}.
 * @returns {@link EditableTreeContext} which is used to manage the cursors and anchors within the EditableTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 */
export function getEditableTreeContext(
	forest: IEditableForest,
	editor: DefaultEditBuilder,
	nodeKeyManager: NodeKeyManager,
	nodeKeyFieldKey?: FieldKey,
): EditableTreeContext {
	return new ProxyContext(forest, editor, nodeKeyManager, nodeKeyFieldKey);
}
