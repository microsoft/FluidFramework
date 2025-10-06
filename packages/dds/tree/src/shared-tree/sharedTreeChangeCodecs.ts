/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";
import {
	type CodecTree,
	DiscriminatedUnionDispatcher,
	type FormatVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	withSchemaValidation,
} from "../codec/index.js";
import type { ChangeEncodingContext, TreeStoredSchema } from "../core/index.js";
import {
	type ModularChangeFormatVersion,
	type ModularChangeset,
	type SchemaChange,
	type SchemaChangeFormatVersion,
	defaultSchemaPolicy,
	getCodecTreeForModularChangeFormat,
	getCodecTreeForSchemaChangeFormat,
	makeSchemaChangeCodecs,
} from "../feature-libraries/index.js";
import {
	brand,
	type Brand,
	type JsonCompatibleReadOnly,
	type Mutable,
} from "../util/index.js";

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
	const versions: [
		FormatVersion,
		IJsonCodec<
			SharedTreeChange,
			EncodedSharedTreeChange,
			EncodedSharedTreeChange,
			ChangeEncodingContext
		>,
	][] = Array.from(dependenciesForChangeFormat.entries()).map(
		([format, { modularChange, schemaChange }]) => [
			format,
			makeSharedTreeChangeCodec(
				modularChangeCodecFamily.resolve(modularChange).json,
				schemaChangeCodecs.resolve(schemaChange).json,
				options,
			),
		],
	);
	return makeCodecFamily(versions);
}

interface ChangeFormatDependencies {
	readonly modularChange: ModularChangeFormatVersion;
	readonly schemaChange: SchemaChangeFormatVersion;
}

export type SharedTreeChangeFormatVersion = Brand<
	1 | 2 | 3 | 4,
	"SharedTreeChangeFormatVersion"
>;

/**
 * Defines for each SharedTree change format the corresponding dependent formats to use.
 * This is an arbitrary mapping that is injected in the SharedTree change codec.
 * Once an entry is defined and used in production, it cannot be changed.
 * This is because the format for the dependent formats are not explicitly versioned.
 */
export const dependenciesForChangeFormat: Map<
	SharedTreeChangeFormatVersion,
	ChangeFormatDependencies
> = new Map([
	[brand(1), { modularChange: brand(1), schemaChange: brand(1) }],
	[brand(2), { modularChange: brand(2), schemaChange: brand(1) }],
	[brand(3), { modularChange: brand(3), schemaChange: brand(1) }],
	[brand(4), { modularChange: brand(4), schemaChange: brand(1) }],
]);

export function getCodecTreeForChangeFormat(
	version: SharedTreeChangeFormatVersion,
): CodecTree {
	const { modularChange, schemaChange } =
		dependenciesForChangeFormat.get(version) ?? fail("Unknown change format");
	return {
		name: "SharedTreeChange",
		version,
		children: [
			getCodecTreeForModularChangeFormat(modularChange),
			getCodecTreeForSchemaChangeFormat(schemaChange),
		],
	};
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
