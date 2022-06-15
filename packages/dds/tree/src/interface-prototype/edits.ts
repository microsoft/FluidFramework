/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import { Invariant } from "../typeCheck";
import { Definition, NodeId } from "./Identifiers";

/**
 * What to do when a Constraint is violated.
 * @public
 */
export enum ConstraintEffect {
	/**
	 * Discard Edit.
	 */
	InvalidAndDiscard,

	/**
	 * Discard Edit, but record metadata that application may want to try and recover this change by recreating it.
	 * Should this be the default policy for when another (non Constraint) change is invalid?
	 */
	InvalidRetry,

	/**
	 * Apply the change, but flag it for possible reconsideration by the app
	 * (applying it is better than not, but perhaps the high level logic could produce something better).
	 */
	ValidRetry,

	/**
	 * Discard Edit,
	 * but record metadata that application may want to try and
	 * recover this change by recreating it if part of an offline merge.
	 */
	InvalidRetryOffline,

	/**
	 * Apply the change, but flag it for possible reconsideration by the app if part of an offline merge.
	 * (applying it is better than not, but perhaps the high level logic could produce something better).
	 */
	ValidRetryOffline,
}

// TODO: real Change type.
export class Change {
	protected makeNominal!: unknown;
}

export class OrderedEditSet<TChange> {
	protected typeCheck!: Invariant<TChange>;
}
export class initialTree {
	protected makeNominal!: unknown;
}
export class LogViewer {
	protected makeNominal!: unknown;
}

/**
 * JSON-compatible Node type.
 * Objects of this type will be persisted in internal change objects (under Edits) in the SharedTree history.
 * @public
 */
export type ChangeNode = TreeNode<ChangeNode, NodeId>;

/**
 * Satisfies `NodeData` and may contain children under traits (which may or may not be `TreeNodes`)
 * @public
 */
export interface TreeNode<TChild, TId> extends NodeData<TId>, HasTraits<TChild> { }

/**
 * Json compatible representation of a payload storing arbitrary Serializable data.
 *
 * Keys starting with "IFluid"
 * are reserved for special use such as the JavaScript feature detection pattern and should not be used.
 *
 * See {@link comparePayloads}
 * for equality semantics and related details (like what is allowed to be lost when serializing)
 *
 * TODO:#51984: Allow opting into heuristic blobbing in snapshots with a special IFluid key.
 *
 * @public
 */
export type Payload = Serializable;

/**
 * Json compatible map as object.
 * Keys are TraitLabels,
 * Values are the content of the trait specified by the key.
 * @public
 */
export interface TraitMap<TChild> {
	readonly [key: string]: TreeNodeSequence<TChild>;
}

/**
 * A sequence of Nodes that make up a trait under a Node
 * @public
 */
export type TreeNodeSequence<TChild> = readonly TChild[];

/**
 * An object which may have traits with children of the given type underneath it
 * @public
 */
export interface HasTraits<TChild> {
	readonly traits: TraitMap<TChild>;
}

/**
 * The fields required by a node in a tree
 * @public
 */
export interface NodeData<TId> {
	/**
	 * A payload of arbitrary serializable data
	 */
	readonly payload?: Payload;

	/**
	 * The meaning of this node.
	 * Provides contexts/semantics for this node and its content.
	 * Typically use to associate a node with metadata (including a schema) and source code (types, behaviors, etc).
	 */
	readonly definition: Definition;
	/**
	 * Identifier which can be used to refer to this Node.
	 */
	readonly identifier: TId;
}
