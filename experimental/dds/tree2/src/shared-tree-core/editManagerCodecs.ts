/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO:
// It is unclear if we would want to use the TypeBox compiler
// (which generates code at runtime for maximum validation perf).
// This might be an issue with security policies (ex: no eval) and/or more bundle size than we want.
// We could disable validation or pull in a different validator (like ajv).
// Only using its validation when testing is another option.
// typebox documents using this internal module, so it should be ok to access.
// eslint-disable-next-line import/no-internal-modules
import { TypeCompiler } from "@sinclair/typebox/compiler";
import { assert } from "@fluidframework/common-utils";
import { IJsonCodec, IMultiFormatCodec } from "../codec";
import { JsonCompatibleReadOnly, JsonCompatibleReadOnlySchema, mapIterable } from "../util";
import { SummaryData } from "./editManager";
import { Commit, EncodedEditManager } from "./editManagerFormat";

export function makeEditManagerCodec<TChangeset>(
	changeCodec: IMultiFormatCodec<TChangeset>,
): IJsonCodec<SummaryData<TChangeset>, string> {
	const format = TypeCompiler.Compile(
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
			assert(format.Check(json), "Encoded schema should validate");
			return JSON.stringify(json);
		},
		decode: (summary) => {
			const json: EncodedEditManager<TChangeset> = JSON.parse(summary);
			assert(format.Check(json), "Encoded schema should validate");
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
