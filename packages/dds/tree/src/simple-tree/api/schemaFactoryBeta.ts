/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RestrictiveStringRecord } from "../../util/index.js";
import type {
	ImplicitAllowedTypes,
	NodeKind,
	TreeNodeSchema,
	TreeNodeSchemaBoth,
	TreeNodeSchemaClass,
	TreeNodeSchemaNonClass,
	WithType,
} from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";

import {
	objectSchema,
	recordSchema,
	type InsertableObjectFromSchemaRecord,
	type RecordNodeInsertableData,
	type TreeObjectNode,
	type TreeRecordNode,
	type UnannotateSchemaRecord,
} from "../node-kinds/index.js";
import {
	defaultSchemaFactoryObjectOptions,
	SchemaFactory,
	scoped,
	structuralName,
	type NodeSchemaOptions,
	type SchemaFactoryObjectOptions,
	type ScopedSchemaName,
} from "./schemaFactory.js";
import type { System_Unsafe, TreeRecordNodeUnsafe } from "./typesUnsafe.js";

// These imports prevent a large number of type references in the API reports from showing up as *_2.
/* eslint-disable unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars, import/no-duplicates */
import type {
	FieldProps,
	FieldSchemaAlpha,
	FieldPropsAlpha,
	FieldKind,
} from "../fieldSchema.js";
import type { LeafSchema } from "../leafNodeSchema.js";
import type { SimpleLeafNodeSchema } from "../simpleSchema.js";
/* eslint-enable unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars, import/no-duplicates */

/**
 * {@link SchemaFactory} with additional beta APIs.
 * @beta
 * @privateRemarks
 */
export class SchemaFactoryBeta<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactory<TScope, TName> {
	/**
	 * Create a {@link SchemaFactory} with a {@link SchemaFactory.scope|scope} which is a combination of this factory's scope and the provided name.
	 * @remarks
	 * The main use-case for this is when creating a collection of related schema (for example using a function that creates multiple schema).
	 * Creating such related schema using a sub-scope helps ensure they won't collide with other schema in the parent scope.
	 */
	public scopedFactory<const T extends TName, TNameInner extends number | string = string>(
		name: T,
	): SchemaFactoryBeta<ScopedSchemaName<TScope, T>, TNameInner> {
		return new SchemaFactoryBeta(scoped(this, name));
	}

	/**
	 * Define a {@link TreeNodeSchemaClass} for a {@link TreeObjectNode}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
	 * @param options - Additional options for the schema.
	 */
	public objectBeta<
		const Name extends TName,
		const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
	>(
		name: Name,
		fields: T,
		options?: SchemaFactoryObjectOptions,
	): TreeNodeSchemaClass<
		/* Name */ ScopedSchemaName<TScope, Name>,
		/* Kind */ NodeKind.Object,
		/* TNode */ TreeObjectNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Object>,
		/* TInsertable */ object & InsertableObjectFromSchemaRecord<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T,
		/* TConstructorExtra */ undefined
	> {
		// The compiler can't infer that UnannotateSchemaRecord<T> is equal to T so we have to do a bunch of typing to make the error go away.
		const object: TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Object,
			TreeObjectNode<UnannotateSchemaRecord<T>, ScopedSchemaName<TScope, Name>>,
			object & InsertableObjectFromSchemaRecord<UnannotateSchemaRecord<T>>,
			true,
			T
		> = objectSchema(
			scoped<TScope, TName, Name>(this, name),
			fields,
			true,
			options?.allowUnknownOptionalFields ??
				defaultSchemaFactoryObjectOptions.allowUnknownOptionalFields,
		);

		return object as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Object,
			TreeObjectNode<RestrictiveStringRecord<ImplicitFieldSchema>>,
			unknown,
			true,
			T
		> as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Object,
			TreeObjectNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Object>,
			object & InsertableObjectFromSchemaRecord<T>,
			true,
			T,
			undefined
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param allowedTypes - The types that may appear in the record.
	 *
	 * @remarks
	 * The identifier for this record is defined as a function of the provided types.
	 * It is still scoped to this `SchemaFactory`, but multiple calls with the same arguments will return the same
	 * schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named records, other types in this schema builder should avoid names of the form `Record<${string}>`.
	 *
	 * @example
	 * The returned schema should be used as a schema directly:
	 * ```typescript
	 * const MyRecord = factory.record(factory.number);
	 * type MyRecord = NodeFromSchema<typeof Record>;
	 * ```
	 * Or inline:
	 * ```typescript
	 * factory.object("Foo", { myRecord: factory.record(factory.number) });
	 * ```
	 *
	 * @privateRemarks
	 * The name produced at the type-level here is not as specific as it could be; however, doing type-level sorting and escaping is a real mess.
	 * There are cases where not having this full type provided will be less than ideal, since TypeScript's structural types will allow assignment between runtime incompatible types at compile time.
	 * For example, attempts to narrow unions of structural records by name won't work.
	 * Planned future changes to move to a class based schema system as well as factor function based node construction should mostly avoid these issues,
	 * though there may still be some problematic cases even after that work is done.
	 *
	 * The return value is a class, but its type is intentionally not specific enough to indicate it is a class.
	 * This prevents callers of this from sub-classing it, which is unlikely to work well (due to the ease of accidentally giving two different calls to this different subclasses)
	 * when working with structural typing.
	 *
	 * {@label STRUCTURAL}
	 */
	public record<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchemaNonClass<
		/* Name */ ScopedSchemaName<TScope, `Record<${string}>`>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> &
			WithType<ScopedSchemaName<TScope, `Record<${string}>`>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T,
		/* TConstructorExtra */ undefined
	>;
	/**
	 * Define (and add to this library) a {@link TreeNodeSchemaClass} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the record.
	 *
	 * @remarks
	 * Like TypeScript `Record`s, record nodes have some potential pitfalls.
	 * For example: TypeScript makes assumptions about built-in keys being present (e.g. `toString`, `hasOwnProperty`, etc.).
	 * Since these are otherwise valid keys in a record, this can lead to unexpected behavior.
	 * To prevent inconsistent behavior, these built-ins are hidden by record nodes.
	 * This means that if you try to call these built-ins (e.g. `toString()`) on a record node, you will get an error.
	 *
	 * In most cases, it is probably preferable to use {@link SchemaFactory.(map:2)} instead.
	 *
	 * @example
	 * ```typescript
	 * class NamedRecord extends factory.record("name", factory.number) {}
	 * ```
	 *
	 * {@label NAMED}
	 */
	public record<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		/* Name */ ScopedSchemaName<TScope, Name>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T,
		/* TConstructorExtra */ undefined
	>;
	/**
	 * {@link SchemaFactory.array} implementation.
	 *
	 * @privateRemarks
	 * This should return TreeNodeSchemaBoth: see note on "map" implementation for details.
	 */
	public record<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		maybeAllowedTypes?: T,
	): TreeNodeSchema<
		/* Name */ ScopedSchemaName<TScope, string>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T
	> {
		if (maybeAllowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Record", types);
			return this.getStructuralType(fullName, types, () =>
				this.namedRecord(
					fullName,
					nameOrAllowedTypes as T,
					/* customizable */ false,
					/* implicitlyConstructable */ true,
				),
			) as TreeNodeSchemaClass<
				/* Name */ ScopedSchemaName<TScope, string>,
				/* Kind */ NodeKind.Record,
				/* TNode */ TreeRecordNode<T>,
				/* TInsertable */ RecordNodeInsertableData<T>,
				/* ImplicitlyConstructable */ true,
				/* Info */ T,
				/* TConstructorExtra */ undefined
			>;
		}
		const out: TreeNodeSchemaBoth<
			/* Name */ ScopedSchemaName<TScope, string>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNode<T>,
			/* TInsertable */ RecordNodeInsertableData<T>,
			/* ImplicitlyConstructable */ true,
			/* Info */ T,
			/* TConstructorExtra */ undefined
		> = this.namedRecord(
			nameOrAllowedTypes as TName,
			maybeAllowedTypes,
			/* customizable */ true,
			/* implicitlyConstructable */ true,
		);
		return out;
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @remarks
	 * This is not intended to be used directly, use the overload of `record` which takes a name instead.
	 */
	private namedRecord<
		Name extends TName | string,
		const T extends ImplicitAllowedTypes,
		const ImplicitlyConstructable extends boolean,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		customizable: boolean,
		implicitlyConstructable: ImplicitlyConstructable,
		options?: NodeSchemaOptions<TCustomMetadata>,
	): TreeNodeSchemaBoth<
		/* Name */ ScopedSchemaName<TScope, Name>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> &
			WithType<ScopedSchemaName<TScope, string>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ ImplicitlyConstructable,
		/* Info */ T,
		/* TConstructorExtra */ undefined
	> {
		const record = recordSchema({
			identifier: scoped<TScope, TName, Name>(this, name),
			info: allowedTypes,
			customizable,
			implicitlyConstructable,
			metadata: options?.metadata,
		});

		return record as TreeNodeSchemaBoth<
			/* Name */ ScopedSchemaName<TScope, Name>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNode<T> &
				WithType<ScopedSchemaName<TScope, string>, NodeKind.Record>,
			/* TInsertable */ RecordNodeInsertableData<T>,
			/* ImplicitlyConstructable */ ImplicitlyConstructable,
			/* Info */ T,
			/* TConstructorExtra */ undefined
		>;
	}

	/**
	 * {@link SchemaFactoryBeta.(record:2)} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of `SchemaFactory.record` uses the same workarounds as {@link SchemaFactory.objectRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public recordRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptions<TCustomMetadata>) {
		const RecordSchema = this.namedRecord(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			/* customizable */ true,
			// Setting this to true seems to work ok currently, but not for other node kinds.
			// Supporting this could be fragile and might break other future changes, so it's being kept as false for now.
			/* implicitlyConstructable */ false,
			options,
		);

		return RecordSchema as TreeNodeSchemaClass<
			/* Name */ ScopedSchemaName<TScope, Name>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNodeUnsafe<T> &
				WithType<ScopedSchemaName<TScope, Name>, NodeKind.Record>,
			/* TInsertable */ {
				// Ideally this would be
				// RestrictiveStringRecord<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>,
				// but doing so breaks recursive types.
				// Instead we do a less nice version:
				readonly [P in string]: System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>;
			},
			/* ImplicitlyConstructable */ false,
			/* Info */ T,
			/* TConstructorExtra */ undefined,
			/* TCustomMetadata */ TCustomMetadata
		>;
	}
}
