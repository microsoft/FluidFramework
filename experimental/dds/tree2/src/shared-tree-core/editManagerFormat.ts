/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TSchema, Type, ObjectOptions } from "@sinclair/typebox";
import { Brand, brandedNumberType } from "../util";
import {
	SessionId,
	SessionIdSchema,
	RevisionTag,
	RevisionTagSchema,
	EncodedRevisionTag,
} from "../core";

/**
 * Contains a single change to the `SharedTree` and associated metadata.
 */
export interface Commit<TChangeset> {
	readonly revision: RevisionTag;
	readonly change: TChangeset;
	/** An identifier representing the session/user/client that made this commit */
	readonly sessionId: SessionId;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type EncodedCommit<TChangeset> = {
	readonly revision: EncodedRevisionTag;
	readonly change: TChangeset;
	readonly sessionId: SessionId;
};

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const CommitBase = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object({
		revision: RevisionTagSchema,
		change: tChange,
		sessionId: SessionIdSchema,
	});
/**
 * @privateRemarks Commits are generally encoded from `GraphCommit`s, which often contain extra data.
 * This `noAdditionalProps` is especially important in that light.
 */
const Commit = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Composite([CommitBase(tChange)], noAdditionalProps);

export type SeqNumber = Brand<number, "edit-manager.SeqNumber">;
const SeqNumber = brandedNumberType<SeqNumber>();

export interface SequenceId {
	readonly sequenceNumber: SeqNumber;
	readonly indexInBatch?: number;
}
export const sequenceIdComparator = (a: SequenceId, b: SequenceId) =>
	a.sequenceNumber !== b.sequenceNumber
		? a.sequenceNumber - b.sequenceNumber
		: (a.indexInBatch ?? 0) - (b.indexInBatch ?? 0);
export const equalSequenceIds = (a: SequenceId, b: SequenceId) => sequenceIdComparator(a, b) === 0;
export const minSequenceId = (a: SequenceId, b: SequenceId) =>
	sequenceIdComparator(a, b) < 0 ? a : b;

/**
 * A commit with a sequence number but no parentage; used for serializing the `EditManager` into a summary
 */
export interface SequencedCommit<TChangeset> extends Commit<TChangeset> {
	sequenceNumber: SeqNumber;
	indexInBatch?: number;
}
const SequencedCommit = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Composite(
		[
			CommitBase(tChange),
			Type.Object({
				sequenceNumber: SeqNumber,
				indexInBatch: Type.Optional(Type.Number()),
			}),
		],
		noAdditionalProps,
	);

/**
 * A branch off of the trunk for use in summaries
 */
export interface SummarySessionBranch<TChangeset> {
	readonly base: RevisionTag;
	readonly commits: Commit<TChangeset>[];
}
const SummarySessionBranch = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object(
		{
			base: RevisionTagSchema,
			commits: Type.Array(Commit(tChange)),
		},
		noAdditionalProps,
	);

export interface EncodedEditManager<TChangeset> {
	readonly trunk: readonly Readonly<SequencedCommit<TChangeset>>[];
	readonly branches: readonly [SessionId, Readonly<SummarySessionBranch<TChangeset>>][];
}
export const EncodedEditManager = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object(
		{
			trunk: Type.Array(SequencedCommit(tChange)),
			branches: Type.Array(Type.Tuple([SessionIdSchema, SummarySessionBranch(tChange)])),
		},
		noAdditionalProps,
	);
