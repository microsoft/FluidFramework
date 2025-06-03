/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lazy } from "@fluidframework/core-utils/internal";
import type {
	FlexibleNodeContent,
	FlexTreeNode,
	FlexTreeOptionalField,
	OptionalFieldEditBuilder,
} from "../../../feature-libraries/index.js";
import {
	normalizeAllowedTypes,
	unannotateImplicitAllowedTypes,
	type ImplicitAllowedTypes,
	type ImplicitAnnotatedAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type NodeSchemaMetadata,
	type TreeNodeFromImplicitAllowedTypes,
	type UnannotateImplicitAllowedTypes,
} from "../../schemaTypes.js";
import {
	type InnerNode,
	NodeKind,
	type TreeNodeSchema,
	// eslint-disable-next-line import/no-deprecated
	typeNameSymbol,
	type TreeNode,
	typeSchemaSymbol,
	type Context,
	UnhydratedFlexTreeNode,
	getOrCreateInnerNode,
	type InternalTreeNode,
} from "../../core/index.js";
import { mapTreeFromNodeData, type FactoryContent } from "../../toMapTree.js";
import { brand, type RestrictiveStringRecord } from "../../../util/index.js";
import { TreeNodeValid, type MostDerivedData } from "../../treeNodeValid.js";
import { getUnhydratedContext } from "../../createContext.js";
import type {
	RecordNodeCustomizableSchema,
	RecordNodePojoEmulationSchema,
} from "./recordNodeTypes.js";

/**
 * A map of string keys to tree objects.
 *
 * @privateRemarks
 * Add support for `clear` once we have established merge semantics for it.
 *
 * @sealed @alpha
 */
export interface TreeRecordNode<_T extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends TreeNode {
	// RestrictiveStringRecord<TreeNodeFromImplicitAllowedTypes<T>>
	// TODO
}

// TreeMapNode is invariant over schema type, so for this handler to work with all schema, the only possible type for the schema is `any`.
// This is not ideal, but no alternatives are possible.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler: ProxyHandler<TreeRecordNode<any>> = {
	getPrototypeOf: () => {
		return Map.prototype;
	},
};

abstract class CustomRecordNodeBase<
	const T extends ImplicitAllowedTypes,
> extends TreeNodeValid<RecordNodeInsertableData<T>> {
	public static readonly kind = NodeKind.Map;

	public constructor(input?: InternalTreeNode | RecordNodeInsertableData<T> | undefined) {
		super(input ?? {});
	}

	public [Symbol.iterator](): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]> {
		throw new Error("TODO");
	}

	private get innerNode(): InnerNode {
		return getOrCreateInnerNode(this);
	}

	private editor(key: string): OptionalFieldEditBuilder<FlexibleNodeContent> {
		const field = this.innerNode.getBoxed(brand(key)) as FlexTreeOptionalField;
		return field.editor;
	}

	// TODO
}

/**
 * Define a {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
 *
 * @param base - base schema type to extend.
 * @param useMapPrototype - should this type emulate a ES6 Map object (by faking its prototype with a proxy).
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function recordSchema<
	TName extends string,
	const T extends ImplicitAnnotatedAllowedTypes,
	const ImplicitlyConstructable extends boolean,
	const TCustomMetadata = unknown,
>(
	identifier: TName,
	info: T,
	implicitlyConstructable: ImplicitlyConstructable,
	useMapPrototype: boolean,
	metadata?: NodeSchemaMetadata<TCustomMetadata>,
) {
	const lazyChildTypes = new Lazy(() =>
		normalizeAllowedTypes(unannotateImplicitAllowedTypes(info)),
	);
	const lazyAllowedTypesIdentifiers = new Lazy(
		() => new Set([...lazyChildTypes.value].map((type) => type.identifier)),
	);

	let unhydratedContext: Context;

	class Schema
		extends CustomRecordNodeBase<UnannotateImplicitAllowedTypes<T>>
		implements TreeRecordNode<UnannotateImplicitAllowedTypes<T>>
	{
		public static override prepareInstance<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			flexNode: FlexTreeNode,
		): TreeNodeValid<T2> {
			if (useMapPrototype) {
				return new Proxy<Schema>(instance as Schema, handler as ProxyHandler<Schema>);
			}
			return instance;
		}

		public static override buildRawNode<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			input: T2,
		): UnhydratedFlexTreeNode {
			return UnhydratedFlexTreeNode.getOrCreate(
				unhydratedContext,
				mapTreeFromNodeData(input as FactoryContent, this as unknown as ImplicitAllowedTypes),
			);
		}

		public static get allowedTypesIdentifiers(): ReadonlySet<string> {
			return lazyAllowedTypesIdentifiers.value;
		}

		protected static override constructorCached: MostDerivedData | undefined = undefined;

		protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): Context {
			const schema = this as unknown as TreeNodeSchema;
			unhydratedContext = getUnhydratedContext(schema);
			return unhydratedContext;
		}

		public static readonly identifier = identifier;
		public static readonly info = info;
		public static readonly implicitlyConstructable: ImplicitlyConstructable =
			implicitlyConstructable;
		public static get childTypes(): ReadonlySet<TreeNodeSchema> {
			return lazyChildTypes.value;
		}
		public static readonly metadata: NodeSchemaMetadata<TCustomMetadata> = metadata ?? {};

		// eslint-disable-next-line import/no-deprecated
		public get [typeNameSymbol](): TName {
			return identifier;
		}
		public get [typeSchemaSymbol](): typeof schemaErased {
			return Schema.constructorCached?.constructor as unknown as typeof schemaErased;
		}
	}
	const schemaErased: RecordNodeCustomizableSchema<
		TName,
		T,
		ImplicitlyConstructable,
		TCustomMetadata
	> &
		RecordNodePojoEmulationSchema<TName, T, ImplicitlyConstructable, TCustomMetadata> = Schema;
	return schemaErased;
}

/**
 * Content which can be used to construct a Record node, explicitly or implicitly.
 * @system @alpha
 */
export type RecordNodeInsertableData<T extends ImplicitAllowedTypes> = RestrictiveStringRecord<
	InsertableTreeNodeFromImplicitAllowedTypes<T>
>;
