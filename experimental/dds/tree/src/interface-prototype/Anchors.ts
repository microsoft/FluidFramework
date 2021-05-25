import { ConstraintEffect } from '../default-edits';

// This import is a layering violation. Maybe find a better design.
import type { TreeView } from './Checkout';

export type StableId = string & { readonly StableId: 'b1b691dc-9142-4ea2-a1aa-5f04c3808fea' };

//////////////////////////////////////////////////////////////////////////////////

//////////////// Anchors //////////////

/**
 * Common interface shared by all anchors.
 * These anchor objects may reference a specific `Tree` and thus can only be used in the context of that tree.
 * See the "Data" variants for the API subset which works between different trees.
 *
 * In an actual implementation, we would want these to be opaque nominally typed objects.
 */
export interface Anchor extends AnchorData {
	/**
	 * Get an immutable view of the current state of the Tree.
	 * This anchor can be contextualized into the returned view to allow using it to walk that this frozen view of the free,
	 * unaffected by any future edits.
	 */
	snapshot(): TreeView;

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
	 * TODO: how does this work for iterators? if iterating a trait (on a loaded node), for example to count the nodes in the trait,
	 * no opportunity to call ensureLoaded is provided, so how to we chunk sequences?
	 * Maybe this loads an entire range, but range could also have an APi to give a chunk iterator (iterator over ranges),
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
	 * TODO: clarify what happens for each API when used on invalid anchors (some can just work, but many need to fail somehow).
	 */
	isValid(): ConstraintEffect | Valid;
}

type Valid = -1; // TODO something better.

// usable across revisions/contexts
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
export interface AnchorDataSafe<TAnchor = AnchorData> extends AnchorData {
	/**
	 * @returns a form of this anchor which is Json compatible. If not implemented, already Json compatible.
	 */
	// TODO: make this build
	// serialize?(): TAnchor & JsonCompatible;
}

// Type brand for Json support
export type JsonCompatible = { readonly JsonCompatible: '7619c7cd-2b74-41c8-bc90-702e83360106' };

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
