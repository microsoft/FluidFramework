/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import type { TAnySchema } from "@sinclair/typebox";

import {
	withSchemaValidation,
	type ICodecOptions,
	type IJsonCodec,
	type JsonCodecPart,
	type SchemaValidationFunction,
} from "../../codec/index.js";
import {
	newChangeAtomIdTransform,
	type ChangeAtomId,
	type ChangeAtomIdRangeMap,
	type ChangeEncodingContext,
	type FieldKey,
	type FieldKindIdentifier,
	type RevisionTag,
	type RevisionTagSchema,
} from "../../core/index.js";
import {
	brand,
	idAllocatorFromMaxId,
	type IdAllocator,
	type JsonCompatibleReadOnly,
	type Mutable,
} from "../../util/index.js";
import {
	newChangeAtomIdBTree,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import type { FieldBatchCodec } from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldChangeEncodingContext, FieldChangeHandler } from "./fieldChangeHandler.js";
import type { FieldKindConfiguration } from "./fieldKindConfiguration.js";
import { genericFieldKind } from "./genericFieldKind.js";
import {
	decodeDetachedNodes,
	decodeRevisionInfos,
	encodeDetachedNodes,
	encodeRevisionInfos,
	getFieldChangesetCodecs,
	makeFieldEncodingContextFactory,
} from "./modularChangeCodecV1.js";
import { addNodeRename, newRootTable } from "./modularChangeFamily.js";
import type {
	EncodedFieldChange,
	EncodedFieldChangeMap,
	EncodedNodeChangeset,
} from "./modularChangeFormatV1.js";
import {
	EncodedModularChangesetV3,
	type EncodedRenames,
	type EncodedRootNodes,
} from "./modularChangeFormatV3.js";
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
	EncodedModularChangesetV3,
	EncodedModularChangesetV3,
	ChangeEncodingContext
>;

type FieldCodec = IJsonCodec<
	FieldChangeset,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	FieldChangeEncodingContext
>;

export function makeModularChangeCodecV3(
	fieldKinds: FieldKindConfiguration,
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
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
		contextFactory: (fieldId: FieldId) => FieldChangeEncodingContext,
	): EncodedFieldChangeMap {
		const encodedFields: EncodedFieldChangeMap = [];

		for (const [field, fieldChange] of change) {
			const { codec, compiledSchema } = getFieldChangesetCodec(fieldChange.fieldKind);
			const encodedChange = codec.encode(
				fieldChange.change,
				contextFactory({ nodeId: parentId, field }),
			);

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
		contextFactory: (fieldId: FieldId) => FieldChangeEncodingContext,
	): EncodedNodeChangeset {
		const encodedChange: EncodedNodeChangeset = {};
		// Note: revert constraints are ignored for now because they would only be needed if we supported reverting changes made by peers.
		const { fieldChanges, nodeExistsConstraint } = change;

		if (fieldChanges !== undefined) {
			encodedChange.fieldChanges = encodeFieldChangesForJson(fieldChanges, id, contextFactory);
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
				rootNodeChanges: newChangeAtomIdBTree(),
				rootRenames: newChangeAtomIdTransform(),

				encodeNode: () => fail(0xb21 /* Should not encode nodes during field decoding */),
				getInputRootId: () => fail("Should not query during decoding"),
				getOutputRootId: () => fail("Should not query during decoding"),
				getFirstRenameId: () => fail("Should not query during decoding"),
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

			const fieldChangeset = codec.decode(field.change, fieldContext);

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

	type NodeEncoder = (nodeId: NodeId) => EncodedNodeChangeset;
	type NodeDecoder = (encoded: EncodedNodeChangeset, fieldId: NodeLocation) => NodeId;

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
			const encodeNode = (nodeId: NodeId): EncodedNodeChangeset => {
				// TODO: Handle node aliasing.
				const node = change.nodeChanges.get([nodeId.revision, nodeId.localId]);
				assert(node !== undefined, 0x92e /* Unknown node ID */);
				return encodeNodeChangesForJson(node, nodeId, contextFactory);
			};

			const contextFactory = makeFieldEncodingContextFactory(change, context, encodeNode);

			// Destroys only exist in rollback changesets, which are never sent.
			assert(change.destroys === undefined, 0x899 /* Unexpected changeset with destroys */);
			const encoded: EncodedModularChangesetV3 = {
				maxId: change.maxId,
				revisions:
					change.revisions === undefined
						? undefined
						: encodeRevisionInfos(change.revisions, context, revisionTagCodec),
				fieldChanges: encodeFieldChangesForJson(
					change.fieldChanges,
					undefined,
					contextFactory,
				),
				rootNodes: encodeRootNodesForJson(change.rootNodes.nodeChanges, context, encodeNode),
				nodeRenames: encodeRenamesForJson(change.rootNodes.oldToNewId, context),
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

			if (change.noChangeConstraint !== undefined) {
				encoded.noChangeConstraint = change.noChangeConstraint;
			}

			return encoded;
		},

		decode: (encodedChange: EncodedModularChangesetV3, context) => {
			const idAllocator = idAllocatorFromMaxId(encodedChange.maxId);
			const nodeChanges: ChangeAtomIdBTree<NodeChangeset> = newChangeAtomIdBTree();
			const nodeToParent: ChangeAtomIdBTree<NodeLocation> = newChangeAtomIdBTree();
			const crossFieldKeys: CrossFieldKeyTable = newCrossFieldRangeTable();

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
				nodeAliases: newChangeAtomIdBTree(),
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
		EncodedModularChangesetV3,
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
