/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { assert } from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	IForestSubscription,
	TreeNodeSchemaIdentifier,
	TreeValue,
	UpPath,
} from "../core/index.js";

import {
	FieldKinds,
	FlexFieldSchema,
	FlexTreeField,
	FlexTreeNode,
	FlexTreeTypedField,
	typeNameSymbol,
} from "../feature-libraries/index.js";
import { Mutable, brand, fail, isReadonlyArray } from "../util/index.js";

import { anchorProxy, tryGetFlexNode, tryGetProxy } from "./proxyBinding.js";
import { extractRawNodeContent } from "./rawNode.js";
import { tryGetSimpleNodeSchema } from "./schemaCaching.js";
import { NodeKind } from "./schemaTypes.js";
import { TreeNode, Unhydrated } from "./types.js";

/**
 * Detects if the given 'candidate' is a TreeNode.
 *
 * @remarks
 * Supports both Hydrated and {@link Unhydrated} TreeNodes, both of which return true.
 *
 * Because the common usage is to check if a value being inserted/set is a TreeNode,
 * this function permits calling with primitives as well as objects.
 *
 * Primitives will always return false (as they are copies of data, not references to nodes).
 *
 * @param candidate - Value which may be a TreeNode
 * @returns true if the given 'candidate' is a hydrated TreeNode.
 */
export function isTreeNode(candidate: unknown): candidate is TreeNode | Unhydrated<TreeNode> {
	return tryGetFlexNode(candidate) !== undefined;
}

/**
 * Retrieve the associated proxy for the given field.
 * */
export function getProxyForField(field: FlexTreeField): TreeNode | TreeValue | undefined {
	switch (field.schema.kind) {
		case FieldKinds.required: {
			const asValue = field as FlexTreeTypedField<
				FlexFieldSchema<typeof FieldKinds.required>
			>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getOrCreateNodeProxy(asValue.boxedContent);
		}
		case FieldKinds.optional: {
			const asValue = field as FlexTreeTypedField<
				FlexFieldSchema<typeof FieldKinds.optional>
			>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.

			const maybeContent = asValue.boxedContent;

			// Normally, empty fields are unreachable due to the behavior of 'tryGetField'.  However, the
			// root field is a special case where the field is always present (even if empty).
			return maybeContent === undefined ? undefined : getOrCreateNodeProxy(maybeContent);
		}
		// TODO: Remove if/when 'FieldNode' is removed.
		case FieldKinds.sequence: {
			// 'getProxyForNode' handles FieldNodes by unconditionally creating a array node proxy, making
			// this case unreachable as long as users follow the 'array recipe'.
			fail("'sequence' field is unexpected.");
		}
		case FieldKinds.identifier: {
			const identifier = field.boxedAt(0);
			assert(identifier !== undefined, 0x91a /* identifier must exist */);
			return getOrCreateNodeProxy(identifier);
		}

		default:
			fail("invalid field kind");
	}
}

export function getOrCreateNodeProxy(flexNode: FlexTreeNode): TreeNode | TreeValue {
	const cachedProxy = tryGetProxy(flexNode);
	if (cachedProxy !== undefined) {
		return cachedProxy;
	}

	const schema = flexNode.schema;
	const classSchema = tryGetSimpleNodeSchema(schema);
	assert(classSchema !== undefined, 0x91b /* node without schema */);
	if (typeof classSchema === "function") {
		const simpleSchema = classSchema as unknown as new (dummy: FlexTreeNode) => TreeNode;
		return new simpleSchema(flexNode);
	} else {
		return (classSchema as { create(data: FlexTreeNode): TreeNode }).create(flexNode);
	}
}

// #region Content insertion and proxy binding

/** The path of a proxy, relative to the root of the content tree that the proxy belongs to */
interface RelativeProxyPath {
	readonly path: UpPath;
	readonly proxy: TreeNode;
}

/** All {@link RelativeProxyPath}s that are under the given root path */
interface RootedProxyPaths {
	readonly rootPath: UpPath;
	readonly proxyPaths: RelativeProxyPath[];
}

/**
 * Records any proxies in the given content tree and does the necessary bookkeeping to ensure they are synchronized with subsequent reads of the tree.
 * @remarks If the content tree contains any proxies, this function must be called just prior to inserting the content into the tree.
 * Specifically, no other content may be inserted into the tree between the invocation of this function and the insertion of `content`.
 * The insertion of `content` must occur or else this function will cause memory leaks.
 * @param content - the tree of content to be inserted, of which any of its object/map/array nodes might be a proxy
 * @param anchors - the {@link AnchorSet} for the tree
 * @returns The content after having all proxies replaced inline with plain javascript objects.
 * See {@link extractFactoryContent} for more details.
 */
export function prepareContentForInsert(
	content: InsertableContent,
	forest: IForestSubscription,
): FactoryContent {
	if (isReadonlyArray(content)) {
		return prepareArrayContentForInsert(content, forest);
	}

	const proxies: RootedProxyPaths = {
		rootPath: { parent: undefined, parentField: EmptyKey, parentIndex: 0 },
		proxyPaths: [],
	};
	const extractedContent = extractFactoryContent(content, {
		path: proxies.rootPath,
		onVisitProxy: (p, proxy) => {
			proxies.proxyPaths.push({ path: p, proxy });
		},
	});

	bindProxies([proxies], forest);
	return extractedContent;
}

function prepareArrayContentForInsert(
	content: readonly InsertableContent[],
	forest: IForestSubscription,
): FactoryContent {
	const proxies: RootedProxyPaths[] = [];
	const extractedContent: FactoryContent[] = [];
	for (let i = 0; i < content.length; i++) {
		proxies.push({
			rootPath: {
				parent: undefined,
				parentField: EmptyKey,
				parentIndex: 0,
			},
			proxyPaths: [],
		});
		extractedContent.push(
			extractFactoryContent(content[i], {
				path: proxies[i].rootPath,
				onVisitProxy: (p, proxy) => {
					proxies[i].proxyPaths.push({ path: p, proxy });
				},
			}),
		);
	}

	bindProxies(proxies, forest);
	return extractedContent;
}

function bindProxies(proxies: RootedProxyPaths[], forest: IForestSubscription): void {
	// Only subscribe to the event if there is at least one proxy tree to hydrate - this is not the case when inserting an empty array [].
	if (proxies.length > 0) {
		// Creating a new array emits one event per element in the array, so listen to the event once for each element
		let i = 0;
		const off = forest.on("afterRootFieldCreated", (fieldKey) => {
			(proxies[i].rootPath as Mutable<UpPath>).parentField = fieldKey;
			for (const { path, proxy } of proxies[i].proxyPaths) {
				anchorProxy(forest.anchors, path, proxy);
			}
			if (++i === proxies.length) {
				off();
			}
		});
	}
}

/**
 * Given a content tree that is to be inserted into the shared tree, replace all subtrees that were created by factories
 * (via {@link SharedTreeObjectFactory.create}) with the content that was passed to those factories.
 * @param content - the content being inserted which may be, and/or may contain, factory-created content
 * @param onVisitProxy - an optional callback that will run for each proxy (i.e. object created by a factory) found in the inserted content
 * @param insertedAtIndex - if the content being inserted is array node content, this must be the index in the array node at which the content is being inserted
 * @returns the result of the content replacement and a {@link ExtractedFactoryContent.hydrateProxies} function which must be invoked if present.
 * @remarks
 * This functions works recursively.
 * Factory-created objects that are nested inside of the content passed to other factory-created objects, and so on, will be in-lined.
 * This function also adds the hidden {@link typeNameSymbol} of each object schema to the output.
 * @example
 * ```ts
 * const x = foo.create({
 *   a: 3, b: bar.create({
 *     c: [baz.create({ d: 5 })]
 *   })
 * });
 * const y = extractFactoryContent(x);
 * y === {
 *   [typeNameSymbol]: "foo", a: 3, b: {
 *     [typeNameSymbol]: "bar", c: [{ [typeNameSymbol]: "baz", d: 5 }]
 *  }
 * }
 * ```
 */
export function extractFactoryContent(
	input: InsertableContent,
	visitProxies?: {
		path: UpPath;
		onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
	},
): FactoryContent {
	let content: FactoryContent;
	const rawFlexNode = tryGetFlexNode(input);
	if (rawFlexNode !== undefined) {
		const factoryContent = extractRawNodeContent(rawFlexNode);
		if (factoryContent === undefined) {
			// We were passed a proxy, but that proxy doesn't have any raw content.
			throw new Error("Cannot insert a node that is already in the tree");
		}
		visitProxies?.onVisitProxy(visitProxies.path, input as TreeNode);
		content = factoryContent;
	} else {
		content = input as FactoryContent;
	}

	assert(!isTreeNode(content), 0x844 /* Unhydrated insertion content should have FlexNode */);

	let type: NodeKind;
	let extractedContent: FactoryContent;
	if (isReadonlyArray(content)) {
		type = NodeKind.Array;
		extractedContent = extractContentArray(content as readonly FactoryContent[], visitProxies);
	} else if (content instanceof Map) {
		type = NodeKind.Map;
		extractedContent = extractContentMap(
			content as ReadonlyMap<string, FactoryContent>,
			visitProxies,
		);
	} else if (typeof content === "object" && content !== null && !isFluidHandle(content)) {
		type = NodeKind.Object;
		extractedContent = extractContentObject(content as object, visitProxies);
	} else {
		extractedContent = content;
		type = NodeKind.Leaf;
	}

	if (rawFlexNode !== undefined) {
		const kindFromSchema =
			tryGetSimpleNodeSchema(rawFlexNode.schema)?.kind ??
			fail("NodeBase should always have class schema");

		assert(kindFromSchema === type, 0x845 /* kind of data should match kind of schema */);
	}

	return extractedContent;
}

function extractContentArray(
	input: readonly FactoryContent[],
	visitProxies:
		| {
				path: UpPath;
				onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
		  }
		| undefined,
): FactoryContent {
	const output: FactoryContent[] = [];
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	for (let i = 0; i < input.length; i++) {
		const childContent = extractFactoryContent(
			input[i],
			visitProxies !== undefined
				? {
						path: {
							parent: visitProxies.path,
							parentField: EmptyKey,
							parentIndex: i,
						},
						onVisitProxy: visitProxies?.onVisitProxy,
				  }
				: undefined,
		);
		output.push(childContent);
	}
	return output;
}

function extractContentMap(
	input: ReadonlyMap<string, FactoryContent>,
	visitProxies:
		| {
				path: UpPath;
				onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
		  }
		| undefined,
): FactoryContent {
	const output = new Map();
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	for (const [key, value] of input) {
		const childContent = extractFactoryContent(
			value,
			visitProxies !== undefined
				? {
						path: {
							parent: visitProxies.path,
							parentField: brand(key),
							parentIndex: 0,
						},
						onVisitProxy: visitProxies?.onVisitProxy,
				  }
				: undefined,
		);
		output.set(key, childContent);
	}
	return output;
}

function extractContentObject(
	input: {
		readonly [P in string]?: FactoryContent;
	},
	visitProxies:
		| {
				path: UpPath;
				onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
		  }
		| undefined,
): FactoryContent {
	const output: Record<string, FactoryContent> = {};
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	for (const [key, value] of Object.entries(input)) {
		// Treat undefined fields and missing fields the same.
		// Generally tree does not require explicit undefined values at runtime despite some of the schema aware type checking currently requiring it.
		if (value !== undefined) {
			const childContent = extractFactoryContent(
				value,
				visitProxies !== undefined
					? {
							path: {
								parent: visitProxies.path,
								parentField: brand(key),
								parentIndex: 0,
							},
							onVisitProxy: visitProxies?.onVisitProxy,
					  }
					: undefined,
			);
			output[key] = childContent;
		}
	}
	return output;
}

// #endregion Content insertion and proxy binding

/**
 * Content which can be used to build a node.
 * @remarks
 * Can contain unhydrated nodes, but can not be an unhydrated node at the root.
 */
export type FactoryContent =
	| IFluidHandle
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| ReadonlyMap<string, InsertableContent>
	| readonly InsertableContent[]
	| {
			readonly [P in string]?: InsertableContent;
	  };

/**
 * Content which can be inserted into a tree.
 */
export type InsertableContent = Unhydrated<TreeNode> | FactoryContent;

/**
 * Brand `copy` with the type (under {@link typeNameSymbol}) to avoid ambiguity when inferring types from this data.
 */
export function markContentType(typeName: TreeNodeSchemaIdentifier, copy: object): void {
	Object.defineProperty(copy, typeNameSymbol, { value: typeName });
}
