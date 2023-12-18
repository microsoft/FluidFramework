/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField as SF } from "../../../feature-libraries";
import { brand, Populated } from "../../../util";
import { ChangeAtomId, mintRevisionTag, RevisionTag } from "../../../core";
import { TestChange } from "../../testChange";
// eslint-disable-next-line import/no-internal-modules
import { CellMark } from "../../../feature-libraries/sequence-field";
// eslint-disable-next-line import/no-internal-modules
import { Attach, Detach, MarkEffect } from "../../../feature-libraries/sequence-field/types";

const tag: RevisionTag = mintRevisionTag();

export type PopulatedMark<TNodeChange = TestChange> = Populated<
	CellMark<Populated<MarkEffect>, TNodeChange>
>;

const lineageEvent: Populated<SF.LineageEvent> = {
	count: 2,
	id: brand(0),
	offset: 1,
	revision: tag,
};
const adjacentCell: Populated<SF.IdRange> = { count: 2, id: brand(0) };
const atomId: Populated<ChangeAtomId> = { localId: brand(0), revision: tag };
const cellId: Populated<SF.CellId> = {
	localId: brand(0),
	revision: tag,
	lineage: [lineageEvent],
	adjacentCells: [adjacentCell],
};
const changes = TestChange.mint([], 1);
const attach: Populated<Attach> = {
	type: "MoveIn",
	id: brand(0),
	revision: tag,
	finalEndpoint: atomId,
};
const detach: Populated<Detach> = {
	type: "MoveOut",
	id: brand(0),
	revision: tag,
	finalEndpoint: atomId,
	redetachId: atomId,
};

export const populatedMarks: PopulatedMark[] = [
	{ count: 1, cellId, changes },
	{ type: "Insert", count: 1, cellId, changes, id: brand(0), revision: tag },
	{
		type: "MoveIn",
		count: 1,
		cellId,
		changes,
		id: brand(0),
		revision: tag,
		finalEndpoint: atomId,
	},
	{
		type: "MoveOut",
		count: 1,
		cellId,
		changes,
		id: brand(0),
		revision: tag,
		finalEndpoint: atomId,
		redetachId: atomId,
	},
	{
		type: "Delete",
		count: 1,
		cellId,
		changes,
		id: brand(0),
		revision: tag,
		redetachId: atomId,
	},
	{
		type: "AttachAndDetach",
		count: 1,
		cellId,
		changes,
		attach,
		detach,
	},
];
