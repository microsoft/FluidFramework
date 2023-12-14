/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IJsonCodec, ICodecOptions, ICodecFamily, makeCodecFamily } from "../codec";
import { Mutable } from "../util";
import { ModularChangeset, makeSchemaChangeCodec } from "../feature-libraries";
import { SharedTreeChange } from "./sharedTreeChangeTypes";
import { EncodedSharedTreeChange } from "./sharedTreeChangeFormat";

export function makeSharedTreeChangeCodec(
	modularChangeCodec: IJsonCodec<ModularChangeset>,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<SharedTreeChange> {
	const schemaChangeCodec = makeSchemaChangeCodec({ jsonValidator: validator });
	return {
		encode: (change) => {
			const changes: Mutable<EncodedSharedTreeChange["changes"]> = [];
			for (const decodedChange of change.changes) {
				if (decodedChange.type === "data") {
					changes.push({
						type: "data",
						change: modularChangeCodec.encode(decodedChange.innerChange),
					});
				} else if (decodedChange.type === "schema") {
					changes.push({
						type: "schema",
						change: schemaChangeCodec.encode(decodedChange.innerChange),
					});
				}
			}
			return { changes };
		},
		decode: (json) => {
			const encodedChange = json as unknown as EncodedSharedTreeChange;
			const changes: Mutable<SharedTreeChange["changes"]> = [];
			for (const subChange of encodedChange.changes) {
				if (subChange.type === "data") {
					changes.push({
						type: "data",
						innerChange: modularChangeCodec.decode(subChange.change),
					});
				} else if (subChange.type === "schema") {
					changes.push({
						type: "schema",
						innerChange: schemaChangeCodec.decode(subChange.change),
					});
				}
			}
			return { changes };
		},
	};
}

export function makeSharedTreeChangeCodecFamily(
	modularChangeCodec: IJsonCodec<ModularChangeset>,
	options: ICodecOptions,
): ICodecFamily<SharedTreeChange> {
	return makeCodecFamily([[0, makeSharedTreeChangeCodec(modularChangeCodec, options)]]);
}
