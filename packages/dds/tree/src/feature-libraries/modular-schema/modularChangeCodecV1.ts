/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, oob } from "@fluidframework/core-utils/internal";
import type { TAnySchema } from "@sinclair/typebox";

import {
	extractJsonValidator,
	withSchemaValidation,
	type ICodecOptions,
	type IJsonCodec,
	type IMultiFormatCodec,
	type SchemaValidationFunction,
} from "../../codec/index.js";
import {
	newChangeAtomIdTransform,
	type ChangeAtomId,
	type ChangeAtomIdRangeMap,
	type ChangeEncodingContext,
	type ChangesetLocalId,
	type EncodedRevisionTag,
	type FieldKey,
	type FieldKindIdentifier,
	type ITreeCursorSynchronous,
	type RevisionInfo,
	type RevisionTag,
} from "../../core/index.js";
import {
	brand,
	idAllocatorFromMaxId,
	newTupleBTree,
	type IdAllocator,
	type JsonCompatibleReadOnly,
	type Mutable,
	type RangeQueryEntry,
	type RangeQueryResult,
	type TupleBTree,
} from "../../util/index.js";
import { setInChangeAtomIdMap, type ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import {
	chunkFieldSingle,
	defaultChunkPolicy,
	type FieldBatchCodec,
	type TreeChunk,
} from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldChangeEncodingContext, FieldChangeHandler } from "./fieldChangeHandler.js";
import type { FlexFieldKind } from "./fieldKind.js";
import type {
	FieldKindConfiguration,
	FieldKindConfigurationEntry,
} from "./fieldKindConfiguration.js";
import { genericFieldKind } from "./genericFieldKind.js";
import {
	addNodeRename,
	getFirstAttachField,
	getFirstDetachField,
	newRootTable,
	normalizeFieldId,
	validateChangeset,
	type FieldIdKey,
} from "./modularChangeFamily.js";
import { EncodedModularChangesetV1 } from "./modularChangeFormatV1.js";
import type {
	EncodedBuilds,
	EncodedBuildsArray,
	EncodedFieldChange,
	EncodedFieldChangeMap,
	EncodedNodeChangeset,
	EncodedRevisionInfo,
} from "./modularChangeFormatV1.js";
import {
	newCrossFieldRangeTable,
	type CrossFieldKeyTable,
	type FieldChangeMap,
	type FieldChangeset,
	type FieldId,
	type ModularChangeset,
	type NodeChangeset,
	type NodeId,
	type NodeLocation,
	type RootNodeTable,
} from "./modularChangeTypes.js";

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

interface FieldRootChanges {
	readonly nodeChanges: ChangeAtomIdBTree<NodeId>;
	readonly renames: ChangeAtomIdRangeMap<ChangeAtomId>;
}

type FieldRootMap = TupleBTree<FieldIdKey, FieldRootChanges>;

type FieldChangesetCodecs = Map<
	FieldKindIdentifier,
	{
		compiledSchema?: SchemaValidationFunction<TAnySchema>;
		codec: FieldCodec;
	}
>;

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

function encodeFieldChangesForJson(
	change: FieldChangeMap,
	parentId: NodeId | undefined,
	fieldToRoots: FieldRootMap,
	context: ChangeEncodingContext,
	encodeNode: NodeEncoder,
	getInputRootId: ChangeAtomMappingQuery,
	isAttachId: ChangeAtomIdRangeQuery,
	isDetachId: ChangeAtomIdRangeQuery,
	getCellIdForMove: ChangeAtomMappingQuery,
	fieldChangesetCodecs: FieldChangesetCodecs,
): EncodedFieldChangeMap {
	const encodedFields: EncodedFieldChangeMap = [];

	for (const [field, fieldChange] of change) {
		const { codec, compiledSchema } = getFieldChangesetCodec(
			fieldChange.fieldKind,
			fieldChangesetCodecs,
		);
		const rootChanges = fieldToRoots.get([parentId?.revision, parentId?.localId, field]);

		const fieldContext: FieldChangeEncodingContext = {
			baseContext: context,
			rootNodeChanges: rootChanges?.nodeChanges ?? newTupleBTree(),
			rootRenames: rootChanges?.renames ?? newChangeAtomIdTransform(),

			encodeNode,
			getInputRootId,
			isAttachId,
			isDetachId,
			getCellIdForMove,

			decodeNode: () => fail(0xb1e /* Should not decode nodes during field encoding */),
			decodeRootNodeChange: () => fail("Should not be called during encoding"),
			decodeRootRename: () => fail("Should not be called during encoding"),
			decodeMoveAndDetach: () => fail("Should not be called during encoding"),
			generateId: () => fail("Should not be called during encoding"),
		};

		const encodedChange = codec.json.encode(fieldChange.change, fieldContext);
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

type ChangeAtomMappingQuery = (
	id: ChangeAtomId,
	count: number,
) => RangeQueryResult<ChangeAtomId | undefined>;

type ChangeAtomIdRangeQuery = (id: ChangeAtomId, count: number) => RangeQueryResult<boolean>;
type NodeEncoder = (nodeId: NodeId) => EncodedNodeChangeset;
type NodeDecoder = (encoded: EncodedNodeChangeset, fieldId: NodeLocation) => NodeId;

function encodeNodeChangesForJson(
	change: NodeChangeset,
	id: NodeId,
	fieldToRoots: FieldRootMap,
	context: ChangeEncodingContext,
	encodeNode: NodeEncoder,
	getInputRootId: ChangeAtomMappingQuery,
	isAttachId: ChangeAtomIdRangeQuery,
	isDetachId: ChangeAtomIdRangeQuery,
	getCellIdForMove: ChangeAtomMappingQuery,
	fieldChangesetCodecs: FieldChangesetCodecs,
): EncodedNodeChangeset {
	const encodedChange: EncodedNodeChangeset = {};
	// Note: revert constraints are ignored for now because they would only be needed if we supported reverting changes made by peers.
	const { fieldChanges, nodeExistsConstraint } = change;

	if (fieldChanges !== undefined) {
		encodedChange.fieldChanges = encodeFieldChangesForJson(
			fieldChanges,
			id,
			fieldToRoots,
			context,
			encodeNode,
			getInputRootId,
			isAttachId,
			isDetachId,
			getCellIdForMove,
			fieldChangesetCodecs,
		);
	}

	if (nodeExistsConstraint !== undefined) {
		encodedChange.nodeExistsConstraint = nodeExistsConstraint;
	}

	return encodedChange;
}

function getFieldChangesetCodec(
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

function decodeFieldChangesFromJson(
	encodedChange: EncodedFieldChangeMap,
	parentId: NodeId | undefined,
	decodedCrossFieldKeys: CrossFieldKeyTable,
	decodedRootTable: RootNodeTable,
	context: ChangeEncodingContext,
	decodeNode: NodeDecoder,
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
			rootNodeChanges: newTupleBTree(),
			rootRenames: newChangeAtomIdTransform(),

			encodeNode: () => fail(0xb21 /* Should not encode nodes during field decoding */),
			getInputRootId: () => fail("Should not query during decoding"),
			isAttachId: () => fail("Should not query during decoding"),
			isDetachId: () => fail("Should not query during decoding"),
			getCellIdForMove: () => fail("Should not query during decoding"),

			decodeNode: (encodedNode: EncodedNodeChangeset): NodeId => {
				return decodeNode(encodedNode, { field: fieldId });
			},

			decodeRootNodeChange: (detachId, encodedNode): void => {
				setInChangeAtomIdMap(
					decodedRootTable.nodeChanges,
					detachId,
					decodeNode(encodedNode, { root: detachId }),
				);
				decodedRootTable.detachLocations.set(detachId, 1, fieldId);
			},

			decodeRootRename: (oldId, newId, count): void => {
				addNodeRename(decodedRootTable, oldId, newId, count, fieldId);
			},

			decodeMoveAndDetach: (detachId, count): void => {
				decodedRootTable.outputDetachLocations.set(detachId, count, fieldId);
			},

			generateId: (): ChangeAtomId => ({
				revision: context.revision,
				localId: brand(idAllocator.allocate()),
			}),
		};

		const fieldChangeset = codec.json.decode(field.change, fieldContext);

		const crossFieldKeys = getChangeHandler(fieldKinds, field.fieldKind).getCrossFieldKeys(
			fieldChangeset,
		);

		for (const { key, count } of crossFieldKeys) {
			decodedCrossFieldKeys.set(key, count, fieldId);
		}

		const fieldKey: FieldKey = brand<FieldKey>(field.fieldKey);

		decodedFields.set(fieldKey, {
			fieldKind: field.fieldKind,
			change: brand(fieldChangeset),
		});
	}

	return decodedFields;
}

function decodeNodeChangesetFromJson(
	encodedChange: EncodedNodeChangeset,
	id: NodeId,
	decodedCrossFieldKeys: CrossFieldKeyTable,
	decodedRootTable: RootNodeTable,
	context: ChangeEncodingContext,
	decodeNode: NodeDecoder,
	idAllocator: IdAllocator,
	fieldKinds: FieldKindConfiguration,
	fieldChangesetCodecs: FieldChangesetCodecs,
): NodeChangeset {
	const decodedChange: Mutable<NodeChangeset> = {};
	const { fieldChanges, nodeExistsConstraint } = encodedChange;

	if (fieldChanges !== undefined) {
		decodedChange.fieldChanges = decodeFieldChangesFromJson(
			fieldChanges,
			id,
			decodedCrossFieldKeys,
			decodedRootTable,
			context,
			decodeNode,
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
				fieldKinds,
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

export function encodeChange(
	change: ModularChangeset,
	context: ChangeEncodingContext,
	fieldKinds: FieldKindConfiguration,
	fieldChangesetCodecs: FieldChangesetCodecs,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	chunkCompressionStrategy: TreeCompressionStrategy,
): EncodedModularChangesetV1 {
	const fieldToRoots = getFieldToRoots(change.rootNodes, change.nodeAliases);
	const isAttachId = (id: ChangeAtomId, count: number): RangeQueryResult<boolean> => {
		const attachEntry = getFirstAttachField(change.crossFieldKeys, id, count);
		return { ...attachEntry, value: attachEntry.value !== undefined };
	};

	const isDetachId = (
		id: ChangeAtomId,
		count: number,
	): RangeQueryEntry<ChangeAtomId, boolean> => {
		const detachEntry = getFirstDetachField(change.crossFieldKeys, id, count);
		const renameEntry = change.rootNodes.oldToNewId.getFirst(id, detachEntry.length);
		const isDetach = (detachEntry.value ?? renameEntry.value) !== undefined;
		return { start: id, value: isDetach, length: renameEntry.length };
	};

	const moveIdToCellId = getMoveIdToCellId(change, fieldKinds, fieldToRoots);
	const getCellIdForMove = (
		id: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId | undefined> => moveIdToCellId.getFirst(id, count);

	const getInputRootId = (
		id: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId | undefined> => {
		return change.rootNodes.newToOldId.getFirst(id, count);
	};

	const encodeNode = (nodeId: NodeId): EncodedNodeChangeset => {
		// TODO: Handle node aliasing.
		const node = change.nodeChanges.get([nodeId.revision, nodeId.localId]);
		assert(node !== undefined, 0x92e /* Unknown node ID */);
		return encodeNodeChangesForJson(
			node,
			nodeId,
			fieldToRoots,
			context,
			encodeNode,
			getInputRootId,
			isAttachId,
			isDetachId,
			getCellIdForMove,
			fieldChangesetCodecs,
		);
	};

	// Destroys only exist in rollback changesets, which are never sent.
	assert(change.destroys === undefined, 0x899 /* Unexpected changeset with destroys */);
	const encoded: EncodedModularChangesetV1 = {
		maxId: change.maxId,
		revisions:
			change.revisions === undefined
				? undefined
				: encodeRevisionInfos(change.revisions, context, revisionTagCodec),
		changes: encodeFieldChangesForJson(
			change.fieldChanges,
			undefined,
			fieldToRoots,
			context,
			encodeNode,
			getInputRootId,
			isAttachId,
			isDetachId,
			getCellIdForMove,
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

	return encoded;
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

function getFieldToRoots(
	rootTable: RootNodeTable,
	aliases: ChangeAtomIdBTree<NodeId>,
): FieldRootMap {
	const fieldToRoots: FieldRootMap = newTupleBTree();
	for (const [[revision, localId], nodeId] of rootTable.nodeChanges.entries()) {
		const detachId: ChangeAtomId = { revision, localId };
		const fieldId = rootTable.detachLocations.getFirst(detachId, 1).value;
		if (fieldId === undefined) {
			fail("Untracked root change");
		} else {
			setInChangeAtomIdMap(
				getOrAddInFieldRootMap(fieldToRoots, normalizeFieldId(fieldId, aliases)).nodeChanges,
				detachId,
				nodeId,
			);
		}
	}

	for (const entry of rootTable.oldToNewId.entries()) {
		const fieldId = rootTable.detachLocations.getFirst(entry.start, 1).value;
		if (fieldId === undefined) {
			fail("Untracked root change");
		} else {
			getOrAddInFieldRootMap(fieldToRoots, normalizeFieldId(fieldId, aliases)).renames.set(
				entry.start,
				entry.length,
				entry.value,
			);
		}
	}

	return fieldToRoots;
}

function getOrAddInFieldRootMap(map: FieldRootMap, fieldId: FieldId): FieldRootChanges {
	const key: FieldIdKey = [fieldId.nodeId?.revision, fieldId.nodeId?.localId, fieldId.field];
	const rootChanges = map.get(key);
	if (rootChanges !== undefined) {
		return rootChanges;
	}

	const newRootChanges: FieldRootChanges = {
		nodeChanges: newTupleBTree(),
		renames: newChangeAtomIdTransform(),
	};
	map.set(key, newRootChanges);
	return newRootChanges;
}

export function getMoveIdToCellId(
	change: ModularChangeset,
	fieldKinds: FieldKindConfiguration,
	fieldToRoot: FieldRootMap,
): ChangeAtomIdRangeMap<ChangeAtomId> {
	const map = newChangeAtomIdTransform();
	getMoveIdToCellIdsForFieldChanges(
		change.fieldChanges,
		undefined,
		fieldKinds,
		fieldToRoot,
		map,
	);
	for (const [nodeId, nodeChange] of change.nodeChanges.entries()) {
		if (nodeChange.fieldChanges !== undefined) {
			getMoveIdToCellIdsForFieldChanges(
				nodeChange.fieldChanges,
				{ revision: nodeId[0], localId: nodeId[1] },
				fieldKinds,
				fieldToRoot,
				map,
			);
		}
	}
	return map;
}

function getMoveIdToCellIdsForFieldChanges(
	changes: FieldChangeMap,
	nodeId: NodeId | undefined,
	fieldKinds: FieldKindConfiguration,
	fieldToRoots: FieldRootMap,
	moveIdToCellId: ChangeAtomIdRangeMap<ChangeAtomId>,
): void {
	for (const [fieldKey, field] of changes.entries()) {
		for (const entry of getChangeHandler(fieldKinds, field.fieldKind).getDetachCellIds(
			field.change,
			fieldToRoots.get([nodeId?.revision, nodeId?.localId, fieldKey])?.renames ??
				newChangeAtomIdTransform(),
		)) {
			moveIdToCellId.set(entry.detachId, entry.count, entry.cellId);
		}
	}
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
	const idAllocator = idAllocatorFromMaxId(encodedChange.maxId);
	const nodeChanges: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
	const nodeToParent: ChangeAtomIdBTree<NodeLocation> = newTupleBTree();
	const crossFieldKeys: CrossFieldKeyTable = newCrossFieldRangeTable();
	const rootNodes = newRootTable();

	const decodeNode: NodeDecoder = (
		encodedNode: EncodedNodeChangeset,
		fieldId: NodeLocation,
	): NodeId => {
		const nodeId: NodeId = {
			revision: context.revision,
			localId: brand(idAllocator.allocate()),
		};

		const node = decodeNodeChangesetFromJson(
			encodedNode,
			nodeId,
			crossFieldKeys,
			rootNodes,
			context,
			decodeNode,
			idAllocator,
			fieldKinds,
			fieldChangesetCodecs,
		);

		nodeChanges.set([nodeId.revision, nodeId.localId], node);

		if (fieldId !== undefined) {
			nodeToParent.set([nodeId.revision, nodeId.localId], fieldId);
		}

		return nodeId;
	};

	const decoded: Mutable<ModularChangeset> = {
		rebaseVersion: 1,
		fieldChanges: decodeFieldChangesFromJson(
			encodedChange.changes,
			undefined,
			crossFieldKeys,
			rootNodes,
			context,
			decodeNode,
			idAllocator,
			fieldKinds,
			fieldChangesetCodecs,
		),
		nodeChanges,
		rootNodes,
		nodeToParent,
		nodeAliases: newTupleBTree(),
		crossFieldKeys,
	};

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

	// XXX: This is an expensive assert which should be removed before merging.
	validateChangeset(decoded, fieldKindsFromConfiguration(fieldKinds));
	return decoded;
}

function fieldKindsFromConfiguration(
	configuration: FieldKindConfiguration,
): ReadonlyMap<FieldKindIdentifier, FlexFieldKind> {
	const map = new Map();
	for (const [id, entry] of configuration.entries()) {
		map.set(id, entry.kind);
	}
	return map;
}
