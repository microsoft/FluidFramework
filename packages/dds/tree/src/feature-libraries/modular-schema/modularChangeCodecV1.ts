/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob, fail } from "@fluidframework/core-utils/internal";
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
	ChangesetLocalId,
	EncodedRevisionTag,
	FieldKey,
	FieldKindIdentifier,
	ITreeCursorSynchronous,
	RevisionInfo,
	RevisionTag,
} from "../../core/index.js";
import {
	type IdAllocator,
	type JsonCompatibleReadOnly,
	type Mutable,
	brand,
	idAllocatorFromMaxId,
	newTupleBTree,
} from "../../util/index.js";
import {
	type FieldBatchCodec,
	type TreeChunk,
	chunkFieldSingle,
	defaultChunkPolicy,
} from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldChangeEncodingContext, FieldChangeHandler } from "./fieldChangeHandler.js";
import type {
	FieldKindConfiguration,
	FieldKindConfigurationEntry,
} from "./fieldKindConfiguration.js";
import { genericFieldKind } from "./genericFieldKind.js";
import {
	type EncodedBuilds,
	type EncodedBuildsArray,
	type EncodedFieldChange,
	type EncodedFieldChangeMap,
	EncodedModularChangesetV1,
	type EncodedNodeChangeset,
	type EncodedRevisionInfo,
} from "./modularChangeFormatV1.js";
import {
	type FieldChangeset,
	newCrossFieldKeyTable,
	type FieldChangeMap,
	type FieldId,
	type ModularChangeset,
	type NodeChangeset,
	type NodeId,
} from "./modularChangeTypes.js";
import type { ChangeAtomIdBTree } from "../changeAtomIdBTree.js";

type ModularChangeCodec = IJsonCodec<
	ModularChangeset,
	EncodedModularChangesetV1,
	EncodedModularChangesetV1,
	ChangeEncodingContext
>;

type FieldCodec = IMultiFormatCodec<
	FieldChangeset,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	FieldChangeEncodingContext
>;

type FieldChangesetCodecs = Map<
	FieldKindIdentifier,
	{
		compiledSchema?: SchemaValidationFunction<TAnySchema>;
		codec: FieldCodec;
	}
>;

export function getFieldChangesetCodec(
	fieldKind: FieldKindIdentifier,
	fieldChangesetCodecs: FieldChangesetCodecs,
): {
	compiledSchema?: SchemaValidationFunction<TAnySchema>;
	codec: FieldCodec;
} {
	const entry = fieldChangesetCodecs.get(fieldKind);
	assert(entry !== undefined, 0x5ea /* Tried to encode unsupported fieldKind */);
	return entry;
}

export function encodeFieldChangesForJson(
	change: FieldChangeMap,
	context: ChangeEncodingContext,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	fieldChangesetCodecs: FieldChangesetCodecs,
): EncodedFieldChangeMap {
	const fieldContext: FieldChangeEncodingContext = {
		baseContext: context,

		encodeNode: (nodeId: NodeId): EncodedNodeChangeset => {
			const node = nodeChanges.get([nodeId.revision, nodeId.localId]);
			assert(node !== undefined, 0x92e /* Unknown node ID */);
			return encodeNodeChangesForJson(node, fieldContext, fieldChangesetCodecs);
		},

		decodeNode: () => fail(0xb1e /* Should not decode nodes during field encoding */),
	};

	return encodeFieldChangesForJsonI(change, fieldContext, fieldChangesetCodecs);
}

export function encodeFieldChangesForJsonI(
	change: FieldChangeMap,
	context: FieldChangeEncodingContext,
	fieldChangesetCodecs: FieldChangesetCodecs,
): EncodedFieldChangeMap {
	const encodedFields: EncodedFieldChangeMap = [];

	for (const [field, fieldChange] of change) {
		const { codec, compiledSchema } = getFieldChangesetCodec(
			fieldChange.fieldKind,
			fieldChangesetCodecs,
		);
		const encodedChange = codec.json.encode(fieldChange.change, context);
		if (compiledSchema !== undefined && !compiledSchema.check(encodedChange)) {
			fail(0xb1f /* Encoded change didn't pass schema validation. */);
		}

		const fieldKey: FieldKey = field;
		const encodedField: EncodedFieldChange = {
			fieldKey,
			fieldKind: fieldChange.fieldKind,
			change: encodedChange,
		};

		encodedFields.push(encodedField);
	}

	return encodedFields;
}

export function encodeNodeChangesForJson(
	change: NodeChangeset,
	context: FieldChangeEncodingContext,
	fieldChangesetCodecs: FieldChangesetCodecs,
): EncodedNodeChangeset {
	const encodedChange: EncodedNodeChangeset = {};
	// Note: revert constraints are ignored for now because they would only be needed if we supported reverting changes made by peers.
	const { fieldChanges, nodeExistsConstraint } = change;

	if (fieldChanges !== undefined) {
		encodedChange.fieldChanges = encodeFieldChangesForJsonI(
			fieldChanges,
			context,
			fieldChangesetCodecs,
		);
	}

	if (nodeExistsConstraint !== undefined) {
		encodedChange.nodeExistsConstraint = nodeExistsConstraint;
	}

	return encodedChange;
}

export function decodeFieldChangesFromJson(
	encodedChange: EncodedFieldChangeMap,
	parentId: NodeId | undefined,
	decoded: ModularChangeset,
	context: ChangeEncodingContext,
	idAllocator: IdAllocator,
	fieldKinds: FieldKindConfiguration,
	fieldChangesetCodecs: FieldChangesetCodecs,
): FieldChangeMap {
	const decodedFields: FieldChangeMap = new Map();
	for (const field of encodedChange) {
		const { codec, compiledSchema } = getFieldChangesetCodec(
			field.fieldKind,
			fieldChangesetCodecs,
		);
		if (compiledSchema !== undefined && !compiledSchema.check(field.change)) {
			fail(0xb20 /* Encoded change didn't pass schema validation. */);
		}

		const fieldId: FieldId = {
			nodeId: parentId,
			field: field.fieldKey,
		};

		const fieldContext: FieldChangeEncodingContext = {
			baseContext: context,

			encodeNode: () => fail(0xb21 /* Should not encode nodes during field decoding */),

			decodeNode: (encodedNode: EncodedNodeChangeset): NodeId => {
				const nodeId: NodeId = {
					revision: context.revision,
					localId: brand(idAllocator.allocate()),
				};

				const node = decodeNodeChangesetFromJson(
					encodedNode,
					nodeId,
					decoded,
					context,
					idAllocator,
					fieldKinds,
					fieldChangesetCodecs,
				);

				decoded.nodeChanges.set([nodeId.revision, nodeId.localId], node);
				decoded.nodeToParent.set([nodeId.revision, nodeId.localId], fieldId);
				return nodeId;
			},
		};

		const fieldChangeset = codec.json.decode(field.change, fieldContext);

		const crossFieldKeys = getChangeHandler(fieldKinds, field.fieldKind).getCrossFieldKeys(
			fieldChangeset,
		);

		for (const { key, count } of crossFieldKeys) {
			decoded.crossFieldKeys.set(key, count, fieldId);
		}

		const fieldKey: FieldKey = brand<FieldKey>(field.fieldKey);

		decodedFields.set(fieldKey, {
			fieldKind: field.fieldKind,
			change: brand(fieldChangeset),
		});
	}

	return decodedFields;
}

export function decodeNodeChangesetFromJson(
	encodedChange: EncodedNodeChangeset,
	id: NodeId,
	decoded: ModularChangeset,
	context: ChangeEncodingContext,
	idAllocator: IdAllocator,
	fieldKinds: FieldKindConfiguration,
	fieldChangesetCodecs: FieldChangesetCodecs,
): NodeChangeset {
	const decodedChange: NodeChangeset = {};
	const { fieldChanges, nodeExistsConstraint } = encodedChange;

	if (fieldChanges !== undefined) {
		decodedChange.fieldChanges = decodeFieldChangesFromJson(
			fieldChanges,
			id,
			decoded,
			context,
			idAllocator,
			fieldKinds,
			fieldChangesetCodecs,
		);
	}

	if (nodeExistsConstraint !== undefined) {
		decodedChange.nodeExistsConstraint = nodeExistsConstraint;
	}

	return decodedChange;
}

export function encodeDetachedNodes(
	detachedNodes: ChangeAtomIdBTree<TreeChunk> | undefined,
	context: ChangeEncodingContext,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	chunkCompressionStrategy: TreeCompressionStrategy,
): EncodedBuilds | undefined {
	if (detachedNodes === undefined) {
		return undefined;
	}

	const treesToEncode: ITreeCursorSynchronous[] = [];
	const buildsArray: EncodedBuildsArray = [];

	let buildsForRevision:
		| [[ChangesetLocalId, number][], EncodedRevisionTag]
		| [[ChangesetLocalId, number][]]
		| undefined;

	for (const [[revision, id], chunk] of detachedNodes.entries()) {
		const encodedRevision = encodeRevisionOpt(revisionTagCodec, revision, context);

		if (buildsForRevision === undefined || buildsForRevision[1] !== encodedRevision) {
			if (buildsForRevision !== undefined) {
				buildsArray.push(buildsForRevision);
			}

			buildsForRevision = encodedRevision === undefined ? [[]] : [[], encodedRevision];
		}

		treesToEncode.push(chunk.cursor());
		const treeIndexInBatch = treesToEncode.length - 1;
		buildsForRevision?.[0].push([id, treeIndexInBatch]);
	}

	if (buildsForRevision !== undefined) {
		buildsArray.push(buildsForRevision);
	}

	return buildsArray.length === 0
		? undefined
		: {
				builds: buildsArray,
				trees: fieldsCodec.encode(treesToEncode, {
					encodeType: chunkCompressionStrategy,
					schema: context.schema,
					originatorId: context.originatorId,
					idCompressor: context.idCompressor,
				}),
			};
}

export function decodeDetachedNodes(
	encoded: EncodedBuilds | undefined,
	context: ChangeEncodingContext,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	chunkCompressionStrategy: TreeCompressionStrategy,
): ChangeAtomIdBTree<TreeChunk> | undefined {
	if (encoded === undefined || encoded.builds.length === 0) {
		return undefined;
	}

	const chunks = fieldsCodec.decode(encoded.trees, {
		encodeType: chunkCompressionStrategy,
		originatorId: context.originatorId,
		idCompressor: context.idCompressor,
	});
	const getChunk = (index: number): TreeChunk => {
		assert(index < chunks.length, 0x898 /* out of bounds index for build chunk */);
		return chunkFieldSingle(chunks[index] ?? oob(), {
			policy: defaultChunkPolicy,
			idCompressor: context.idCompressor,
		});
	};

	const map: ModularChangeset["builds"] = newTupleBTree();
	// eslint-disable-next-line unicorn/no-array-for-each -- Codec internals: minimizing changes to serialization logic
	encoded.builds.forEach((build) => {
		// EncodedRevisionTag cannot be an array so this ensures that we can isolate the tuple
		const revision =
			build[1] === undefined ? context.revision : revisionTagCodec.decode(build[1], context);

		const decodedChunks: [ChangesetLocalId, TreeChunk][] = build[0].map(([i, n]) => [
			i,
			getChunk(n),
		]);

		for (const [id, chunk] of decodedChunks) {
			map.set([revision, id], chunk);
		}
	});

	return map;
}

export function encodeRevisionInfos(
	revisions: readonly RevisionInfo[],
	context: ChangeEncodingContext,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): EncodedRevisionInfo[] | undefined {
	if (context.revision !== undefined) {
		assert(
			revisions.length === 1 &&
				revisions[0] !== undefined &&
				revisions[0].revision === context.revision &&
				revisions[0].rollbackOf === undefined,
			0x964 /* A tagged change should only contain the tagged revision */,
		);

		return undefined;
	}

	const encodedRevisions = [];
	for (const revision of revisions) {
		const encodedRevision: Mutable<EncodedRevisionInfo> = {
			revision: revisionTagCodec.encode(revision.revision, context),
		};

		if (revision.rollbackOf !== undefined) {
			encodedRevision.rollbackOf = revisionTagCodec.encode(revision.rollbackOf, context);
		}

		encodedRevisions.push(encodedRevision);
	}

	return encodedRevisions;
}

export function decodeRevisionInfos(
	revisions: readonly EncodedRevisionInfo[] | undefined,
	context: ChangeEncodingContext,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): RevisionInfo[] | undefined {
	if (revisions === undefined) {
		return context.revision === undefined ? undefined : [{ revision: context.revision }];
	}

	const decodedRevisions = [];
	for (const revision of revisions) {
		const decodedRevision: Mutable<RevisionInfo> = {
			revision: revisionTagCodec.decode(revision.revision, context),
		};

		if (revision.rollbackOf !== undefined) {
			decodedRevision.rollbackOf = revisionTagCodec.decode(revision.rollbackOf, context);
		}

		decodedRevisions.push(decodedRevision);
	}

	return decodedRevisions;
}

export function encodeChange(
	change: ModularChangeset,
	context: ChangeEncodingContext,
	fieldChangesetCodecs: Map<
		FieldKindIdentifier,
		{
			compiledSchema?: SchemaValidationFunction<TAnySchema>;
			codec: FieldCodec;
		}
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	chunkCompressionStrategy: TreeCompressionStrategy,
): EncodedModularChangesetV1 {
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
	};
}

export function decodeChange(
	encodedChange: EncodedModularChangesetV1,
	context: ChangeEncodingContext,
	fieldKinds: FieldKindConfiguration,
	fieldChangesetCodecs: Map<
		FieldKindIdentifier,
		{
			compiledSchema?: SchemaValidationFunction<TAnySchema>;
			codec: FieldCodec;
		}
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	chunkCompressionStrategy: TreeCompressionStrategy,
): Mutable<ModularChangeset> {
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
}

export function getFieldChangesetCodecs(
	fieldKinds: FieldKindConfiguration,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	codecOptions: ICodecOptions,
): Map<
	FieldKindIdentifier,
	{ compiledSchema?: SchemaValidationFunction<TAnySchema>; codec: FieldCodec }
> {
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

	// eslint-disable-next-line unicorn/no-array-for-each -- Map.forEach with (value, key) signature; codec initialization
	fieldKinds.forEach((entry, identifier) => {
		fieldChangesetCodecs.set(identifier, getMapEntry(entry));
	});

	return fieldChangesetCodecs;
}

export function makeModularChangeCodecV1(
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
	const fieldChangesetCodecs = getFieldChangesetCodecs(
		fieldKinds,
		revisionTagCodec,
		codecOptions,
	);

	const modularChangeCodec: ModularChangeCodec = {
		encode: (change, context) =>
			encodeChange(
				change,
				context,
				fieldChangesetCodecs,
				revisionTagCodec,
				fieldsCodec,
				chunkCompressionStrategy,
			),
		decode: (encodedChange, context) =>
			decodeChange(
				encodedChange,
				context,
				fieldKinds,
				fieldChangesetCodecs,
				revisionTagCodec,
				fieldsCodec,
				chunkCompressionStrategy,
			),
	};

	return withSchemaValidation(
		EncodedModularChangesetV1,
		modularChangeCodec,
		codecOptions.jsonValidator,
	);
}

function getChangeHandler(
	fieldKinds: FieldKindConfiguration,
	fieldKind: FieldKindIdentifier,
): FieldChangeHandler<unknown> {
	if (fieldKind === genericFieldKind.identifier) {
		return genericFieldKind.changeHandler;
	}

	const handler = fieldKinds.get(fieldKind)?.kind.changeHandler;
	assert(handler !== undefined, 0x9c1 /* Unknown field kind */);
	return handler;
}

function encodeRevisionOpt(
	revisionCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	revision: RevisionTag | undefined,
	context: ChangeEncodingContext,
): EncodedRevisionTag | undefined {
	if (revision === undefined) {
		return undefined;
	}

	return revision === context.revision ? undefined : revisionCodec.encode(revision, context);
}
