/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec, IMultiFormatCodec } from "../codec";
import { JsonCompatibleReadOnly, JsonCompatibleReadOnlySchema, mapIterable } from "../util";
import { SummaryData } from "./editManager";
import { Commit, EncodedEditManager } from "./editManagerFormat";

export function makeEditManagerCodec<TChangeset>(
	changeCodec: IMultiFormatCodec<TChangeset>,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<SummaryData<TChangeset>> {
	const format = validator.compile(
		EncodedEditManager(changeCodec.json.encodedSchema ?? JsonCompatibleReadOnlySchema),
	);

	const encodeCommit = <T extends Commit<TChangeset>>(commit: T) => ({
		...commit,
		change: changeCodec.json.encode(commit.change),
	});

	const decodeCommit = <T extends Commit<JsonCompatibleReadOnly>>(commit: T) => ({
		...commit,
		change: changeCodec.json.decode(commit.change),
	});

	return {
		encode: (data) => {
			const json: EncodedEditManager<TChangeset> = {
				trunk: data.trunk.map(encodeCommit),
				branches: Array.from(data.branches.entries(), ([sessionId, branch]) => [
					sessionId,
					{ ...branch, commits: branch.commits.map(encodeCommit) },
				]),
			};
			assert(format.check(json), 0x6cc /* Encoded schema should validate */);
			return json;
		},
		decode: (json) => {
			assert(format.check(json), 0x6cd /* Encoded schema should validate */);
			return {
				trunk: json.trunk.map(decodeCommit),
				branches: new Map(
					mapIterable(json.branches, ([sessionId, branch]) => [
						sessionId,
						{ ...branch, commits: branch.commits.map(decodeCommit) },
					]),
				),
			};
		},
	};
}
