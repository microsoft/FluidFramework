/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import {
	ICodecOptions,
	IJsonCodec,
	IMultiFormatCodec,
	makeVersionedValidatedCodec,
} from "../codec/index.js";
import { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../core/index.js";
import {
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlySchema,
	mapIterable,
} from "../util/index.js";
import { SummaryData } from "./editManager.js";
import {
	Commit,
	EncodedCommit,
	EncodedEditManager,
	SequencedCommit,
	version,
} from "./editManagerFormat.js";

export function makeEditManagerCodec<TChangeset>(
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
		{ originatorId: SessionId }
	>,
	options: ICodecOptions,
): IJsonCodec<SummaryData<TChangeset>> {
	const format = EncodedEditManager(
		changeCodec.json.encodedSchema ?? JsonCompatibleReadOnlySchema,
	);

	const encodeCommit = <T extends Commit<TChangeset>>(
		commit: T,
		context: ChangeEncodingContext,
	) => ({
		...commit,
		revision: revisionTagCodec.encode(commit.revision, { originatorId: commit.sessionId }),
		change: changeCodec.json.encode(commit.change, context),
	});

	const decodeCommit = <T extends EncodedCommit<JsonCompatibleReadOnly>>(
		commit: T,
		context: ChangeEncodingContext,
	) => ({
		...commit,
		revision: revisionTagCodec.decode(commit.revision, { originatorId: commit.sessionId }),
		change: changeCodec.json.decode(commit.change, context),
	});

	const codec: IJsonCodec<
		SummaryData<TChangeset>,
		EncodedEditManager<TChangeset>
	> = makeVersionedValidatedCodec(options, new Set([version]), format, {
		encode: (data) => {
			const json: EncodedEditManager<TChangeset> = {
				trunk: data.trunk.map((commit) =>
					encodeCommit(commit, { originatorId: commit.sessionId }),
				),
				branches: Array.from(data.branches.entries(), ([sessionId, branch]) => [
					sessionId,
					{
						base: revisionTagCodec.encode(branch.base, { originatorId: sessionId }),
						commits: branch.commits.map((commit) =>
							encodeCommit(commit, { originatorId: commit.sessionId }),
						),
					},
				]),
				version,
			};
			return json;
		},
		decode: (json: EncodedEditManager<TChangeset>): SummaryData<TChangeset> => {
			// TODO: sort out EncodedCommit vs Commit, and make this type check without `any`.
			const trunk: readonly any[] = json.trunk;
			return {
				trunk: trunk.map(
					(commit): SequencedCommit<TChangeset> =>
						// TODO: sort out EncodedCommit vs Commit, and make this type check without `as`.
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						decodeCommit(commit, {
							originatorId: commit.sessionId,
						}),
				),
				branches: new Map(
					mapIterable(json.branches, ([sessionId, branch]) => [
						sessionId,
						{
							base: revisionTagCodec.decode(branch.base, { originatorId: sessionId }),
							commits: branch.commits.map((commit) =>
								// TODO: sort out EncodedCommit vs Commit, and make this type check without `as`.
								decodeCommit(commit as EncodedCommit<JsonCompatibleReadOnly>, {
									originatorId: commit.sessionId,
								}),
							),
						},
					]),
				),
			};
		},
	});
	// TODO: makeVersionedValidatedCodec and withSchemaValidation should allow the codec to decode JsonCompatibleReadOnly, or Versioned or something like that,
	// and not leak the internal encoded format in the API surface.
	// Fixing that would remove the need for this cast.
	return codec as unknown as IJsonCodec<SummaryData<TChangeset>>;
}
