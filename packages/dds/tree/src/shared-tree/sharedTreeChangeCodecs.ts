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
	type IJsonCodec,
	makeCodecFamily,
	withSchemaValidation,
} from "../codec/index.js";
import type { ChangeEncodingContext, TreeStoredSchema } from "../core/index.js";
import {
	ModularChangeFormatVersion,
	type ModularChangeset,
	defaultSchemaPolicy,
	getCodecTreeForModularChangeFormat,
	makeSchemaChangeCodec,
	schemaCodecBuilder,
} from "../feature-libraries/index.js";
import {
	strictEnum,
	type JsonCompatibleReadOnly,
	type Mutable,
	type Values,
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
	const versions: [
		FormatVersion,
		IJsonCodec<
			SharedTreeChange,
			EncodedSharedTreeChange,
			EncodedSharedTreeChange,
			ChangeEncodingContext
		>,
	][] = [...dependenciesForChangeFormat.entries()].map(([format, { modularChange }]) => [
		format,
		makeSharedTreeChangeCodec(modularChangeCodecFamily.resolve(modularChange), options),
	]);
	return makeCodecFamily(versions);
}

interface ChangeFormatDependencies {
	readonly modularChange: ModularChangeFormatVersion;
}

/**
 * The format version for `SharedTreeChange`.
 */
export const SharedTreeChangeFormatVersion = strictEnum("SharedTreeChangeFormatVersion", {
	/**
	 * Introduced prior to 2.0 and used beyond.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability needs to be maintained so long as {@link lowestMinVersionForCollab} is less than 2.2.0.
	 */
	v3: 3,
	/**
	 * Introduced in 2.2.0.
	 * Was inadvertently made usable for writing in 2.43.0 (through configuredSharedTree) and remains available.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability could be dropped in favor of {@link SharedTreeChangeFormatVersion.v3},
	 * but doing so would make the pattern of writable versions more complex and gain little
	 * because the logic for this format is shared with {@link SharedTreeChangeFormatVersion.v3}.
	 */
	v4: 4,
	/**
	 * Introduced and made available for writing in 2.80.0
	 * Adds support for "no change" constraints.
	 */
	v5: 5,
});
export type SharedTreeChangeFormatVersion = Values<typeof SharedTreeChangeFormatVersion>;

/**
 * Defines for each SharedTree change format the corresponding dependent formats to use.
 * This is an arbitrary mapping that is injected in the SharedTree change codec.
 * Once an entry is defined and used in production, it cannot be changed.
 * This is because the format for the dependent formats are not explicitly versioned.
 * @remarks
 * SchemaFormatVersion (used by SchemaChangeFormat) is not included here since it is explicitly versioned.
 */
export const dependenciesForChangeFormat = new Map<
	SharedTreeChangeFormatVersion,
	ChangeFormatDependencies
>([
	[
		SharedTreeChangeFormatVersion.v3,
		{
			modularChange: ModularChangeFormatVersion.v3,
		},
	],
	[
		SharedTreeChangeFormatVersion.v4,
		{
			modularChange: ModularChangeFormatVersion.v4,
		},
	],
	[
		SharedTreeChangeFormatVersion.v5,
		{
			modularChange: ModularChangeFormatVersion.v5,
		},
	],
]);

export function getCodecTreeForChangeFormat(
	version: SharedTreeChangeFormatVersion,
	clientVersion: MinimumVersionForCollab,
): CodecTree {
	const { modularChange } =
		dependenciesForChangeFormat.get(version) ?? fail(0xc78 /* Unknown change format */);
	return {
		name: "SharedTreeChange",
		version,
		children: [
			getCodecTreeForModularChangeFormat(modularChange),
			schemaCodecBuilder.getCodecTree(clientVersion),
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
	codecOptions: CodecWriteOptions,
): IJsonCodec<
	SharedTreeChange,
	EncodedSharedTreeChange,
	EncodedSharedTreeChange,
	ChangeEncodingContext
> {
	const schemaChangeCodec = makeSchemaChangeCodec(codecOptions);
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
		EncodedSharedTreeChange(schemaChangeCodec.encodedSchema),
		{
			encode: (change, context) => {
				const changes: EncodedSharedTreeInnerChange[] = [];
				let updatedSchema: TreeStoredSchema | undefined;
				for (const decodedChange of change.changes) {
					if (decodedChange.type === "data") {
						const schemaAndPolicy =
							updatedSchema === undefined
								? context.schema
								: {
										policy:
											context.schema === undefined
												? defaultSchemaPolicy
												: context.schema.policy,
										schema: updatedSchema,
									};
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
