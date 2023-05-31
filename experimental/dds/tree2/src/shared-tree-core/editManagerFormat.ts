/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TSchema, Type } from "@sinclair/typebox";
import { Brand, brandedNumberType } from "../util";
import { SessionId, SessionIdSchema, RevisionTag, RevisionTagSchema } from "../core";

/**
 * Contains a single change to the `SharedTree` and associated metadata.
 */
export interface Commit<TChangeset> {
	readonly revision: RevisionTag;
	readonly change: TChangeset;
	/** An identifier representing the session/user/client that made this commit */
	readonly sessionId: SessionId;
}

const Commit = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object({
		revision: RevisionTagSchema,
		change: tChange,
		sessionId: SessionIdSchema,
		// Enforce that `parent` isn't present. Commits are generally encoded from `GraphCommit`s, which can
		// have parent pointers which are problematic to serialize.
		parent: Type.Optional(Type.Never()),
	});

export type SeqNumber = Brand<number, "edit-manager.SeqNumber">;
const SeqNumber = brandedNumberType<SeqNumber>();

/**
 * A commit with a sequence number but no parentage; used for serializing the `EditManager` into a summary
 */
export interface SequencedCommit<TChangeset> extends Commit<TChangeset> {
	sequenceNumber: SeqNumber;
}
const SequencedCommit = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Intersect([Commit(tChange), Type.Object({ sequenceNumber: SeqNumber })]);

/**
 * A branch off of the trunk for use in summaries
 */
export interface SummarySessionBranch<TChangeset> {
	readonly base: RevisionTag;
	readonly commits: Commit<TChangeset>[];
}
const SummarySessionBranch = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object({
		base: RevisionTagSchema,
		commits: Type.Array(Commit(tChange)),
	});

export interface EncodedEditManager<TChangeset> {
	readonly trunk: readonly Readonly<SequencedCommit<TChangeset>>[];
	readonly branches: readonly [SessionId, Readonly<SummarySessionBranch<TChangeset>>][];
}
export const EncodedEditManager = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object({
		trunk: Type.Array(SequencedCommit(tChange)),
		branches: Type.Array(Type.Tuple([SessionIdSchema, SummarySessionBranch(tChange)])),
	});
