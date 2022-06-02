/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConstraintEffect } from "./edits";

// This import is a layering violation. Maybe find a better design.
import type { Tree } from "./Checkout";
import { Covariant } from "./TypeCheck";

export type StableId = string & { readonly StableId: "b1b691dc-9142-4ea2-a1aa-5f04c3808fea"; };

/**
 * {@link AnchorData} + Context.
 * See TreeView.contextualizeAnchor.
 *
 * An Anchor is a way to look up a tree location in a context (ex: a specific revision).
 * They are used in edits to refer to tree locations to allow merge resolution.
 * Thus Anchors include the bulk of merge resolution policy,
 * and need to be able to describe all tree locations that can be used in edits.
 * The different types of anchors for these different
 * types of tree locations are defined in `ViewAnchor` as extensions of Anchor.
 *
 * These anchor objects may reference a specific `Tree` and thus can only be used in the context of that tree.
 * See the "Data" variants for the API subset which works between different trees.
 *
 * In an actual implementation, we would want these to be opaque
 * nominally typed objects since the API here is insufficient for the actual implementation to work with:
 * its just enough for the public API surface.
 *
 * An Anchor is a way to look up a tree location in a context (ex: a specific revision).
 * This particular representation of anchor comes with such a context,
 * and thus corresponds to a location in a concrete tree (or is invalid).
 * Note that this context may be change over time, which can cause the anchor to become invalid, and/or move.
 */
export interface Anchor extends AnchorData {
	/**
	 * Get an immutable view of the current state of the Tree.
	 * This anchor can be contextualized into the returned view to allow using it to walk that this frozen
	 * view of the tree,
	 * unaffected by any future edits.
	 */
	snapshot(): Tree;

	/**
	 * If true, accessing data in this node may throw PlaceholderNotLoaded.
	 *
	 * Use a {@link PrefetchFilter} to control where this may occur.
	 *
	 * So we can have a synchronous navigation API, it is up to a client to notice
	 * a placeholder and call the asynchronous GetPreviousTree etc. methods on SharedTree
	 */
	readonly isLoaded: boolean;

	/**
	 * await to get `this` after ensuring that its loaded (isLoaded will be true).
	 *
	 * TODO: how does this work for iterators? if iterating a trait (on a loaded node),
	 * for example to count the nodes in the trait,
	 * no opportunity to call ensureLoaded is provided, so how to we chunk sequences?
	 * Maybe this loads an entire range,
	 * but range could also have an APi to give a chunk iterator (iterator over ranges),
	 * which could be used recursively to access sequence tree (and provide parallel loading opportunities)?
	 *
	 * TODO: how does this work with the query methods?
	 *
	 * TODO: maybe have API that will never throw PlaceholderNotLoaded: forces explicit handling.
	 */
	ensureLoaded(): this | Promise<this>;

	/**
	 * @returns if this Anchor is currently valid (resolves to a location in its Tree).
	 *
	 * TODO: clarify what happens for each API when used on invalid anchors
	 * (some can just work, but many need to fail somehow).
	 */
	isValid(): ConstraintEffect | Valid;
}

type Valid = -1; // TODO something better.

/**
 * The data for an Anchor: a specification of how to look up a tree location in a context (ex: a specific revision).
 * Logically this is an Anchor, but unlike {@link Anchor}, it might not have a context.
 */
export interface AnchorData {
	/**
	 * @returns a form of this anchor which is Json compatible. If not implemented, already Json compatible.
	 */
	serialize?(): JsonCompatible & AnchorData;

	readonly _brand?: AnchorData;
}

/**
 * More Type safe version of AnchorData.
 */
export interface AnchorDataSafe<TAnchor = AnchorData> extends AnchorData, Covariant<TAnchor> {
	/**
	 * @returns a form of this anchor which is Json compatible. If not implemented, already Json compatible.
	 */
	// TODO: make this build
	// serialize?(): TAnchor & JsonCompatible;
}

// Type brand for Json support
export interface JsonCompatible {
	readonly JsonCompatible: "7619c7cd-2b74-41c8-bc90-702e83360106";
}

/**
 * These 'Data' types are implemented by the anchors, but you can also get them by casting deserialized anchors to them.
 * They can be passed to `contextualize` functions to get access to tree content from then.
 *
 * Brands are just for type checking. if these become non-empty types, or classes, remove them.
 */
export interface PlaceData extends AnchorDataSafe<PlaceData> {
	readonly _brandPlaceData: unknown;
}
export interface RangeData extends AnchorDataSafe<RangeData> {
	readonly _brandRangeData: unknown;
}
export interface TreeNodeData extends AnchorDataSafe<TreeNodeData> {
	readonly _brandTreeNodeData: unknown;
}

// See also `TreeAnchors.ts` for the actual Contextualized anchors for navigating trees (Place, Range and TreeNode).
