/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type FieldSchemaAlpha,
	type ImplicitFieldSchema,
	FieldKind,
	markSchemaMostDerived,
	normalizeFieldSchema,
} from "../schemaTypes.js";
import { NodeKind, type TreeNodeSchema } from "../core/index.js";
import { toStoredSchema } from "../toStoredSchema.js";
import { LeafNodeSchema } from "../leafNodeSchema.js";
import { isObjectNodeSchema, type ObjectNodeSchema } from "../node-kinds/index.js";
import { getOrCreate } from "../../util/index.js";
import type { MakeNominal } from "../../util/index.js";
import { walkFieldSchema } from "../walkFieldSchema.js";
import type { SimpleNodeSchema, SimpleTreeSchema } from "../simpleSchema.js";

/**
 * Options when constructing a tree view.
 * @public
 */
export interface ITreeConfigurationOptions {
	/**
	 * If `true`, the tree will validate new content against its stored schema at insertion time
	 * and throw an error if the new content doesn't match the expected schema.
	 *
	 * @defaultValue `false`.
	 *
	 * @remarks Enabling schema validation has a performance penalty when inserting new content into the tree because
	 * additional checks are done. Enable this option only in scenarios where you are ok with that operation being a
	 * bit slower.
	 */
	enableSchemaValidation?: boolean;

	/**
	 * A flag used to opt into strict rules ensuring that the schema avoids cases which can make the type of nodes ambiguous when importing or exporting data.
	 * @defaultValue `false`.
	 *
	 * @remarks
	 * When this is true, it ensures that the compile time type safety for data when constructing nodes is sufficient to ensure that the runtime behavior will not give node data ambiguity errors.
	 *
	 * This ensures that the canonical JSON-like representation of all unions in the tree are lossless and unambiguous.
	 * This canonical JSON-like representation consists of arrays, plain old JavaScript objects with string keys, booleans, numbers (excluding NaN, -0 and infinities), strings, null and {@link @fluidframework/core-interfaces#IFluidHandle}s.
	 * It is compatible with the node creation APIs (such as schema class constructors) and is also compatible with JSON assuming any IFluidHandles get special handling (since they are not JSON compatible).
	 * Currently these cases can cause ambiguity in a union:
	 *
	 * - More than one ArrayNode type: it's impossible to tell which array type is intended in the case of empty arrays (`[]`).
	 *
	 * - More than one MapNode type: it's impossible to tell which map type is intended in the case of an empty map (`{}`).
	 *
	 * - Both a MapNode and an ArrayNode: this case is not a problem for the canonical JSON representation, but is an issue when constructing from an Iterable, which is supported for both MapNode and ArrayNode.
	 *
	 * - Both a MapNode and an ObjectNode: when the input is valid for the ObjectNode, the current parser always considers it ambiguous with being a MapNode.
	 *
	 * - ObjectNodes which have fields (required or optional) which include all required fields of another ObjectNode: currently each ObjectNode is differentiated by the presence of its required fields.
	 *
	 * This check is conservative: some complex cases may error if the current simple algorithm cannot show no ambiguity is possible.
	 * This check may become more permissive over time.
	 *
	 * @example Ambiguous schema (with `preventAmbiguity: false`), and how to disambiguate it using {@link Unhydrated} nodes:
	 * ```typescript
	 * const schemaFactory = new SchemaFactory("com.example");
	 * class Feet extends schemaFactory.object("Feet", { length: schemaFactory.number }) {}
	 * class Meters extends schemaFactory.object("Meters", { length: schemaFactory.number }) {}
	 * const config = new TreeViewConfiguration({
	 * 	// This combination of schema can lead to ambiguous cases and will error if `preventAmbiguity` is true.
	 * 	schema: [Feet, Meters],
	 * 	preventAmbiguity: false,
	 * });
	 * const view = tree.viewWith(config);
	 * // This is invalid since it is ambiguous which type of node is being constructed:
	 * // view.initialize({ length: 5 });
	 * // To work, an explicit type can be provided by using an {@link Unhydrated} Node:
	 * view.initialize(new Meters({ length: 5 }));
	 * ```
	 *
	 * @example Schema disambiguated by adjusting field names, validated with `preventAmbiguity: true:`
	 * ```typescript
	 * const schemaFactory = new SchemaFactory("com.example");
	 * class Feet extends schemaFactory.object("Feet", { length: schemaFactory.number }) {}
	 * class Meters extends schemaFactory.object("Meters", {
	 * 	// To avoid ambiguity when parsing unions of Feet and Meters, this renames the length field to "meters".
	 * 	// To preserve compatibility with existing data from the ambiguous case,
	 * 	// `{ key: "length" }` is set, so when persisted in the tree "length" is used as the field name.
	 * 	meters: schemaFactory.required(schemaFactory.number, { key: "length" }),
	 * }) {}
	 * const config = new TreeViewConfiguration({
	 * 	// This combination of schema is not ambiguous because `Feet` and `Meters` have different required keys.
	 * 	schema: [Feet, Meters],
	 * 	preventAmbiguity: true,
	 * });
	 * const view = tree.viewWith(config);
	 * // This now works, since the field is sufficient to determine this is a `Meters` node.
	 * view.initialize({ meters: 5 });
	 * ```
	 *
	 * @privateRemarks
	 * In the future, we can support lossless round tripping via the canonical JSON-like representation above when unambiguous.
	 * This could be done via methods added to `Tree` to export and import such objects, which would give us a place to explicitly define the type of this representation.
	 *
	 * To make this more permissive in the future we can:
	 *
	 * - Make toMapTree more permissive (ex: allow disambiguation based on leaf type)
	 * - Update this check to more tightly match toMapTree
	 * - Add options to help schema authors disambiguate their types, such as "constant fields" which are not persisted, and always have a constant value.
	 *
	 * The above examples exist in executable form in this files tests, and should be updated there then copied back here.
	 */
	readonly preventAmbiguity?: boolean;
}

const defaultTreeConfigurationOptions: Required<ITreeConfigurationOptions> = {
	enableSchemaValidation: false,
	preventAmbiguity: false,
};

/**
 * Property-bag configuration for {@link TreeViewConfiguration} construction.
 * @public
 */
export interface ITreeViewConfiguration<
	TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> extends ITreeConfigurationOptions {
	/**
	 * The schema which the application wants to view the tree with.
	 */
	readonly schema: TSchema;
}

/**
 * Configuration for {@link ViewableTree.viewWith}.
 * @sealed @public
 */
export class TreeViewConfiguration<
	const TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> implements Required<ITreeViewConfiguration<TSchema>>
{
	protected _typeCheck!: MakeNominal;

	/**
	 * {@inheritDoc ITreeViewConfiguration.schema}
	 */
	public readonly schema: TSchema;

	/**
	 * {@inheritDoc ITreeConfigurationOptions.enableSchemaValidation}
	 */
	public readonly enableSchemaValidation: boolean;

	/**
	 * {@inheritDoc ITreeConfigurationOptions.preventAmbiguity}
	 */
	public readonly preventAmbiguity: boolean;

	/**
	 * Construct a new {@link TreeViewConfiguration}.
	 *
	 * @param props - Property bag of configuration options.
	 *
	 * @remarks
	 * Performing this construction deeply validates the provided schema.
	 * This means that when this constructor is called, all {@link LazyItem} {@link TreeNodeSchema} references will be evaluated (using {@link evaluateLazySchema}).
	 * This means that the declarations for all transitively reachable {@link TreeNodeSchema} must be available at this time.
	 *
	 * For example, a schema reachable from this configuration cannot reference this configuration during its declaration,
	 * since this would be a cyclic dependency that will cause an error when constructing this configuration.
	 */
	public constructor(props: ITreeViewConfiguration<TSchema>) {
		const config = { ...defaultTreeConfigurationOptions, ...props };
		this.schema = config.schema;
		this.enableSchemaValidation = config.enableSchemaValidation;
		this.preventAmbiguity = config.preventAmbiguity;

		// Ambiguity errors are lower priority to report than invalid schema errors, so collect these in an array and report them all at once.
		const ambiguityErrors: string[] = [];

		walkFieldSchema(config.schema, {
			// Ensure all reachable schema are marked as most derived.
			// This ensures if multiple schema extending the same schema factory generated class are present (or have been constructed, or get constructed in the future),
			// an error is reported.

			node: (schema) => markSchemaMostDerived(schema, true),
			allowedTypes(types): void {
				if (config.preventAmbiguity) {
					checkUnion(types, ambiguityErrors);
				}
			},
		});

		if (ambiguityErrors.length !== 0) {
			// Duplicate errors are common since when two types conflict, both orders error:
			const deduplicated = new Set(ambiguityErrors);
			throw new UsageError(`Ambiguous schema found:\n${[...deduplicated].join("\n")}`);
		}

		// Eagerly perform this conversion to surface errors sooner.
		toStoredSchema(config.schema);
	}
}

/**
 * {@link TreeViewConfiguration} extended with some alpha APIs.
 * @sealed @alpha
 */
export class TreeViewConfigurationAlpha<
		const TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
	>
	extends TreeViewConfiguration<TSchema>
	implements TreeSchema
{
	/**
	 * {@inheritDoc TreeSchema.root}
	 */
	public readonly root: FieldSchemaAlpha;
	/**
	 * {@inheritDoc TreeSchema.definitions}
	 */
	public readonly definitions: ReadonlyMap<string, SimpleNodeSchema & TreeNodeSchema>;

	public constructor(props: ITreeViewConfiguration<TSchema>) {
		super(props);
		this.root = normalizeFieldSchema(props.schema);
		const definitions = new Map<string, SimpleNodeSchema & TreeNodeSchema>();
		walkFieldSchema(props.schema, {
			node: (schema) =>
				definitions.set(schema.identifier, schema as SimpleNodeSchema & TreeNodeSchema),
		});
		this.definitions = definitions;
	}
}

/**
 * {@link TreeViewConfigurationAlpha}
 * @sealed @alpha
 */
export interface TreeSchema extends SimpleTreeSchema {
	/**
	 * {@inheritDoc SimpleTreeSchema.root}
	 */
	readonly root: FieldSchemaAlpha;

	/**
	 * {@inheritDoc SimpleTreeSchema.definitions}
	 */
	readonly definitions: ReadonlyMap<string, SimpleNodeSchema & TreeNodeSchema>;
}

/**
 * Pretty print a set of types for use in error messages.
 */
function formatTypes(allowed: Iterable<TreeNodeSchema>): string {
	// Use JSON.stringify to quote and escape identifiers.
	// Don't just use a single array JSON.stringify since that omits spaces between items
	return `[${Array.from(allowed, (s) => JSON.stringify(s.identifier)).join(", ")}]`;
}

/**
 * Detect cases documented in {@link ITreeConfigurationOptions.preventAmbiguity}.
 */
export function checkUnion(union: Iterable<TreeNodeSchema>, errors: string[]): void {
	const checked: Set<TreeNodeSchema> = new Set();
	const maps: TreeNodeSchema[] = [];
	const arrays: TreeNodeSchema[] = [];

	const objects: ObjectNodeSchema[] = [];
	// Map from key to schema using that key
	const allObjectKeys: Map<string, Set<TreeNodeSchema>> = new Map();

	for (const schema of union) {
		if (checked.has(schema)) {
			throw new UsageError(`Duplicate schema in allowed types: ${schema.identifier}`);
		}
		checked.add(schema);

		if (schema instanceof LeafNodeSchema) {
			// nothing to do
		} else if (isObjectNodeSchema(schema)) {
			objects.push(schema);
			for (const key of schema.fields.keys()) {
				getOrCreate(allObjectKeys, key, () => new Set()).add(schema);
			}
		} else if (schema.kind === NodeKind.Array) {
			arrays.push(schema);
		} else {
			assert(schema.kind === NodeKind.Map, 0x9e7 /* invalid schema */);
			maps.push(schema);
		}
	}

	if (arrays.length > 1) {
		errors.push(
			`More than one kind of array allowed within union (${formatTypes(arrays)}). This would require type disambiguation which is not supported by arrays during import or export.`,
		);
	}

	if (maps.length > 1) {
		errors.push(
			`More than one kind of map allowed within union (${formatTypes(maps)}). This would require type disambiguation which is not supported by maps during import or export.`,
		);
	}

	if (maps.length > 0 && arrays.length > 0) {
		errors.push(
			`Both a map and an array allowed within union (${formatTypes([...arrays, ...maps])}). Both can be implicitly constructed from iterables like arrays, which are ambiguous when the array is empty.`,
		);
	}

	if (objects.length > 0 && maps.length > 0) {
		errors.push(
			`Both a object and a map allowed within union (${formatTypes([...objects, ...maps])}). Both can be constructed from objects and can be ambiguous.`,
		);
	}

	// Check for objects which fully overlap:
	for (const schema of objects) {
		// All objects which might be ambiguous relative to `schema`.
		const possiblyAmbiguous = new Set(objects);

		// A schema can't be ambiguous with itself
		possiblyAmbiguous.delete(schema);

		// For each field of schema, remove schema from possiblyAmbiguous that do not have that field
		for (const [key, field] of schema.fields) {
			if (field.kind === FieldKind.Required) {
				const withKey = allObjectKeys.get(key) ?? fail(0xb35 /* missing schema */);
				for (const candidate of possiblyAmbiguous) {
					if (!withKey.has(candidate)) {
						possiblyAmbiguous.delete(candidate);
					}
				}
			}
		}

		if (possiblyAmbiguous.size > 0) {
			// TODO: make this check more permissive.
			// Allow using the type of the field to disambiguate, at least for leaf types.
			// Add "constant" fields which can be used to disambiguate even more cases without adding persisted data: maybe make them optional in constructor?
			// Consider separating unambiguous implicit construction format from constructor arguments at type level, allowing constructor to superset the implicit construction options (ex: optional constant fields).
			// The policy here however must remain at least as conservative as shallowCompatibilityTest in src/simple-tree/toMapTree.ts.

			errors.push(
				`The required fields of ${JSON.stringify(schema.identifier)} are insufficient to differentiate it from the following types: ${formatTypes(possiblyAmbiguous)}. For objects to be considered unambiguous, each must have required fields that do not all occur on any other object in the union.`,
			);
		}
	}
}
