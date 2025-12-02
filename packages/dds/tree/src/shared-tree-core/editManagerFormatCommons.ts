/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import { type ObjectOptions, type Static, type TSchema, Type } from "@sinclair/typebox";

import {
	type EncodedRevisionTag,
	type RevisionTag,
	RevisionTagSchema,
	SessionIdSchema,
} from "../core/index.js";
import { type Brand, brandedNumberType } from "../util/index.js";
import type { EncodedBranchId } from "./branch.js";

/**
 * Contains a single change to the `SharedTree` and associated metadata.
 *
 * TODO: if this type is not used in the encoded format, move it out of this file, and stop using it in EncodedEditManager.
 * If this is an encoded format, clarify the difference between it and EncodedCommit.
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

// Many of the return types in this module are intentionally derived, rather than explicitly specified.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

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
const SeqNumber = brandedNumberType<SeqNumber>({ multipleOf: 1 });

const SequenceId = Type.Object({
	sequenceNumber: SeqNumber,
	indexInBatch: Type.Optional(Type.Number({ multipleOf: 1, minimum: 0 })),
});

export type SequenceId = Static<typeof SequenceId>;

/**
 * A commit with a sequence number but no parentage; used for serializing the `EditManager` into a summary
 */
export interface SequencedCommit<TChangeset> extends Commit<TChangeset>, SequenceId {}

export const SequencedCommit = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Composite([CommitBase(tChange), SequenceId], noAdditionalProps);

/**
 * A branch off of the trunk for use in summaries.
 *
 * TODO: if this type is not used in the encoded format, move it out of this file, and stop using it in EncodedEditManager.
 * If this is an encoded format, use EncodedCommit instead of Commit or clarify that Commit is also an encoded format.
 */
export interface SummarySessionBranch<TChangeset> {
	readonly base: RevisionTag;
	readonly commits: Commit<TChangeset>[];
}

export interface EncodedSummarySessionBranch<TChangeset> {
	readonly base: EncodedRevisionTag;
	readonly commits: Commit<TChangeset>[];
}

export const SummarySessionBranch = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object(
		{
			base: RevisionTagSchema,
			commits: Type.Array(Commit(tChange)),
		},
		noAdditionalProps,
	);

export interface EncodedSharedBranch<TChangeset> {
	readonly id?: EncodedBranchId;
	readonly name?: string;
	readonly author?: string;
	readonly session?: SessionId;
	readonly base?: EncodedRevisionTag;
	readonly trunk: readonly Readonly<SequencedCommit<TChangeset>>[];
	readonly peers: readonly [SessionId, Readonly<EncodedSummarySessionBranch<TChangeset>>][];
}

export const EncodedSharedBranch = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object(
		{
			id: Type.Optional(Type.Number()),
			name: Type.Optional(Type.String()),
			session: Type.Optional(SessionIdSchema),
			author: Type.Optional(Type.String()),
			base: Type.Optional(RevisionTagSchema),
			trunk: Type.Array(SequencedCommit(tChange)),
			peers: Type.Array(Type.Tuple([SessionIdSchema, SummarySessionBranch(tChange)])),
		},
		noAdditionalProps,
	);

/**
 * The format version for the EditManager.
 */
export const EditManagerFormatVersion = {
	/**
	 * Introduced and retired prior to 2.0.
	 * Reading and writing capability removed in 2.73.0.
	 */
	v1: 1,
	/**
	 * Introduced and retired prior to 2.0.
	 * Reading and writing capability removed in 2.73.0.
	 */
	v2: 2,
	/**
	 * Introduced prior to 2.0 and used beyond.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability needs to be maintained so long as {@link lowestMinVersionForCollab} is less than 2.2.0.
	 */
	v3: 3,
	/**
	 * Introduced in 2.2.0.
	 * Was inadvertently made usable for writing in 2.43.0 (through configuredSharedTree) and remains available.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability could be dropped in favor of {@link EditManagerFormatVersion.v3},
	 * but doing so would make the pattern of writable versions more complex and gain little
	 * because most of the logic for this format is shared with {@link EditManagerFormatVersion.v3}.
	 */
	v4: 4,
	/**
	 * This version number was used internally for testing shared branches.
	 * This format was never made stable.
	 * This version number is kept here solely to avoid reusing the number: it is not supported for either reading or writing.
	 * @deprecated - use {@link EditManagerFormatVersion.vSharedBranches} for testing shared branches.
	 */
	v5: 5,
	/**
	 * Not yet released.
	 * Only used for testing shared branches.
	 */
	vSharedBranches: "shared-branches|v0.1",
} as const;
export type EditManagerFormatVersion = Brand<
	(typeof EditManagerFormatVersion)[keyof typeof EditManagerFormatVersion],
	"EditManagerFormatVersion"
>;
export const supportedEditManagerFormatVersions: ReadonlySet<EditManagerFormatVersion> =
	new Set([
		EditManagerFormatVersion.v3,
		EditManagerFormatVersion.v4,
		EditManagerFormatVersion.vSharedBranches,
	] as EditManagerFormatVersion[]);
export const editManagerFormatVersions: ReadonlySet<EditManagerFormatVersion> = new Set(
	Object.values(EditManagerFormatVersion) as EditManagerFormatVersion[],
);
/* eslint-enable @typescript-eslint/explicit-function-return-type */
