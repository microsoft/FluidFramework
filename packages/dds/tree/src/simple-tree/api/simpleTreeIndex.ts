/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	AnchorNode,
	FieldKey,
	ITreeSubscriptionCursor,
	TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import { Multiplicity } from "../../core/index.js";
import {
	AnchorTreeIndex,
	isTreeValue,
	type TreeIndexNodes,
	hasElement,
	type TreeIndex,
	type KeyFinder,
	KeyFinderDependencyScope,
} from "../../feature-libraries/index.js";
import type { SchematizingSimpleTreeView } from "../../shared-tree/index.js";
import { brand } from "../../util/index.js";
import {
	treeNodeFromAnchor,
	NodeKind,
	type TreeNode,
	type TreeNodeSchema,
	type NodeFromSchema,
	type TreeLeafValue,
} from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import { ObjectNodeSchema } from "../node-kinds/index.js";
import { convertFieldKind } from "../toStoredSchema.js";
import { walkFieldSchema } from "../walkFieldSchema.js";

import type { TreeView } from "./tree.js";
import { treeNodeApi } from "./treeNodeApi.js";

/**
 * Value that may be used as keys in a {@link TreeIndex}.
 * @remarks
 * This supports values which have value semantics and are compared by value, just like {@link TreeLeafValue}.
 * This allows using any tree value as a key (for example in an index tracking where those values occur in the tree).
 * The `isKeyValid` parameter of {@link (createTreeIndex:1)} narrows this union to the key type exposed by the index.
 * @beta
 */
export type TreeIndexKey = TreeLeafValue;

/**
 * Selects the field containing the index key for nodes of a given schema.
 *
 * @remarks
 * A selector is logically a pure function. For convenience, an object with a `get` method, such as a
 * `ReadonlyMap`, is also accepted. Return the object property key, not the stored key.
 * Return `undefined` for non-object schemas and schemas that should not be indexed.
 * The selected field must always contain exactly one leaf value directly on the indexed node.
 * The index is invalidated when that field changes.
 * Keys derived from descendants are not supported: Simple Tree indexes use node-level invalidation and therefore do not
 * re-index ancestors when a descendant changes.
 *
 * @typeParam TSchema - The node schema types accepted by the key field selector.
 *
 * @beta
 */
export type TreeIndexKeyFieldSelector<TSchema extends TreeNodeSchema = TreeNodeSchema> =
	| ((schema: TSchema) => string | undefined)
	| { get(schema: TSchema): string | undefined };

/**
 * Creates a {@link TreeIndex}, selecting the key field for each schema in the view.
 *
 * @remarks
 * This overload discovers the schemas to consider by walking the view's schema.
 * When multiple nodes have the same key, they are passed together to `getValue`.
 * For every selected schema, the selected property must be a required field that only allows leaf values.
 * Invalid properties and values rejected by `isKeyValid` cause a `UsageError`.
 * Use {@link (createTreeIndex:2)} to narrow the indexed schema and the node types passed to `getValue`.
 * To index identifier fields, use {@link createIdentifierIndex}.
 *
 * @param view - The view for the tree being indexed.
 * @param keyFieldSelector - Selects the object property key whose value is the index key for nodes of each schema.
 * @param getValue - Converts the non-empty array of nodes associated with a key into the value returned for that key.
 * @param isKeyValid - Validates and narrows values read from key fields to `TKey`. An invalid value causes an error.
 *
 * @example Index all nodes by a `name` field.
 * ```typescript
 * const byName = createTreeIndex(
 * 	view,
 * 	(schema) =>
 * 		schema instanceof ObjectNodeSchema && schema.fields.has("name") ? "name" : undefined,
 * 	(nodes) => nodes,
 * 	(key): key is TreeIndexKey => true,
 * );
 * const namedAlex = byName.get("Alex");
 * ```
 *
 * @example Index `Person` nodes by their string-valued `name` field.
 * ```typescript
 * const peopleByName = createTreeIndex(
 * 	view,
 * 	(schema) => (schema === Person ? "name" : undefined),
 * 	(nodes) => nodes,
 * 	(key): key is string => typeof key === "string",
 * );
 * const peopleNamedAlex = peopleByName.get("Alex");
 * ```
 *
 * @example Use schema metadata so any schema can opt into an index.
 * ```typescript
 * // A set of numeric categories we can index over.
 * enum Category {
 * 	News,
 * 	Sports,
 * }
 *
 * // A way for metadata to indicate what field, if any, their category is stored in.
 * interface MetadataWithCategoryField {
 * 	categoryField?: string;
 * }
 *
 * // Example schema opting into the index for different fields.
 * class Article extends schemaFactoryBeta.object(
 * 	"Article",
 * 	{ category: SchemaFactory.number },
 * 	{
 * 		metadata: {
 * 			custom: { categoryField: "category" } satisfies MetadataWithCategoryField,
 * 		},
 * 	},
 * ) {}
 * class Video extends schemaFactoryBeta.object(
 * 	"Video",
 * 	{ genre: SchemaFactory.number },
 * 	{ metadata: { custom: { categoryField: "genre" } satisfies MetadataWithCategoryField } },
 * ) {}
 *
 * // ... Create a TreeView named `view` containing nodes such as
 * // `new Video({ genre: Category.News })`.
 * const contentByCategory = createTreeIndex(
 * 	view,
 * 	(schema) =>
 * 		(schema.metadata.custom as MetadataWithCategoryField | undefined)?.categoryField,
 * 	(nodes) => nodes,
 * 	(key): key is Category => typeof key === "number",
 * );
 * const sportsContent = contentByCategory.get(Category.Sports);
 * ```
 *
 * @privateRemarks
 * TODO:
 * This API is rather awkward and may want to be adjusted.
 * We should probably do one of:
 * - Restrict `keyFieldSelector` to only ObjectNodeSchema.
 * - Support `keyFieldSelector` returning optional fields, and values other than undefined for non-object schemas.
 * @beta
 */
export function createTreeIndex<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
>(
	view: TreeView<TFieldSchema>,
	keyFieldSelector: TreeIndexKeyFieldSelector,
	getValue: (nodes: TreeIndexNodes<TreeNode>) => TValue,
	isKeyValid: (key: TreeIndexKey) => key is TKey,
): TreeIndex<TKey, TValue>;

/**
 * Creates a {@link TreeIndex}, selecting the key field for an explicit set of schemas.
 *
 * @remarks
 * Supplying `indexableSchema` avoids schema discovery and narrows the nodes passed to `getValue` to
 * {@link NodeFromSchema} of the supplied schema types. Schemas omitted from `indexableSchema` are not indexed.
 * When multiple nodes have the same key, they are passed together to `getValue`.
 * For every selected schema, the selected property must be a required field that only allows leaf values.
 * Invalid properties and values rejected by `isKeyValid` cause a `UsageError`.
 *
 * @param view - The view for the tree being indexed.
 * @param keyFieldSelector - Selects the object property key whose value is the index key for nodes of each supplied schema.
 * @param getValue - Converts the non-empty array of nodes associated with a key into the value returned for that key.
 * @param isKeyValid - Validates and narrows values read from key fields to `TKey`. An invalid value causes an error.
 * @param indexableSchema - All schema types that the index should consider.
 *
 * @example Index only `Person` nodes by their string-valued `name` field.
 * ```typescript
 * const peopleByName = createTreeIndex(
 * 	view,
 * 	() => "name",
 * 	(nodes) => nodes,
 * 	(key): key is string => typeof key === "string",
 * 	[Person],
 * );
 * const peopleNamedAlex = peopleByName.get("Alex");
 * ```
 *
 * @beta
 */
export function createTreeIndex<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
	TSchema extends TreeNodeSchema,
>(
	view: TreeView<TFieldSchema>,
	keyFieldSelector: TreeIndexKeyFieldSelector<TSchema>,
	getValue: (nodes: TreeIndexNodes<NodeFromSchema<TSchema>>) => TValue,
	isKeyValid: (key: TreeIndexKey) => key is TKey,
	indexableSchema: readonly TSchema[],
): TreeIndex<TKey, TValue>;

/**
 * Creates a {@link TreeIndex} with a specified key field selector.
 *
 * @privateRemarks
 * TODO:
 * This (and thus its exposed overloads) are limited to making indexes where the keys are leaves of the tree nodes in specific fields which are a function of the schema.
 * A more generalized design could provide an option where the user gets to provide a custom key extraction function.
 * We could run that function with observation tracking to handle invalidation.
 * This would enable more use-cases, like tracking nodes by type, parent of specific nodes,
 * or derived properties like all nodes with at least one comment on them keyed by the comment's author.
 * @beta
 */
export function createTreeIndex<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
>(
	view: TreeView<TFieldSchema>,
	keyFieldSelector: TreeIndexKeyFieldSelector,
	getValue:
		| ((nodes: TreeIndexNodes<TreeNode>) => TValue)
		| ((nodes: TreeIndexNodes<NodeFromSchema<TreeNodeSchema>>) => TValue),
	isKeyValid: (key: TreeIndexKey) => key is TKey,
	indexableSchema?: readonly TreeNodeSchema[],
): TreeIndex<TKey, TValue> {
	return createTreeIndexWithDependencyScope(
		view,
		keyFieldSelector,
		getValue,
		isKeyValid,
		KeyFinderDependencyScope.Node,
		indexableSchema,
	);
}

/**
 * Creates a tree index with an explicitly configured key dependency scope.
 *
 * @internal
 */
export function createTreeIndexWithDependencyScope<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
>(
	view: TreeView<TFieldSchema>,
	keyFieldSelector: TreeIndexKeyFieldSelector,
	getValue:
		| ((nodes: TreeIndexNodes<TreeNode>) => TValue)
		| ((nodes: TreeIndexNodes<NodeFromSchema<TreeNodeSchema>>) => TValue),
	isKeyValid: (key: TreeIndexKey) => key is TKey,
	keyFinderDependencyScope: KeyFinderDependencyScope,
	indexableSchema?: readonly TreeNodeSchema[],
): TreeIndex<TKey, TValue> {
	const indexableSchemaMap = new Map<string, TreeNodeSchema>();
	if (indexableSchema === undefined) {
		walkFieldSchema(view.schema, {
			node: (schema) => indexableSchemaMap.set(schema.identifier, schema),
		});
	} else {
		for (const schema of indexableSchema) {
			indexableSchemaMap.set(schema.identifier, schema);
		}
	}

	const keyFieldSelectorFunction =
		typeof keyFieldSelector === "function"
			? keyFieldSelector
			: keyFieldSelector.get.bind(keyFieldSelector);

	// Resolve and validate every selected key field before constructing the index. AnchorTreeIndex
	// subscribes to forest updates, so deferring this work could surface an invalid schema during a
	// later edit and break the checkout instead of rejecting the index at creation time.
	const keyFinders = new Map<string, KeyFinder<TKey>>();
	for (const schema of indexableSchemaMap.values()) {
		// The property key for the field which contains the index key on nodes with this schema.
		const keyLocation = keyFieldSelectorFunction(schema);
		if (keyLocation !== undefined) {
			if (!(schema instanceof ObjectNodeSchema)) {
				throw new UsageError(
					`The property key "${keyLocation}" selected for schema "${schema.identifier}" cannot be used because the schema is not an object node schema.`,
				);
			}
			const fieldSchema = schema.fields.get(keyLocation);
			if (fieldSchema === undefined) {
				throw new UsageError(
					`The property key "${keyLocation}" selected for schema "${schema.identifier}" does not exist.`,
				);
			}
			const fieldKind =
				convertFieldKind.get(fieldSchema.kind) ??
				fail(0xd4a /* Unknown Simple Tree field kind */);
			// Check multiplicity rather than the specific field kind so this includes required fields, identifier fields, and
			// any future field kinds that always contain one value.
			if (fieldKind.multiplicity !== Multiplicity.Single) {
				throw new UsageError(
					`The property key "${keyLocation}" selected for schema "${schema.identifier}" must refer to a field whose kind guarantees exactly one value, such as a required or identifier field.`,
				);
			}
			if ([...fieldSchema.allowedTypeSet].some((type) => type.kind !== NodeKind.Leaf)) {
				throw new UsageError(
					`The property key "${keyLocation}" selected for schema "${schema.identifier}" must refer to a field that only allows leaf values.`,
				);
			}

			keyFinders.set(
				schema.identifier,
				makeGenericKeyFinder<TKey>(brand(fieldSchema.storedKey), keyLocation, isKeyValid),
			);
		}
	}

	const schemaIndexer = (
		schemaIdentifier: TreeNodeSchemaIdentifier,
	): KeyFinder<TKey> | undefined => keyFinders.get(schemaIdentifier);

	const index = new AnchorTreeIndex<TKey, TValue>(
		(view as SchematizingSimpleTreeView<TFieldSchema>).checkout.forest,
		schemaIndexer,
		(anchorNodes) => {
			const simpleTreeNodes: TreeNode[] = [];
			for (const anchorNode of anchorNodes) {
				const simpleTree = treeNodeFromAnchor(anchorNode);
				if (!isTreeValue(simpleTree)) {
					simpleTreeNodes.push(simpleTree);
				}
			}

			if (hasElement(simpleTreeNodes)) {
				return getValue(simpleTreeNodes);
			}
		},
		(anchorNode: AnchorNode) => {
			const simpleTree = treeNodeFromAnchor(anchorNode);
			if (!isTreeValue(simpleTree)) {
				return treeNodeApi.status(simpleTree);
			}
		},
		keyFinderDependencyScope,
	);

	// all the type checking guarantees that we put nodes of the correct type in the index
	// but it's not captured in the type system
	return index as TreeIndex<TKey, TValue>;
}

/**
 * Make a {@link KeyFinder} which returns the content of the specified field.
 * @remarks
 * The field must always contain exactly one leaf value.
 */
function makeGenericKeyFinder<TKey extends TreeIndexKey>(
	keyField: FieldKey,
	propertyKey: string,
	isKeyValid: (key: TreeIndexKey) => key is TKey,
): KeyFinder<TKey> {
	return (cursor: ITreeSubscriptionCursor) => {
		cursor.enterField(keyField);
		assert(
			cursor.getFieldLength() === 1,
			0xd4b /* the key field does not contain exactly one leaf value */,
		);
		cursor.enterNode(0);
		try {
			const value = cursor.value;
			if (value === undefined) {
				fail(0xb33 /* a value for the key does not exist */);
			}

			if (!isKeyValid(value)) {
				throw new UsageError(
					`The value in key field "${propertyKey}" selected for schema "${cursor.type}" was rejected by isKeyValid.`,
				);
			}
			return value;
		} finally {
			cursor.exitNode();
			cursor.exitField();
		}
	};
}
