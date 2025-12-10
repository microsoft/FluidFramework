/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { TAnySchema } from "@sinclair/typebox";

import {
	type ICodecOptions,
	type IJsonCodec,
	type IMultiFormatCodec,
	type SchemaValidationFunction,
	extractJsonValidator,
	withSchemaValidation,
} from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	FieldKindIdentifier,
	RevisionTag,
} from "../../core/index.js";
import {
	type JsonCompatibleReadOnly,
	type Mutable,
	idAllocatorFromMaxId,
	newTupleBTree,
} from "../../util/index.js";
import type { FieldBatchCodec } from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldChangeEncodingContext } from "./fieldChangeHandler.js";
import type {
	FieldKindConfiguration,
	FieldKindConfigurationEntry,
} from "./fieldKindConfiguration.js";
import { genericFieldKind } from "./genericFieldKind.js";
import { EncodedModularChangesetV2 } from "./modularChangeFormatV2.js";
import {
	newCrossFieldKeyTable,
	type FieldChangeset,
	type ModularChangeset,
} from "./modularChangeTypes.js";
import {
	decodeDetachedNodes,
	decodeFieldChangesFromJson,
	decodeRevisionInfos,
	encodeDetachedNodes,
	encodeFieldChangesForJson,
	encodeRevisionInfos,
} from "./modularChangeCodecV1.js";

type ModularChangeCodec = IJsonCodec<
	ModularChangeset,
	EncodedModularChangesetV2,
	EncodedModularChangesetV2,
	ChangeEncodingContext
>;

type FieldCodec = IMultiFormatCodec<
	FieldChangeset,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	FieldChangeEncodingContext
>;

export function makeModularChangeCodecV2(
	fieldKinds: FieldKindConfiguration,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	codecOptions: ICodecOptions,
	chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Compressed,
): ModularChangeCodec {
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	const getMapEntry = ({ kind, formatVersion }: FieldKindConfigurationEntry) => {
		const codec = kind.changeHandler.codecsFactory(revisionTagCodec).resolve(formatVersion);
		return {
			codec,
			compiledSchema: codec.json.encodedSchema
				? extractJsonValidator(codecOptions.jsonValidator).compile(codec.json.encodedSchema)
				: undefined,
		};
	};

	/**
	 * The codec version for the generic field kind.
	 */
	const genericFieldKindFormatVersion = 1;
	const fieldChangesetCodecs: Map<
		FieldKindIdentifier,
		{
			compiledSchema?: SchemaValidationFunction<TAnySchema>;
			codec: FieldCodec;
		}
	> = new Map([
		[
			genericFieldKind.identifier,
			getMapEntry({ kind: genericFieldKind, formatVersion: genericFieldKindFormatVersion }),
		],
	]);

	fieldKinds.forEach((entry, identifier) => {
		fieldChangesetCodecs.set(identifier, getMapEntry(entry));
	});

	const modularChangeCodec: ModularChangeCodec = {
		encode: (change, context) => {
			// Destroys only exist in rollback changesets, which are never sent.
			assert(change.destroys === undefined, 0x899 /* Unexpected changeset with destroys */);
			return {
				maxId: change.maxId,
				revisions:
					change.revisions === undefined
						? undefined
						: encodeRevisionInfos(change.revisions, context, revisionTagCodec),
				changes: encodeFieldChangesForJson(
					change.fieldChanges,
					context,
					change.nodeChanges,
					fieldChangesetCodecs,
				),
				builds: encodeDetachedNodes(
					change.builds,
					context,
					revisionTagCodec,
					fieldsCodec,
					chunkCompressionStrategy,
				),
				refreshers: encodeDetachedNodes(
					change.refreshers,
					context,
					revisionTagCodec,
					fieldsCodec,
					chunkCompressionStrategy,
				),
				violations: change.constraintViolationCount,
				noChangeConstraint: change.noChangeConstraint,
			};
		},

		decode: (encodedChange: EncodedModularChangesetV2, context) => {
			const decoded: Mutable<ModularChangeset> = {
				fieldChanges: new Map(),
				nodeChanges: newTupleBTree(),
				nodeToParent: newTupleBTree(),
				nodeAliases: newTupleBTree(),
				crossFieldKeys: newCrossFieldKeyTable(),
			};

			decoded.fieldChanges = decodeFieldChangesFromJson(
				encodedChange.changes,
				undefined,
				decoded,
				context,
				idAllocatorFromMaxId(encodedChange.maxId),
				fieldKinds,
				fieldChangesetCodecs,
			);

			if (encodedChange.builds !== undefined) {
				decoded.builds = decodeDetachedNodes(
					encodedChange.builds,
					context,
					revisionTagCodec,
					fieldsCodec,
					chunkCompressionStrategy,
				);
			}
			if (encodedChange.refreshers !== undefined) {
				decoded.refreshers = decodeDetachedNodes(
					encodedChange.refreshers,
					context,
					revisionTagCodec,
					fieldsCodec,
					chunkCompressionStrategy,
				);
			}

			if (encodedChange.violations !== undefined) {
				decoded.constraintViolationCount = encodedChange.violations;
			}

			if (encodedChange.noChangeConstraint !== undefined) {
				decoded.noChangeConstraint = encodedChange.noChangeConstraint;
			}

			const decodedRevInfos = decodeRevisionInfos(
				encodedChange.revisions,
				context,
				revisionTagCodec,
			);
			if (decodedRevInfos !== undefined) {
				decoded.revisions = decodedRevInfos;
			}
			if (encodedChange.maxId !== undefined) {
				decoded.maxId = encodedChange.maxId;
			}
			return decoded;
		},
	};

	return withSchemaValidation(
		EncodedModularChangesetV2,
		modularChangeCodec,
		codecOptions.jsonValidator,
	);
}
