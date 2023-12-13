/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IJsonCodec, ICodecOptions, ICodecFamily, makeCodecFamily } from "../codec";
import { Mutable } from "../util";
import {
	ModularChangeset,
	makeModularChangeCodec,
	makeSchemaChangeCodec,
} from "../feature-libraries";
import { SharedTreeChange } from "./sharedTreeChangeTypes";

// These can't be an interfaces or they don't get the special string indexer bonus property.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EncodedChange = {
	readonly isConflicted: boolean;
};

type EncodedModularChange = {
	type: "data";
	change: ReturnType<ReturnType<typeof makeModularChangeCodec>["encode"]>;
} & EncodedChange;

type EncodedSchemaChange = {
	type: "schema";
	change: ReturnType<ReturnType<typeof makeModularChangeCodec>["encode"]>;
} & EncodedChange;

export interface EncodedSharedTreeChange {
	readonly encodedChanges: readonly (EncodedModularChange | EncodedSchemaChange)[];
}

export function makeSharedTreeChangeCodec(
	modularChangeCodec: IJsonCodec<ModularChangeset>,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<SharedTreeChange> {
	const schemaChangeCodec = makeSchemaChangeCodec({ jsonValidator: validator });
	return {
		encode: (change) => {
			const changes: Mutable<EncodedSharedTreeChange["encodedChanges"]> = [];
			for (const decodedChange of change.changes) {
				if (decodedChange.type === "data") {
					changes.push({
						type: "data",
						change: modularChangeCodec.encode(decodedChange.innerChange),
						isConflicted: decodedChange.isConflicted,
					});
				} else if (decodedChange.type === "schema") {
					changes.push({
						type: "schema",
						change: schemaChangeCodec.encode(decodedChange.innerChange),
						isConflicted: decodedChange.isConflicted,
					});
				}
			}
			return { encodedChanges: changes };
		},
		decode: (json) => {
			const encodedChange = json as unknown as EncodedSharedTreeChange;
			const changes: Mutable<SharedTreeChange["changes"]> = [];
			for (const subChange of encodedChange.encodedChanges) {
				if (subChange.type === "data") {
					changes.push({
						type: "data",
						innerChange: modularChangeCodec.decode(subChange.change),
						isConflicted: subChange.isConflicted,
					});
				} else if (subChange.type === "schema") {
					changes.push({
						type: "schema",
						innerChange: schemaChangeCodec.decode(subChange.change),
						isConflicted: subChange.isConflicted,
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
