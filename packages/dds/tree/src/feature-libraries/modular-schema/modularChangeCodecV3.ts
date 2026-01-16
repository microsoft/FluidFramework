/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, oob } from "@fluidframework/core-utils/internal";
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
import {
	chunkFieldSingle,
	defaultChunkPolicy,
	type FieldBatchCodec,
	type TreeChunk,
} from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";
import type {
	FieldKindConfiguration,
	FieldKindConfigurationEntry,
} from "./fieldKindConfiguration.js";
import {
	addNodeRename,
	getFirstAttachField,
	getFirstDetachField,
	newRootTable,
	type FieldIdKey,
} from "./modularChangeFamily.js";
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
import type {
	EncodedBuilds,
	EncodedBuildsArray,
	EncodedFieldChange,
	EncodedFieldChangeMap,
	EncodedNodeChangeset,
	EncodedRevisionInfo,
} from "./modularChangeFormatV1.js";
import type { FieldChangeEncodingContext, FieldChangeHandler } from "./fieldChangeHandler.js";
import { genericFieldKind } from "./genericFieldKind.js";
import type { TAnySchema } from "@sinclair/typebox";
import {
	EncodedModularChangeset,
	type EncodedRenames,
	type EncodedRootNodes,
} from "./modularChangeFormatV3.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import { setInChangeAtomIdMap, type ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import { getFieldChangesetCodecs } from "./modularChangeCodecV1.js";

type ModularChangeCodec = IJsonCodec<
	ModularChangeset,
	EncodedModularChangeset,
	EncodedModularChangeset,
	ChangeEncodingContext
>;

type FieldCodec = IMultiFormatCodec<
	FieldChangeset,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	FieldChangeEncodingContext
>;

export function makeModularChangeCodecV3(
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

	const getFieldChangesetCodec = (
		fieldKind: FieldKindIdentifier,
	): {
		compiledSchema?: SchemaValidationFunction<TAnySchema>;
		codec: FieldCodec;
	} => {
		const entry = fieldChangesetCodecs.get(fieldKind);
		assert(entry !== undefined, "Tried to encode unsupported fieldKind");
		return entry;
	};

	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);

	function encodeFieldChangesForJson(
		change: FieldChangeMap,
		parentId: NodeId | undefined,
		fieldToRoots: FieldRootMap,
		context: ChangeEncodingContext,
		encodeNode: NodeEncoder,
		getInputDetachId: ChangeAtomMappingQuery,
		isAttachId: ChangeAtomIdRangeQuery,
		isDetachId: ChangeAtomIdRangeQuery,
	): EncodedFieldChangeMap {
		const encodedFields: EncodedFieldChangeMap = [];

		for (const [field, fieldChange] of change) {
			const { codec, compiledSchema } = getFieldChangesetCodec(fieldChange.fieldKind);
			const rootChanges = fieldToRoots.get([parentId?.revision, parentId?.localId, field]);

			const fieldContext: FieldChangeEncodingContext = {
				baseContext: context,
				rootNodeChanges: rootChanges?.nodeChanges ?? newTupleBTree(),
				rootRenames: rootChanges?.renames ?? newChangeAtomIdTransform(),

				encodeNode,
				getInputRootId: getInputDetachId,
				isAttachId,
				isDetachId,
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

	function encodeNodeChangesForJson(
		change: NodeChangeset,
		id: NodeId,
		fieldToRoots: FieldRootMap,
		context: ChangeEncodingContext,
		encodeNode: NodeEncoder,
		getInputDetachId: ChangeAtomMappingQuery,
		isAttachId: ChangeAtomIdRangeQuery,
		isDetachId: ChangeAtomIdRangeQuery,
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
				getInputDetachId,
				isAttachId,
				isDetachId,
			);
		}

		if (nodeExistsConstraint !== undefined) {
			encodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return encodedChange;
	}

	function encodeRootNodesForJson(
		roots: ChangeAtomIdBTree<NodeId>,
		context: ChangeEncodingContext,
		encodeNode: NodeEncoder,
	): EncodedRootNodes {
		const encoded: EncodedRootNodes = [];
		for (const [[revision, localId], nodeId] of roots.entries()) {
			encoded.push({
				detachId: changeAtomIdCodec.encode({ revision, localId }, context),
				nodeChangeset: encodeNode(nodeId),
			});
		}

		return encoded;
	}

	function encodeRenamesForJson(
		renames: ChangeAtomIdRangeMap<ChangeAtomId>,
		context: ChangeEncodingContext,
	): EncodedRenames {
		const encoded: EncodedRenames = [];
		for (const entry of renames.entries()) {
			encoded.push({
				oldId: changeAtomIdCodec.encode(entry.start, context),
				newId: changeAtomIdCodec.encode(entry.value, context),
				count: entry.length,
			});
		}

		return encoded;
	}

	function decodeFieldChangesFromJson(
		encodedChange: EncodedFieldChangeMap,
		parentId: NodeId | undefined,
		decodedCrossFieldKeys: CrossFieldKeyTable,
		context: ChangeEncodingContext,
		decodeNode: NodeDecoder,
		idAllocator: IdAllocator,
	): FieldChangeMap {
		const decodedFields: FieldChangeMap = new Map();
		for (const field of encodedChange) {
			const { codec, compiledSchema } = getFieldChangesetCodec(field.fieldKind);
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

				decodeNode: (encodedNode: EncodedNodeChangeset): NodeId =>
					decodeNode(encodedNode, { field: fieldId }),

				decodeRootNodeChange: (detachId, encodedNode): void => {},
				decodeRootRename: (oldId, newId, count): void => {},
				decodeMoveAndDetach: (detachId, count): void => {},

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
	): NodeChangeset {
		const decodedChange: Mutable<NodeChangeset> = {};
		const { fieldChanges, nodeExistsConstraint } = encodedChange;

		if (fieldChanges !== undefined) {
			decodedChange.fieldChanges = decodeFieldChangesFromJson(
				fieldChanges,
				id,
				decodedCrossFieldKeys,
				context,
				decodeNode,
				idAllocator,
			);
		}

		if (nodeExistsConstraint !== undefined) {
			decodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return decodedChange;
	}

	function encodeDetachedNodes(
		detachedNodes: ChangeAtomIdBTree<TreeChunk> | undefined,
		context: ChangeEncodingContext,
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

				buildsForRevision = encodedRevision !== undefined ? [[], encodedRevision] : [[]];
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

	function decodeDetachedNodes(
		encoded: EncodedBuilds | undefined,
		context: ChangeEncodingContext,
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

	type ChangeAtomMappingQuery = (
		id: ChangeAtomId,
		count: number,
	) => RangeQueryResult<ChangeAtomId | undefined>;

	type ChangeAtomIdRangeQuery = (id: ChangeAtomId, count: number) => RangeQueryResult<boolean>;
	type NodeEncoder = (nodeId: NodeId) => EncodedNodeChangeset;
	type NodeDecoder = (encoded: EncodedNodeChangeset, fieldId: NodeLocation) => NodeId;

	function encodeRevisionInfos(
		revisions: readonly RevisionInfo[],
		context: ChangeEncodingContext,
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

	function decodeRevisionInfos(
		revisions: readonly EncodedRevisionInfo[] | undefined,
		context: ChangeEncodingContext,
	): RevisionInfo[] | undefined {
		if (revisions === undefined) {
			return context.revision !== undefined ? [{ revision: context.revision }] : undefined;
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

	function decodeRootTable(
		encodedRoots: EncodedRootNodes | undefined,
		encodedRenames: EncodedRenames | undefined,
		context: ChangeEncodingContext,
		decodeNode: NodeDecoder,
	): RootNodeTable {
		const roots = newRootTable();
		if (encodedRoots !== undefined) {
			for (const { detachId, nodeChangeset } of encodedRoots) {
				const decodedId = changeAtomIdCodec.decode(detachId, context);
				setInChangeAtomIdMap(
					roots.nodeChanges,
					decodedId,
					decodeNode(nodeChangeset, { root: decodedId }),
				);
			}
		}

		if (encodedRenames !== undefined) {
			for (const { oldId, newId, count } of encodedRenames) {
				addNodeRename(
					roots,
					changeAtomIdCodec.decode(oldId, context),
					changeAtomIdCodec.decode(newId, context),
					count,
					undefined,
				);
			}
		}

		return roots;
	}

	const modularChangeCodec: ModularChangeCodec = {
		encode: (change, context) => {
			const fieldToRoots = getFieldToRoots(change.rootNodes);
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

			const getInputDetachId = (
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
					getInputDetachId,
					isAttachId,
					isDetachId,
				);
			};

			// Destroys only exist in rollback changesets, which are never sent.
			assert(change.destroys === undefined, 0x899 /* Unexpected changeset with destroys */);
			const encoded: EncodedModularChangeset = {
				maxId: change.maxId,
				revisions:
					change.revisions === undefined
						? undefined
						: encodeRevisionInfos(change.revisions, context),
				fieldChanges: encodeFieldChangesForJson(
					change.fieldChanges,
					undefined,
					fieldToRoots,
					context,
					encodeNode,
					getInputDetachId,
					isAttachId,
					isDetachId,
				),
				rootNodes: encodeRootNodesForJson(change.rootNodes.nodeChanges, context, encodeNode),
				nodeRenames: encodeRenamesForJson(change.rootNodes.oldToNewId, context),
				builds: encodeDetachedNodes(change.builds, context),
				refreshers: encodeDetachedNodes(change.refreshers, context),
				violations: change.constraintViolationCount,
			};

			return encoded;
		},

		decode: (encodedChange: EncodedModularChangeset, context) => {
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
				);

				nodeChanges.set([nodeId.revision, nodeId.localId], node);

				if (fieldId !== undefined) {
					nodeToParent.set([nodeId.revision, nodeId.localId], fieldId);
				}

				return nodeId;
			};

			const decoded: Mutable<ModularChangeset> = {
				rebaseVersion: 2,
				fieldChanges: decodeFieldChangesFromJson(
					encodedChange.fieldChanges,
					undefined,
					crossFieldKeys,
					context,
					decodeNode,
					idAllocator,
				),
				nodeChanges,
				rootNodes: decodeRootTable(
					encodedChange.rootNodes,
					encodedChange.nodeRenames,
					context,
					decodeNode,
				),
				nodeToParent,
				nodeAliases: newTupleBTree(),
				crossFieldKeys,
			};

			if (encodedChange.builds !== undefined) {
				decoded.builds = decodeDetachedNodes(encodedChange.builds, context);
			}
			if (encodedChange.refreshers !== undefined) {
				decoded.refreshers = decodeDetachedNodes(encodedChange.refreshers, context);
			}

			if (encodedChange.violations !== undefined) {
				decoded.constraintViolationCount = encodedChange.violations;
			}

			const decodedRevInfos = decodeRevisionInfos(encodedChange.revisions, context);
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
		EncodedModularChangeset,
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

function getFieldToRoots(rootTable: RootNodeTable): FieldRootMap {
	const fieldToRoots: FieldRootMap = newTupleBTree();
	for (const [[revision, localId], nodeId] of rootTable.nodeChanges.entries()) {
		const detachId: ChangeAtomId = { revision, localId };
		const fieldId = rootTable.detachLocations.getFirst(detachId, 1).value;
		if (fieldId !== undefined) {
			setInChangeAtomIdMap(
				getOrAddInFieldRootMap(fieldToRoots, fieldId).nodeChanges,
				detachId,
				nodeId,
			);
		}
	}

	for (const entry of rootTable.oldToNewId.entries()) {
		const fieldId = rootTable.detachLocations.getFirst(entry.start, 1).value;
		if (fieldId !== undefined) {
			getOrAddInFieldRootMap(fieldToRoots, fieldId).renames.set(
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

type FieldRootMap = TupleBTree<FieldIdKey, FieldRootChanges>;

interface FieldRootChanges {
	readonly nodeChanges: ChangeAtomIdBTree<NodeId>;
	readonly renames: ChangeAtomIdRangeMap<ChangeAtomId>;
}
