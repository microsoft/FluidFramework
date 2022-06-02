/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
    ITreeCursor,
    TreeNavigationResult,
} from "./cursor";

// TODO: real snapshot type.
export class Snapshot {
    protected makeNominal!: unknown;
}

/**
 * Defines a place relative to sibling.
 * The "outside" of a trait is the `undefined` sibling,
 * so After `undefined` is the beginning of the trait, and before `undefined` is the end.
 *
 * For this purpose, traits look like:
 *
 * `{undefined} - {Node 0} - {Node 1} - ... - {Node N} - {undefined}`
 *
 * Each `{value}` in the diagram is a possible sibling, which is either a Node or undefined.
 * Each `-` in the above diagram is a `Place`,
 * and can be describe as being `After` a particular `{sibling}` or `Before` it.
 * This means that `After` `{undefined}` means the same `Place` as before the first node
 * and `Before` `{undefined}` means the `Place` after the last Node.
 *
 * Each place can be specified, (aka 'anchored') in two ways (relative to the sibling before or after):
 * the choice of which way to anchor a place only matters when the kept across an edit,
 * and thus evaluated in multiple contexts where the
 * two place description may no longer evaluate to the same place.
 * @public
 */
 export enum Side {
	Before = 0,
	After = 1,
}
