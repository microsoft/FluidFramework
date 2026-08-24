/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";

import type { IJsonCodec } from "../codec/index.js";
import type {
	ChangeEncodingContext,
	ChangeDecodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import {
	mapIterable,
	type IdentifierHealingConfig,
	type JsonCompatibleReadOnly,
	type JsonCompatibleReadOnlyObject,
	type Mutable,
} from "../util/index.js";

import { decodeBranchId, encodeBranchId } from "./branchIdCodec.js";
import type { SharedBranchSummaryData } from "./editManager.js";
import type {
	Commit,
	EncodedCommit,
	EncodedSharedBranch,
	SequenceId,
	SequencedCommit,
} from "./editManagerFormatCommons.js";
import type { PersistedCommitMetadataIndex } from "./persistedCommitMetadata.js";

export interface EditManagerEncodingContext {
	idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
	/**
	 * See {@link ChangeEncodingContext.isSummary}. EditManager codec callers
	 * always set this to `true` (the codec is only invoked for summaries),
	 * but it is carried explicitly so downstream codecs can read it.
	 */
	readonly isSummary: boolean;
}

/**
 * Context required for decoding the {@link EditManager}'s {@link SummaryData}.
 * @remarks
 * Unlike {@link EditManagerEncodingContext}, this carries {@link IdentifierHealingConfig} (used only
 * on decode) and omits `schema` (only consulted when encoding).
 */
export interface EditManagerDecodingContext {
	readonly idCompressor: IIdCompressor;
	readonly isSummary: boolean;
	/** See {@link IdentifierHealingConfig}. */
	readonly healing?: IdentifierHealingConfig;
}

/**
 * How an {@link EditManager} codec should interact with the tree's {@link PersistedCommitMetadataIndex}.
 */
export interface PersistedCommitMetadataOptions {
	/** The tree-wide index that metadata is read from when encoding and written to when decoding. */
	readonly index: PersistedCommitMetadataIndex;
	/**
	 * Whether the codec's format version is new enough to write metadata.
	 * @remarks Metadata is always read when present, but only written at `EditManagerFormatVersion.v7` or later.
	 */
	readonly writeMetadata: boolean;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function encodeCommit<TChangeset, T extends Commit<TChangeset>>(
	changeCodec: IJsonCodec<
		TChangeset,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	commit: T,
	context: ChangeEncodingContext,
	persistedMetadata: PersistedCommitMetadataOptions | undefined,
) {
	const encoded = {
		...commit,
		revision: revisionTagCodec.encode(commit.revision, {
			originatorId: commit.sessionId,
			idCompressor: context.idCompressor,
			revision: undefined,
			isSummary: context.isSummary,
		}),
		change: changeCodec.encode(commit.change, { ...context, revision: commit.revision }),
	};

	// Persisted commit metadata was introduced in EditManagerFormatVersion.v7 and must not be written by earlier formats.
	const metadata =
		persistedMetadata?.writeMetadata === true
			? persistedMetadata.index.get(commit.revision)
			: undefined;
	const mutable = encoded as { persistedMetadata?: JsonCompatibleReadOnlyObject };
	if (metadata === undefined) {
		delete mutable.persistedMetadata;
	} else {
		mutable.persistedMetadata = metadata;
	}
	return encoded;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function decodeCommit<TChangeset, T extends EncodedCommit<JsonCompatibleReadOnly>>(
	changeCodec: IJsonCodec<
		TChangeset,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	commit: T,
	context: ChangeDecodingContext,
	persistedMetadata: PersistedCommitMetadataOptions | undefined,
) {
	const revision = revisionTagCodec.decode(commit.revision, {
		originatorId: commit.sessionId,
		idCompressor: context.idCompressor,
		revision: undefined,
		isSummary: context.isSummary,
	});

	if (commit.persistedMetadata !== undefined) {
		persistedMetadata?.index.set(revision, commit.persistedMetadata);
	}

	const decoded = {
		...commit,
		revision,
		change: changeCodec.decode(commit.change, { ...context, revision }),
	};
	// The metadata lives in the index, not on the commit: see `PersistedCommitMetadataIndex`.
	delete (decoded as { persistedMetadata?: JsonCompatibleReadOnlyObject }).persistedMetadata;
	return decoded;
}

export function encodeSharedBranch<TChangeset>(
	changeCodec: IJsonCodec<
		TChangeset,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	data: SharedBranchSummaryData<TChangeset>,
	context: EditManagerEncodingContext,
	originatorId: SessionId | undefined,
	persistedMetadata: PersistedCommitMetadataOptions | undefined,
): EncodedSharedBranch<TChangeset> {
	const json: Mutable<EncodedSharedBranch<TChangeset>> = {
		trunk: data.trunk.map((commit) =>
			encodeCommit(
				changeCodec,
				revisionTagCodec,
				commit,
				{
					originatorId: commit.sessionId,
					idCompressor: context.idCompressor,
					schema: context.schema,
					revision: undefined,
					isSummary: context.isSummary,
				},
				persistedMetadata,
			),
		),
		peers: Array.from(data.peerLocalBranches.entries(), ([sessionId, branch]) => [
			sessionId,
			{
				base: revisionTagCodec.encode(branch.base, {
					originatorId: sessionId,
					idCompressor: context.idCompressor,
					revision: undefined,
					isSummary: context.isSummary,
				}),
				commits: branch.commits.map((commit) =>
					encodeCommit(
						changeCodec,
						revisionTagCodec,
						commit,
						{
							originatorId: commit.sessionId,
							idCompressor: context.idCompressor,
							schema: context.schema,
							revision: undefined,
							isSummary: context.isSummary,
						},
						persistedMetadata,
					),
				),
			},
		]),
	};
	if (data.session !== undefined) {
		json.session = data.session;
	}
	if (data.id !== undefined) {
		json.id = encodeBranchId(context.idCompressor, data.id);
	}
	if (data.name !== undefined) {
		json.name = data.name;
	}
	if (data.author !== undefined) {
		json.author = data.author;
	}
	if (data.base !== undefined) {
		assert(
			originatorId !== undefined,
			0xc62 /* Cannot encode branch base without originatorId */,
		);
		json.base = revisionTagCodec.encode(data.base, {
			originatorId,
			idCompressor: context.idCompressor,
			revision: undefined,
			isSummary: context.isSummary,
		});
	}
	return json;
}

export function decodeSharedBranch<TChangeset>(
	changeCodec: IJsonCodec<
		TChangeset,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	json: EncodedSharedBranch<TChangeset>,
	context: EditManagerDecodingContext,
	originatorId: SessionId | undefined,
	persistedMetadata: PersistedCommitMetadataOptions | undefined,
): SharedBranchSummaryData<TChangeset> {
	// TODO: sort out EncodedCommit vs Commit, and make this type check without type assertion.
	const trunk = json.trunk as readonly (EncodedCommit<JsonCompatibleReadOnly> & SequenceId)[];
	const data: Mutable<SharedBranchSummaryData<TChangeset>> = {
		trunk: trunk.map(
			(commit): SequencedCommit<TChangeset> =>
				// TODO: sort out EncodedCommit vs Commit, and make this type check without `as`.
				decodeCommit(
					changeCodec,
					revisionTagCodec,
					commit,
					{
						originatorId: commit.sessionId,
						idCompressor: context.idCompressor,
						revision: undefined,
						isSummary: context.isSummary,
						healing: context.healing,
					},
					persistedMetadata,
				),
		),
		peerLocalBranches: new Map(
			mapIterable(json.peers, ([sessionId, branch]) => [
				sessionId,
				{
					base: revisionTagCodec.decode(branch.base, {
						originatorId: sessionId,
						idCompressor: context.idCompressor,
						revision: undefined,
						isSummary: context.isSummary,
					}),
					commits: branch.commits.map((commit) =>
						// TODO: sort out EncodedCommit vs Commit, and make this type check without `as`.
						decodeCommit(
							changeCodec,
							revisionTagCodec,
							commit as EncodedCommit<JsonCompatibleReadOnly>,
							{
								originatorId: commit.sessionId,
								idCompressor: context.idCompressor,
								revision: undefined,
								isSummary: context.isSummary,
								healing: context.healing,
							},
							persistedMetadata,
						),
					),
				},
			]),
		),
	};
	if (json.session !== undefined) {
		data.session = json.session;
	}
	if (json.name !== undefined) {
		data.name = json.name;
	}
	if (json.author !== undefined) {
		data.author = json.author;
	}
	if (json.id !== undefined) {
		assert(
			originatorId !== undefined,
			0xc63 /* Cannot decode branch id without originatorId */,
		);
		data.id = decodeBranchId(context.idCompressor, json.id, { originatorId });
	}
	if (json.base !== undefined) {
		assert(
			originatorId !== undefined,
			0xc64 /* Cannot decode branch base without originatorId */,
		);
		data.base = revisionTagCodec.decode(json.base, {
			originatorId,
			idCompressor: context.idCompressor,
			revision: undefined,
			isSummary: context.isSummary,
		});
	}
	return data;
}
