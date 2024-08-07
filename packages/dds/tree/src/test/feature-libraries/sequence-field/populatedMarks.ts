/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";

import type { ChangeAtomId } from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { CellMark } from "../../../feature-libraries/sequence-field/index.js";
import type {
	Attach,
	Detach,
	MarkEffect,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/types.js";
import { TestNodeId } from "../../testNodeId.js";
import { type Populated, brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";

export type PopulatedMark = Populated<CellMark<Populated<MarkEffect>>>;

/**
 * Generates a list of marks with all fields populated.
 *
 * @remarks - New objects are generated every time this function is called. This is to ensure that stable IDs are
 * generated when appropriate.
 */
export function generatePopulatedMarks(idCompressor: IIdCompressor): PopulatedMark[] {
	const tag = idCompressor.generateCompressedId();
	const atomId: Populated<ChangeAtomId> = { localId: brand(0), revision: tag };
	const changes = TestNodeId.create({ localId: brand(2) }, TestChange.mint([], 1));
	const attach: Populated<Attach> = {
		type: "MoveIn",
		id: brand(0),
		revision: tag,
		finalEndpoint: atomId,
	};
	const detach: Populated<Detach> = {
		type: "Remove",
		id: brand(0),
		revision: tag,
		idOverride: atomId,
	};
	const populatedMarks: PopulatedMark[] = [
		{ count: 1, cellId: atomId, changes },
		{ type: "Insert", count: 1, cellId: atomId, changes, id: brand(0), revision: tag },
		{
			type: "MoveIn",
			count: 1,
			cellId: atomId,
			changes,
			id: brand(0),
			revision: tag,
			finalEndpoint: atomId,
		},
		{
			type: "MoveOut",
			count: 1,
			cellId: atomId,
			changes,
			id: brand(0),
			revision: tag,
			finalEndpoint: atomId,
			idOverride: atomId,
		},
		{
			type: "Remove",
			count: 1,
			cellId: atomId,
			changes,
			id: brand(0),
			revision: tag,
			idOverride: atomId,
		},
		{
			type: "AttachAndDetach",
			count: 1,
			cellId: atomId,
			changes,
			attach,
			detach,
		},
		{ type: "Rename", count: 1, cellId: atomId, changes, idOverride: atomId },
	];
	return populatedMarks;
}
