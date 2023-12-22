/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICodecOptions,
	IJsonCodec,
	IMultiFormatCodec,
	makeVersionedValidatedCodec,
} from "../codec";
import { EncodedRevisionTag, RevisionTag } from "../core";
import { JsonCompatibleReadOnly, JsonCompatibleReadOnlySchema, mapIterable } from "../util";
import { SummaryData } from "./editManager";
import { Commit, EncodedCommit, EncodedEditManager, version } from "./editManagerFormat";

export function makeEditManagerCodec<TChangeset>(
	changeCodec: IMultiFormatCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
	options: ICodecOptions,
): IJsonCodec<SummaryData<TChangeset>> {
	const format = EncodedEditManager(
		changeCodec.json.encodedSchema ?? JsonCompatibleReadOnlySchema,
	);

	const encodeCommit = <T extends Commit<TChangeset>>(commit: T) => ({
		...commit,
		revision: revisionTagCodec.encode(commit.revision),
		change: changeCodec.json.encode(commit.change),
	});

	const decodeCommit = <T extends EncodedCommit<JsonCompatibleReadOnly>>(commit: T) => ({
		...commit,
		revision: revisionTagCodec.decode(commit.revision),
		change: changeCodec.json.decode(commit.change),
	});

	const codec: IJsonCodec<
		SummaryData<TChangeset>,
		EncodedEditManager<JsonCompatibleReadOnly>
	> = makeVersionedValidatedCodec(options, new Set([version]), format, {
		encode: (data: SummaryData<TChangeset>): EncodedEditManager<JsonCompatibleReadOnly> => {
			const json: EncodedEditManager<JsonCompatibleReadOnly> = {
				trunk: data.trunk.map(encodeCommit),
				branches: Array.from(data.branches.entries(), ([sessionId, branch]) => [
					sessionId,
					{ ...branch, commits: branch.commits.map(encodeCommit) },
				]),
				version,
			};
			return json;
		},
		decode: (json: EncodedEditManager<JsonCompatibleReadOnly>): SummaryData<TChangeset> => {
			// TODO: sort out EncodedCommit vs Commit, and make this type check without `any`.
			const trunk: any = json.trunk;
			return {
				trunk: trunk.map(decodeCommit),
				branches: new Map(
					mapIterable(json.branches, ([sessionId, branch]) => [
						sessionId,
						{
							...branch,
							// TODO: fix typing around revision tag encoding, so this compiles without using `any`
							base: revisionTagCodec.decode(branch.base as any),
							// TODO: fix typing around revision tag encoding, so this compiles without using `any`
							commits: branch.commits.map(decodeCommit as any),
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
