/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import { assert } from "@fluidframework/core-utils/internal";

import type { IJsonCodec, IMultiFormatCodec } from "../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import { mapIterable, type JsonCompatibleReadOnly, type Mutable } from "../util/index.js";
import type {
	Commit,
	EncodedCommit,
	EncodedSharedBranch,
	SequencedCommit,
} from "./editManagerFormatCommons.js";
import type { SharedBranchSummaryData } from "./editManager.js";
import { decodeBranchId, encodeBranchId } from "./branchIdCodec.js";

export interface EditManagerEncodingContext {
	idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function encodeCommit<TChangeset, T extends Commit<TChangeset>>(
	changeCodec: IMultiFormatCodec<
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
) {
	return {
		...commit,
		revision: revisionTagCodec.encode(commit.revision, {
			originatorId: commit.sessionId,
			idCompressor: context.idCompressor,
			revision: undefined,
		}),
		change: changeCodec.json.encode(commit.change, { ...context, revision: commit.revision }),
	};
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function decodeCommit<TChangeset, T extends EncodedCommit<JsonCompatibleReadOnly>>(
	changeCodec: IMultiFormatCodec<
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
) {
	const revision = revisionTagCodec.decode(commit.revision, {
		originatorId: commit.sessionId,
		idCompressor: context.idCompressor,
		revision: undefined,
	});

	return {
		...commit,
		revision,
		change: changeCodec.json.decode(commit.change, { ...context, revision }),
	};
}

export function encodeSharedBranch<TChangeset>(
	changeCodec: IMultiFormatCodec<
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
): EncodedSharedBranch<TChangeset> {
	const json: Mutable<EncodedSharedBranch<TChangeset>> = {
		trunk: data.trunk.map((commit) =>
			encodeCommit(changeCodec, revisionTagCodec, commit, {
				originatorId: commit.sessionId,
				idCompressor: context.idCompressor,
				schema: context.schema,
				revision: undefined,
			}),
		),
		peers: Array.from(data.peerLocalBranches.entries(), ([sessionId, branch]) => [
			sessionId,
			{
				base: revisionTagCodec.encode(branch.base, {
					originatorId: sessionId,
					idCompressor: context.idCompressor,
					revision: undefined,
				}),
				commits: branch.commits.map((commit) =>
					encodeCommit(changeCodec, revisionTagCodec, commit, {
						originatorId: commit.sessionId,
						idCompressor: context.idCompressor,
						schema: context.schema,
						revision: undefined,
					}),
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
		assert(originatorId !== undefined, "Cannot encode branch base without originatorId");
		json.base = revisionTagCodec.encode(data.base, {
			originatorId,
			idCompressor: context.idCompressor,
			revision: undefined,
		});
	}
	return json;
}

export function decodeSharedBranch<TChangeset>(
	changeCodec: IMultiFormatCodec<
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
	context: EditManagerEncodingContext,
	originatorId: SessionId | undefined,
): SharedBranchSummaryData<TChangeset> {
	// TODO: sort out EncodedCommit vs Commit, and make this type check without `any`.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const trunk: readonly any[] = json.trunk;
	const data: Mutable<SharedBranchSummaryData<TChangeset>> = {
		trunk: trunk.map(
			(commit): SequencedCommit<TChangeset> =>
				// TODO: sort out EncodedCommit vs Commit, and make this type check without `as`.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				decodeCommit(changeCodec, revisionTagCodec, commit, {
					originatorId: commit.sessionId,
					idCompressor: context.idCompressor,
					revision: undefined,
				}),
		),
		peerLocalBranches: new Map(
			mapIterable(json.peers, ([sessionId, branch]) => [
				sessionId,
				{
					base: revisionTagCodec.decode(branch.base, {
						originatorId: sessionId,
						idCompressor: context.idCompressor,
						revision: undefined,
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
							},
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
		assert(originatorId !== undefined, "Cannot decode branch id without originatorId");
		data.id = decodeBranchId(context.idCompressor, json.id, { originatorId });
	}
	if (json.base !== undefined) {
		assert(originatorId !== undefined, "Cannot decode branch base without originatorId");
		data.base = revisionTagCodec.decode(json.base, {
			originatorId,
			idCompressor: context.idCompressor,
			revision: undefined,
		});
	}
	return data;
}
