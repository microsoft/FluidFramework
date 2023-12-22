/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec, IMultiFormatCodec, SessionAwareCodec } from "../codec";
import { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../core";
import { JsonCompatibleReadOnly, JsonCompatibleReadOnlySchema, mapIterable } from "../util";
import { SummaryData } from "./editManager";
import { Commit, EncodedCommit, EncodedEditManager } from "./editManagerFormat";

export function makeEditManagerCodec<TChangeset>(
	changeCodec: IMultiFormatCodec<
		TChangeset,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<SummaryData<TChangeset>> {
	const format = validator.compile(
		EncodedEditManager(changeCodec.json.encodedSchema ?? JsonCompatibleReadOnlySchema),
	);

	const encodeCommit = <T extends Commit<TChangeset>>(
		commit: T,
		context: ChangeEncodingContext,
	) => ({
		...commit,
		revision: revisionTagCodec.encode(commit.revision, commit.sessionId),
		change: changeCodec.json.encode(commit.change, context),
	});

	const decodeCommit = <T extends EncodedCommit<JsonCompatibleReadOnly>>(
		commit: T,
		context: ChangeEncodingContext,
	) => ({
		...commit,
		revision: revisionTagCodec.decode(commit.revision, commit.sessionId),
		change: changeCodec.json.decode(commit.change, context),
	});

	return {
		encode: (data) => {
			const json: EncodedEditManager<TChangeset> = {
				trunk: data.trunk.map((commit) =>
					encodeCommit(commit, { originatorId: commit.sessionId }),
				),
				branches: Array.from(data.branches.entries(), ([sessionId, branch]) => [
					sessionId,
					{
						base: revisionTagCodec.encode(branch.base, sessionId),
						commits: branch.commits.map((commit) =>
							encodeCommit(commit, { originatorId: commit.sessionId }),
						),
					},
				]),
			};
			assert(format.check(json), 0x6cc /* Encoded schema should validate */);
			return json as unknown as JsonCompatibleReadOnly;
		},
		decode: (json) => {
			assert(format.check(json), 0x6cd /* Encoded schema should validate */);
			return {
				trunk: json.trunk.map((commit) =>
					decodeCommit(commit, { originatorId: commit.sessionId }),
				),
				branches: new Map(
					mapIterable(json.branches, ([sessionId, branch]) => [
						sessionId,
						{
							base: revisionTagCodec.decode(branch.base, sessionId),
							commits: branch.commits.map((commit) =>
								decodeCommit(commit, {
									originatorId: commit.sessionId,
								}),
							),
						},
					]),
				),
			};
		},
	};
}
