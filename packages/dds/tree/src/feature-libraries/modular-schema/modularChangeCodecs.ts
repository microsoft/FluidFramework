/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob, fail } from "@fluidframework/core-utils/internal";
import type { TAnySchema } from "@sinclair/typebox";

import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	type IMultiFormatCodec,
	type SchemaValidationFunction,
	makeCodecFamily,
	withSchemaValidation,
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
	type JsonCompatibleReadOnly,
	type Mutable,
	type RangeQueryEntry,
	type TupleBTree,
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
	EncodedModularChangeset,
	type EncodedNodeChangeset,
	type EncodedRevisionInfo,
} from "./modularChangeFormat.js";
import {
	newCrossFieldRangeTable,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
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
import type { FieldChangeEncodingContext, FieldChangeHandler } from "./fieldChangeHandler.js";
import {
	addNodeRename,
	getFirstAttachField,
	getFirstDetachField,
	newRootTable,
	type FieldIdKey,
} from "./modularChangeFamily.js";

export function makeModularChangeCodecFamily(
	fieldKindConfigurations: ReadonlyMap<number, FieldKindConfiguration>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	{ jsonValidator: validator }: ICodecOptions,
	chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Compressed,
): ICodecFamily<ModularChangeset, ChangeEncodingContext> {
	return makeCodecFamily(
		Array.from(fieldKindConfigurations.entries(), ([version, fieldKinds]) => [
			version,
			makeModularChangeCodec(
				fieldKinds,
				revisionTagCodec,
				fieldsCodec,
				{ jsonValidator: validator },
				chunkCompressionStrategy,
			),
		]),
	);
}

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

function makeModularChangeCodec(
	fieldKinds: FieldKindConfiguration,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	{ jsonValidator: validator }: ICodecOptions,
	chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Compressed,
): ModularChangeCodec {
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	const getMapEntry = ({ kind, formatVersion }: FieldKindConfigurationEntry) => {
		const codec = kind.changeHandler.codecsFactory(revisionTagCodec).resolve(formatVersion);
		return {
			codec,
			compiledSchema: codec.json.encodedSchema
				? validator.compile(codec.json.encodedSchema)
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

	const getFieldChangesetCodec = (
		fieldKind: FieldKindIdentifier,
	): {
		compiledSchema?: SchemaValidationFunction<TAnySchema>;
		codec: FieldCodec;
	} => {
		const entry = fieldChangesetCodecs.get(fieldKind);
		assert(entry !== undefined, 0x5ea /* Tried to encode unsupported fieldKind */);
		return entry;
	};

	function encodeFieldChangesForJson(
		change: FieldChangeMap,
		parentId: NodeId | undefined,
		fieldToRoots: FieldRootMap,
		context: ChangeEncodingContext,
		encodeNode: NodeEncoder,
		isMoveId: ChangeAtomIdRangeQuery,
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
				isMoveId,
				isDetachId,
				decodeNode: () => fail(0xb1e /* Should not decode nodes during field encoding */),
				decodeRootNodeChange: () => fail("Should not be called during encoding"),
				decodeRootRename: () => fail("Should not be called during encoding"),
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
		isMoveId: ChangeAtomIdRangeQuery,
		isDetachId: ChangeAtomIdRangeQuery,
	): EncodedNodeChangeset {
		const encodedChange: EncodedNodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = change;

		if (fieldChanges !== undefined) {
			encodedChange.fieldChanges = encodeFieldChangesForJson(
				fieldChanges,
				id,
				fieldToRoots,
				context,
				encodeNode,
				isMoveId,
				isDetachId,
			);
		}

		if (nodeExistsConstraint !== undefined) {
			encodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return encodedChange;
	}

	function decodeFieldChangesFromJson(
		encodedChange: EncodedFieldChangeMap,
		parentId: NodeId | undefined,
		decodedCrossFieldKeys: CrossFieldKeyTable,
		decodedRootTable: RootNodeTable,
		context: ChangeEncodingContext,
		decodeNode: NodeDecoder,
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
				isMoveId: () => fail("Should not query move IDs during decoding"),
				isDetachId: () => fail("Should not query move IDs during decoding"),
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
	): NodeChangeset {
		const decodedChange: NodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = encodedChange;

		if (fieldChanges !== undefined) {
			decodedChange.fieldChanges = decodeFieldChangesFromJson(
				fieldChanges,
				id,
				decodedCrossFieldKeys,
				decodedRootTable,
				context,
				decodeNode,
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

	type ChangeAtomIdRangeQuery = (
		id: ChangeAtomId,
		count: number,
	) => RangeQueryEntry<ChangeAtomId, boolean>;
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

	const modularChangeCodec: ModularChangeCodec = {
		encode: (change, context) => {
			const fieldToRoots = getFieldToRoots(change.rootNodes);
			const isMoveId = (
				id: ChangeAtomId,
				count: number,
			): RangeQueryEntry<ChangeAtomId, boolean> => {
				const detachEntry = getFirstDetachField(change.crossFieldKeys, id, count);
				const attachEntry = getFirstAttachField(change.crossFieldKeys, id, detachEntry.length);
				const isMove = detachEntry.value !== undefined && attachEntry.value !== undefined;
				return { start: id, value: isMove, length: attachEntry.length };
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
					isMoveId,
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
				changes: encodeFieldChangesForJson(
					change.fieldChanges,
					undefined,
					fieldToRoots,
					context,
					encodeNode,
					isMoveId,
					isDetachId,
				),
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
				);

				nodeChanges.set([nodeId.revision, nodeId.localId], node);

				if (fieldId !== undefined) {
					nodeToParent.set([nodeId.revision, nodeId.localId], fieldId);
				}

				return nodeId;
			};

			const decoded: Mutable<ModularChangeset> = {
				fieldChanges: decodeFieldChangesFromJson(
					encodedChange.changes,
					undefined,
					crossFieldKeys,
					rootNodes,
					context,
					decodeNode,
				),
				nodeChanges,
				rootNodes,
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

	return withSchemaValidation(EncodedModularChangeset, modularChangeCodec, validator);
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
		} else {
			fail("Untracked root change");
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
		} else {
			fail("Untracked root change");
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
