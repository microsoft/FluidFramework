/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, TSchema, Type } from "@sinclair/typebox";
import { RevisionTagSchema } from "../../core";
import { ChangesetLocalIdSchema, EncodedChangeAtomId } from "../modular-schema";
import { unionOptions } from "../../codec";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const CellCount = Type.Number();

/**
 * A monotonically increasing positive integer assigned to an individual mark within the changeset.
 * MoveIds are scoped to a single changeset, so referring to MoveIds across changesets requires
 * qualifying them by change tag.
 */
const MoveId = ChangesetLocalIdSchema;
const HasMoveId = Type.Object({ id: MoveId });

/**
 * Represents a position within a contiguous range of nodes detached by a single changeset.
 * Note that `LineageEvent`s with the same revision are not necessarily referring to the same detach.
 * `LineageEvent`s for a given revision can only be meaningfully compared if it is known that they must refer to the
 * same detach.
 * @alpha
 */
const LineageEvent = Type.Tuple([
	RevisionTagSchema,
	ChangesetLocalIdSchema,
	/* count */ Type.Number(),
	/* offset */ Type.Number(),
]);

const HasLineage = Type.Object({ lineage: Type.Optional(Type.Array(LineageEvent)) });

const IdRange = Type.Tuple([ChangesetLocalIdSchema, CellCount]);

const CellId = Type.Composite(
	[
		EncodedChangeAtomId,
		HasLineage,
		Type.Object({ adjacentCells: Type.Optional(Type.Array(IdRange)) }),
	],
	noAdditionalProps,
);

const HasRevisionTag = Type.Object({ revision: Type.Optional(RevisionTagSchema) });

/**
 * Moves detached roots into cells.
 * The specific content being moved in is determined by the IDs of the cells this mark targets.
 * Always brings about the desired outcome: the content is in the targeted cells.
 *
 * Rebasing this mark never causes it to insert/restore a different set of nodes.
 * Rebasing this mark never causes it to fill a different set of cells
 * (though the way those cells are identified may change).
 *
 * Carries a `MoveId` in case it is rebased over the content being moved out, in which case this mark
 * will transform into a pair of returns which will move the content back into this cell.
 */
const Insert = Type.Composite([HasMoveId, HasRevisionTag], noAdditionalProps);

const HasMoveFields = Type.Composite([
	HasMoveId,
	/**
	 * Used when this mark represents the beginning or end of a chain of moves within a changeset.
	 * If this mark is the start of the chain, this is the ID of the end mark of the chain, and vice-versa if this is the end of the chain.
	 */
	Type.Object({ finalEndpoint: Type.Optional(EncodedChangeAtomId) }),
]);

/**
 * Fills empty cells with content that is moved out from another cell.
 * Always brings about the desired outcome: the nodes being moved are in the target cells.
 * Note that this may not require any changes if these nodes are already in the target cells when this mark is applied.
 *
 * Rebasing this mark never causes it to move-in a different set of nodes.
 * Rebasing this mark never causes it to fill a different set of cells
 * (though the way those cells are identified may change).
 *
 * Only ever targets empty cells. It transforms into a idempotent Insert if the target cells are not empty.
 */
const MoveIn = Type.Composite([HasMoveFields], noAdditionalProps);

const InverseAttachFields = Type.Object({
	detachIdOverride: Type.Optional(EncodedChangeAtomId),
});

/**
 * Removes nodes from their cells.
 * Always brings about the desired outcome: the targeted nodes are removed from their cells.
 * Note that this may not require any changes if targeted nodes are already removed when this mark is applied.
 *
 * Rebasing this mark never causes it to target different set of nodes.
 * Rebasing this mark can cause it to clear a different set of cells.
 */
const Delete = Type.Composite(
	[
		Type.Object({
			id: ChangesetLocalIdSchema,
		}),
		HasRevisionTag,
		InverseAttachFields,
	],
	noAdditionalProps,
);

/**
 * Removes nodes from their cells so they can be moved into other cells.
 * Always brings about the desired outcome: the targeted nodes are removed from their cells.
 * Note that this may not require any changes if targeted nodes are already removed when this mark is applied.
 *
 * Rebasing this mark never causes it to target different set of nodes.
 * Rebasing this mark can cause it to clear a different set of cells.
 */
const MoveOut = Type.Composite([HasMoveFields, InverseAttachFields], noAdditionalProps);

const Attach = Type.Object(
	{
		insert: Type.Optional(Insert),
		moveIn: Type.Optional(MoveIn),
	},
	unionOptions,
);

const Detach = Type.Object(
	{
		delete: Type.Optional(Delete),
		moveOut: Type.Optional(MoveOut),
	},
	unionOptions,
);

/**
 * Fills then empties cells.
 *
 * Only ever targets empty cells.
 *
 * As a matter of normalization, only use an AttachAndDetach mark when the attach is a new insert or a move
 * destination. In all other cases (the attach would be a revive), we rely on the implicit reviving semantics of the
 * detach and represent that detach on its own (i.e., not wrapped in an AttachAndDetach).
 */
const AttachAndDetach = Type.Object({
	attach: Attach,
	detach: Detach,
});

const MarkEffect = Type.Object(
	{
		// Note: `noop` is encoded by omitting `effect` from the encoded cell mark, so is not included here.
		insert: Type.Optional(Insert),
		moveIn: Type.Optional(MoveIn),
		delete: Type.Optional(Delete),
		moveOut: Type.Optional(MoveOut),
		attachAndDetach: Type.Optional(AttachAndDetach),
	},
	unionOptions,
);

Type.Union([Attach, Detach, AttachAndDetach]);

const CellMark = <TMark extends TSchema, TNodeChange extends TSchema>(
	tMark: TMark,
	tNodeChange: TNodeChange,
) =>
	Type.Object(
		{
			// If undefined, indicates a Noop mark.
			effect: Type.Optional(tMark),
			cellId: Type.Optional(CellId),
			changes: Type.Optional(tNodeChange),
			count: CellCount,
		},
		noAdditionalProps,
	);

const Mark = <Schema extends TSchema>(tNodeChange: Schema) => CellMark(MarkEffect, tNodeChange);

export const Changeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Array(Mark(tNodeChange));

/**
 * @privateRemarks - Many of these names are currently used in the sequence-field types. Putting them in a namespace makes codec code more readable.
 */
export namespace Encoded {
	export type CellCount = Static<typeof CellCount>;

	export type MoveId = Static<typeof MoveId>;
	export type LineageEvent = Static<typeof LineageEvent>;
	export type IdRange = Static<typeof IdRange>;

	export type CellId = Static<typeof CellId>;

	export type Insert = Static<typeof Insert>;
	export type MoveIn = Static<typeof MoveIn>;
	export type Delete = Static<typeof Delete>;
	export type MoveOut = Static<typeof MoveOut>;
	export type Attach = Static<typeof Attach>;
	export type Detach = Static<typeof Detach>;
	export type AttachAndDetach = Static<typeof AttachAndDetach>;
	export type MarkEffect = Static<typeof MarkEffect>;

	export type CellMark<Schema extends TSchema, TNodeChange extends TSchema> = Static<
		ReturnType<typeof CellMark<Schema, TNodeChange>>
	>;
	export type Mark<Schema extends TSchema> = Static<ReturnType<typeof Mark<Schema>>>;
	export type Changeset<Schema extends TSchema> = Static<ReturnType<typeof Changeset<Schema>>>;
}
