/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DiscriminatedUnionDispatcher,
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	withSchemaValidation,
} from "../codec/index.js";
import type { ChangeEncodingContext, TreeStoredSchema } from "../core/index.js";
import {
	type ModularChangeset,
	type SchemaChange,
	defaultSchemaPolicy,
	makeSchemaChangeCodecs,
} from "../feature-libraries/index.js";
import type { JsonCompatibleReadOnly, Mutable } from "../util/index.js";

import {
	EncodedSharedTreeChange,
	type EncodedSharedTreeInnerChange,
} from "./sharedTreeChangeFormat.js";
import type { SharedTreeChange, SharedTreeInnerChange } from "./sharedTreeChangeTypes.js";

export function makeSharedTreeChangeCodecFamily(
	modularChangeCodecFamily: ICodecFamily<ModularChangeset, ChangeEncodingContext>,
	options: ICodecOptions,
): ICodecFamily<SharedTreeChange, ChangeEncodingContext> {
	const schemaChangeCodecs = makeSchemaChangeCodecs(options);
	return makeCodecFamily([
		[
			1,
			makeSharedTreeChangeCodec(
				modularChangeCodecFamily.resolve(1).json,
				schemaChangeCodecs.resolve(1).json,
				options,
			),
		],
		[
			2,
			makeSharedTreeChangeCodec(
				modularChangeCodecFamily.resolve(2).json,
				schemaChangeCodecs.resolve(1).json,
				options,
			),
		],
		[
			3,
			makeSharedTreeChangeCodec(
				modularChangeCodecFamily.resolve(3).json,
				schemaChangeCodecs.resolve(1).json,
				options,
			),
		],
		[
			4,
			makeSharedTreeChangeCodec(
				modularChangeCodecFamily.resolve(4).json,
				schemaChangeCodecs.resolve(1).json,
				options,
			),
		],
	]);
}

function makeSharedTreeChangeCodec(
	modularChangeCodec: IJsonCodec<
		ModularChangeset,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	schemaChangeCodec: IJsonCodec<SchemaChange>,
	codecOptions: ICodecOptions,
): IJsonCodec<
	SharedTreeChange,
	EncodedSharedTreeChange,
	EncodedSharedTreeChange,
	ChangeEncodingContext
> {
	const decoderLibrary = new DiscriminatedUnionDispatcher<
		EncodedSharedTreeInnerChange,
		[context: ChangeEncodingContext],
		SharedTreeInnerChange
	>({
		data(encoded, context): SharedTreeInnerChange {
			return {
				type: "data",
				innerChange: modularChangeCodec.decode(encoded, context),
			};
		},
		schema(encoded): SharedTreeInnerChange {
			return {
				type: "schema",
				innerChange: schemaChangeCodec.decode(encoded),
			};
		},
	});

	return withSchemaValidation(
		EncodedSharedTreeChange,
		{
			encode: (change, context) => {
				const changes: EncodedSharedTreeInnerChange[] = [];
				let updatedSchema: TreeStoredSchema | undefined;
				for (const decodedChange of change.changes) {
					if (decodedChange.type === "data") {
						const schemaAndPolicy =
							updatedSchema !== undefined
								? {
										policy:
											context.schema !== undefined
												? context.schema.policy
												: defaultSchemaPolicy,
										schema: updatedSchema,
									}
								: context.schema;
						changes.push({
							data: modularChangeCodec.encode(decodedChange.innerChange, {
								originatorId: context.originatorId,
								schema: schemaAndPolicy,
								idCompressor: context.idCompressor,
								revision: context.revision,
							}),
						});
					} else if (decodedChange.type === "schema") {
						changes.push({
							schema: schemaChangeCodec.encode(decodedChange.innerChange),
						});
						updatedSchema = decodedChange.innerChange.schema.new;
					}
				}
				return changes;
			},
			decode: (encodedChange, context) => {
				const changes: Mutable<SharedTreeChange["changes"]> = [];
				for (const subChange of encodedChange) {
					changes.push(decoderLibrary.dispatch(subChange, context));
				}
				return { changes };
			},
		},
		codecOptions.jsonValidator,
	);
}
