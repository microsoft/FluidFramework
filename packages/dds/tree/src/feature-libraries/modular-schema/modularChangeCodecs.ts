/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { TAnySchema } from "@sinclair/typebox";

import {
	type ICodecFamily,
	ICodecOptions,
	IJsonCodec,
	IMultiFormatCodec,
	SchemaValidationFunction,
	makeCodecFamily,
	withSchemaValidation,
} from "../../codec/index.js";
import {
	ChangeAtomIdMap,
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
	IdAllocator,
	JsonCompatibleReadOnly,
	Mutable,
	brand,
	fail,
	idAllocatorFromMaxId,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../util/index.js";
import {
	FieldBatchCodec,
	TreeChunk,
	chunkFieldSingle,
	defaultChunkPolicy,
} from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import { FieldKindConfiguration, FieldKindConfigurationEntry } from "./fieldKindConfiguration.js";
import { genericFieldKind } from "./genericFieldKind.js";
import {
	EncodedBuilds,
	EncodedBuildsArray,
	EncodedFieldChange,
	EncodedFieldChangeMap,
	EncodedModularChangeset,
	EncodedNodeChangeset,
	EncodedRevisionInfo,
} from "./modularChangeFormat.js";
import {
	FieldChangeMap,
	FieldChangeset,
	ModularChangeset,
	NodeChangeset,
	NodeId,
} from "./modularChangeTypes.js";
import { FieldChangeEncodingContext } from "./fieldChangeHandler.js";

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
		context: ChangeEncodingContext,
		nodeChanges: ChangeAtomIdMap<NodeChangeset>,
	): EncodedFieldChangeMap {
		const fieldContext: FieldChangeEncodingContext = {
			baseContext: context,

			encodeNode: (nodeId: NodeId): EncodedNodeChangeset => {
				const node = tryGetFromNestedMap(nodeChanges, nodeId.revision, nodeId.localId);
				assert(node !== undefined, 0x92e /* Unknown node ID */);
				return encodeNodeChangesForJson(node, fieldContext);
			},

			decodeNode: () => fail("Should not decode nodes during field encoding"),
		};

		return encodeFieldChangesForJsonI(change, fieldContext);
	}

	function encodeFieldChangesForJsonI(
		change: FieldChangeMap,
		context: FieldChangeEncodingContext,
	): EncodedFieldChangeMap {
		const encodedFields: EncodedFieldChangeMap = [];

		for (const [field, fieldChange] of change) {
			const { codec, compiledSchema } = getFieldChangesetCodec(fieldChange.fieldKind);
			const encodedChange = codec.json.encode(fieldChange.change, context);
			if (compiledSchema !== undefined && !compiledSchema.check(encodedChange)) {
				fail("Encoded change didn't pass schema validation.");
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
		context: FieldChangeEncodingContext,
	): EncodedNodeChangeset {
		const encodedChange: EncodedNodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = change;

		if (fieldChanges !== undefined) {
			encodedChange.fieldChanges = encodeFieldChangesForJsonI(fieldChanges, context);
		}

		if (nodeExistsConstraint !== undefined) {
			encodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return encodedChange;
	}

	function decodeFieldChangesFromJson(
		encodedChange: EncodedFieldChangeMap,
		context: ChangeEncodingContext,
		idAllocator: IdAllocator,
	): [FieldChangeMap, ChangeAtomIdMap<NodeChangeset>] {
		const decodedNodes: ChangeAtomIdMap<NodeChangeset> = new Map();
		const fieldContext: FieldChangeEncodingContext = {
			baseContext: context,

			encodeNode: () => fail("Should not encode nodes during field decoding"),

			decodeNode: (encodedNode: EncodedNodeChangeset): NodeId => {
				const node = decodeNodeChangesetFromJson(encodedNode, fieldContext);
				const nodeId: NodeId = {
					revision: context.revision,
					localId: brand(idAllocator.allocate()),
				};
				setInNestedMap(decodedNodes, nodeId.revision, nodeId.localId, node);
				return nodeId;
			},
		};

		const decodedFields = decodeFieldChangesFromJsonI(encodedChange, fieldContext);
		return [decodedFields, decodedNodes];
	}

	function decodeFieldChangesFromJsonI(
		encodedChange: EncodedFieldChangeMap,
		context: FieldChangeEncodingContext,
	): FieldChangeMap {
		const decodedFields: FieldChangeMap = new Map();
		for (const field of encodedChange) {
			const { codec, compiledSchema } = getFieldChangesetCodec(field.fieldKind);
			if (compiledSchema !== undefined && !compiledSchema.check(field.change)) {
				fail("Encoded change didn't pass schema validation.");
			}
			const fieldChangeset = codec.json.decode(field.change, context);

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
		context: FieldChangeEncodingContext,
	): NodeChangeset {
		const decodedChange: NodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = encodedChange;

		if (fieldChanges !== undefined) {
			decodedChange.fieldChanges = decodeFieldChangesFromJsonI(fieldChanges, context);
		}

		if (nodeExistsConstraint !== undefined) {
			decodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return decodedChange;
	}

	function encodeDetachedNodes(
		detachedNodes: ChangeAtomIdMap<TreeChunk> | undefined,
		context: ChangeEncodingContext,
	): EncodedBuilds | undefined {
		if (detachedNodes === undefined) {
			return undefined;
		}

		const treesToEncode: ITreeCursorSynchronous[] = [];
		const buildsArray: EncodedBuildsArray = Array.from(detachedNodes.entries()).map(
			([r, commitBuilds]) => {
				const commitBuildsEncoded: [ChangesetLocalId, number][] = Array.from(
					commitBuilds.entries(),
				).map(([i, t]) => {
					treesToEncode.push(t.cursor());
					const treeIndexInBatch = treesToEncode.length - 1;
					return [i, treeIndexInBatch];
				});
				// `undefined` does not round-trip through JSON strings, so it needs special handling.
				// Most entries will have an undefined revision due to the revision information being inherited from the `ModularChangeset`.
				// We therefore optimize for the common case by omitting the revision when it is undefined.
				return r === undefined || r === context.revision
					? [commitBuildsEncoded]
					: [commitBuildsEncoded, revisionTagCodec.encode(r, context)];
			},
		);
		return buildsArray.length === 0
			? undefined
			: {
					builds: buildsArray,
					trees: fieldsCodec.encode(treesToEncode, {
						encodeType: chunkCompressionStrategy,
						schema: context.schema,
					}),
			  };
	}

	function decodeDetachedNodes(
		encoded: EncodedBuilds | undefined,
		context: ChangeEncodingContext,
	): ChangeAtomIdMap<TreeChunk> | undefined {
		if (encoded === undefined || encoded.builds.length === 0) {
			return undefined;
		}

		const chunks = fieldsCodec.decode(encoded.trees, {
			encodeType: chunkCompressionStrategy,
		});
		const getChunk = (index: number): TreeChunk => {
			assert(index < chunks.length, 0x898 /* out of bounds index for build chunk */);
			return chunkFieldSingle(chunks[index], defaultChunkPolicy);
		};

		const map: ModularChangeset["builds"] = new Map();
		encoded.builds.forEach((build) => {
			// EncodedRevisionTag cannot be an array so this ensures that we can isolate the tuple
			const revision =
				build[1] === undefined
					? context.revision
					: revisionTagCodec.decode(build[1], context);
			map.set(revision, new Map(build[0].map(([i, n]) => [i, getChunk(n)])));
		});

		return map;
	}

	function encodeRevisionInfos(
		revisions: readonly RevisionInfo[],
		context: ChangeEncodingContext,
	): EncodedRevisionInfo[] | undefined {
		if (context.revision !== undefined) {
			assert(
				revisions.length === 1 &&
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
			// Destroys only exist in rollback changesets, which are never sent.
			assert(change.destroys === undefined, 0x899 /* Unexpected changeset with destroys */);
			return {
				maxId: change.maxId,
				revisions:
					change.revisions === undefined
						? undefined
						: encodeRevisionInfos(change.revisions, context),
				changes: encodeFieldChangesForJson(
					change.fieldChanges,
					context,
					change.nodeChanges,
				),
				builds: encodeDetachedNodes(change.builds, context),
				refreshers: encodeDetachedNodes(change.refreshers, context),
			};
		},

		decode: (encodedChange: EncodedModularChangeset, context) => {
			const [fieldChanges, nodeChanges] = decodeFieldChangesFromJson(
				encodedChange.changes,
				context,
				idAllocatorFromMaxId(encodedChange.maxId),
			);
			const decoded: Mutable<ModularChangeset> = {
				fieldChanges,
				nodeChanges,
			};

			if (encodedChange.builds !== undefined) {
				decoded.builds = decodeDetachedNodes(encodedChange.builds, context);
			}
			if (encodedChange.refreshers !== undefined) {
				decoded.refreshers = decodeDetachedNodes(encodedChange.builds, context);
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
