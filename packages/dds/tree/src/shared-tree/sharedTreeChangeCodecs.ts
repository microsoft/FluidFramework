/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import {
	type CodecTree,
	type CodecWriteOptions,
	DiscriminatedUnionDispatcher,
	type FormatVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	withSchemaValidation,
} from "../codec/index.js";
import {
	type ChangeEncodingContext,
	SchemaFormatVersion,
	type TreeStoredSchema,
} from "../core/index.js";
import {
	type ModularChangeFormatVersion,
	type ModularChangeset,
	type SchemaChange,
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
	options: CodecWriteOptions,
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
	readonly schemaChange: SchemaFormatVersion;
}

export type SharedTreeChangeFormatVersion = Brand<3 | 4, "SharedTreeChangeFormatVersion">;

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
	[brand(3), { modularChange: brand(3), schemaChange: brand(SchemaFormatVersion.v1) }],
	[brand(4), { modularChange: brand(4), schemaChange: brand(SchemaFormatVersion.v1) }],
]);

export function getCodecTreeForChangeFormat(
	version: SharedTreeChangeFormatVersion,
	clientVersion: MinimumVersionForCollab,
): CodecTree {
	const { modularChange, schemaChange } =
		dependenciesForChangeFormat.get(version) ?? fail(0xc78 /* Unknown change format */);
	return {
		name: "SharedTreeChange",
		version,
		children: [
			getCodecTreeForModularChangeFormat(modularChange),
			getCodecTreeForSchemaChangeFormat(schemaChange, clientVersion),
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
