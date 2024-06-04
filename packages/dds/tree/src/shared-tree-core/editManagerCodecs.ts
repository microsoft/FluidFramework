/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodecFamily,
	ICodecOptions,
	IJsonCodec,
	IMultiFormatCodec,
	makeCodecFamily,
	withSchemaValidation,
} from "../codec/index.js";
import { makeVersionDispatchingCodec } from "../codec/index.js";
import {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import {
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlySchema,
	mapIterable,
} from "../util/index.js";

import { SummaryData } from "./editManager.js";
import { Commit, EncodedCommit, EncodedEditManager, SequencedCommit } from "./editManagerFormat.js";

export interface EditManagerEncodingContext {
	readonly schema?: SchemaAndPolicy;
}

export function makeEditManagerCodec<TChangeset>(
	changeCodecs: ICodecFamily<TChangeset, ChangeEncodingContext>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
	writeVersion: number,
): IJsonCodec<
	SummaryData<TChangeset>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	EditManagerEncodingContext
> {
	const family = makeEditManagerCodecs(changeCodecs, revisionTagCodec, options);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

export function makeEditManagerCodecs<TChangeset>(
	changeCodecs: ICodecFamily<TChangeset, ChangeEncodingContext>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
): ICodecFamily<SummaryData<TChangeset>, EditManagerEncodingContext> {
	return makeCodecFamily([
		[1, makeV1CodecWithVersion(changeCodecs.resolve(1), revisionTagCodec, options, 1)],
		[2, makeV1CodecWithVersion(changeCodecs.resolve(2), revisionTagCodec, options, 2)],
		[3, makeV1CodecWithVersion(changeCodecs.resolve(3), revisionTagCodec, options, 3)],
	]);
}

function makeV1CodecWithVersion<TChangeset>(
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
	options: ICodecOptions,
	version: EncodedEditManager<TChangeset>["version"],
): IJsonCodec<
	SummaryData<TChangeset>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	EditManagerEncodingContext
> {
	const format = EncodedEditManager(
		changeCodec.json.encodedSchema ?? JsonCompatibleReadOnlySchema,
	);

	const encodeCommit = <T extends Commit<TChangeset>>(
		commit: T,
		context: ChangeEncodingContext,
		// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	) => ({
		...commit,
		revision: revisionTagCodec.encode(commit.revision, {
			originatorId: commit.sessionId,
			revision: undefined,
		}),
		change: changeCodec.json.encode(commit.change, { ...context, revision: commit.revision }),
	});

	const decodeCommit = <T extends EncodedCommit<JsonCompatibleReadOnly>>(
		commit: T,
		context: ChangeEncodingContext,
		// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	) => {
		const revision = revisionTagCodec.decode(commit.revision, {
			originatorId: commit.sessionId,
			revision: undefined,
		});

		return {
			...commit,
			revision,
			change: changeCodec.json.decode(commit.change, { ...context, revision }),
		};
	};

	const codec: IJsonCodec<
		SummaryData<TChangeset>,
		EncodedEditManager<TChangeset>,
		EncodedEditManager<TChangeset>,
		EditManagerEncodingContext
	> = withSchemaValidation(
		format,
		{
			encode: (data, context: EditManagerEncodingContext) => {
				const json: EncodedEditManager<TChangeset> = {
					trunk: data.trunk.map((commit) =>
						encodeCommit(commit, {
							originatorId: commit.sessionId,
							schema: context.schema,
							revision: undefined,
						}),
					),
					branches: Array.from(
						data.peerLocalBranches.entries(),
						([sessionId, branch]) => [
							sessionId,
							{
								base: revisionTagCodec.encode(branch.base, {
									originatorId: sessionId,
									revision: undefined,
								}),
								commits: branch.commits.map((commit) =>
									encodeCommit(commit, {
										originatorId: commit.sessionId,
										schema: context.schema,
										revision: undefined,
									}),
								),
							},
						],
					),
					version,
				};
				return json;
			},
			decode: (json: EncodedEditManager<TChangeset>): SummaryData<TChangeset> => {
				// TODO: sort out EncodedCommit vs Commit, and make this type check without `any`.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const trunk: readonly any[] = json.trunk;
				return {
					trunk: trunk.map(
						(commit): SequencedCommit<TChangeset> =>
							// TODO: sort out EncodedCommit vs Commit, and make this type check without `as`.
							// eslint-disable-next-line @typescript-eslint/no-unsafe-return
							decodeCommit(commit, {
								originatorId: commit.sessionId,
								revision: undefined,
							}),
					),
					peerLocalBranches: new Map(
						mapIterable(json.branches, ([sessionId, branch]) => [
							sessionId,
							{
								base: revisionTagCodec.decode(branch.base, {
									originatorId: sessionId,
									revision: undefined,
								}),
								commits: branch.commits.map((commit) =>
									// TODO: sort out EncodedCommit vs Commit, and make this type check without `as`.
									decodeCommit(commit as EncodedCommit<JsonCompatibleReadOnly>, {
										originatorId: commit.sessionId,
										revision: undefined,
									}),
								),
							},
						]),
					),
				};
			},
		},
		options.jsonValidator,
	);
	// TODO: makeVersionedValidatedCodec and withSchemaValidation should allow the codec to decode JsonCompatibleReadOnly, or Versioned or something like that,
	// and not leak the internal encoded format in the API surface.
	// Fixing that would remove the need for this cast.
	return codec as unknown as IJsonCodec<
		SummaryData<TChangeset>,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		EditManagerEncodingContext
	>;
}
