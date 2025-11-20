/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { FieldKind, NodeKind, ValueSchema } from "@fluidframework/tree/internal";
import type {
	SimpleArrayNodeSchema,
	SimpleFieldSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	SimpleRecordNodeSchema,
} from "@fluidframework/tree/internal";
import { z } from "zod";

import type { BindableSchema, FunctionWrapper } from "./methodBinding.js";
import { getExposedMethods } from "./methodBinding.js";
import { getExposedProperties, type PropertyDef } from "./propertyBinding.js";
import { formatZodType, isNamedSchema, llmDefault, unqualifySchema } from "./utils.js";

interface BoundMembers {
	methods: Record<string, FunctionWrapper>;
	properties: Record<string, PropertyDef>;
}

interface RenderResult {
	declaration: string;
	description?: string;
}

interface BindingIntersectionResult {
	hasMethods: boolean;
	hasProperties: boolean;
	suffix: string;
}

interface TypeExpression {
	precedence: TypePrecedence;
	text: string;
}

const enum TypePrecedence {
	Union = 0,
	Intersection = 1,
	Object = 2,
}

/**
 * Converts schema metadata into TypeScript declarations suitable for prompt inclusion.
 */
export class SchemaTypeScriptRenderer {
	public hasHelperMethods: boolean = false;

	private readonly friendlyNames = new Map<string, string>();

	public constructor(
		private readonly definitions: ReadonlyMap<string, SimpleNodeSchema>,
		private readonly bindableSchemas: Map<string, BindableSchema>,
	) {
		// Pre-compute human-friendly names so that repeated lookups stay cheap while printing.
		for (const identifier of definitions.keys()) {
			if (isNamedSchema(identifier)) {
				this.friendlyNames.set(identifier, unqualifySchema(identifier));
			}
		}
	}

	/**
	 * Renders all named schema definitions into a single TypeScript snippet.
	 */
	public render(): {
		/**
		 * Fully rendered TypeScript declaration text (trailing newline included when non-empty).
		 */
		schemaText: string;
		/**
		 * Whether any helper methods (does not consider properties) were exposed.
		 */
		hasHelperMethods: boolean;
	} {
		const declarations: string[] = [];

		for (const [identifier, schema] of this.definitions) {
			if (!isNamedSchema(identifier)) {
				continue;
			}
			const friendlyName = this.friendlyNames.get(identifier) ?? unqualifySchema(identifier);
			const rendered = this.renderNamedSchema(identifier, friendlyName, schema);
			if (rendered === undefined) {
				continue;
			}

			const lines: string[] = [];
			if (rendered.description !== undefined && rendered.description !== "") {
				for (const comment of rendered.description.split("\n")) {
					lines.push(`// ${comment}`);
				}
			}
			lines.push(rendered.declaration);
			declarations.push(lines.join("\n"));
		}

		const schemaText = declarations.join("\n\n");
		return {
			schemaText: schemaText === "" ? "" : `${schemaText}\n`,
			hasHelperMethods: this.hasHelperMethods,
		};
	}

	/**
	 * Chooses the appropriate renderer for the provided schema definition.
	 */
	private renderNamedSchema(
		identifier: string,
		friendlyName: string,
		schema: SimpleNodeSchema,
	): RenderResult | undefined {
		switch (schema.kind) {
			case NodeKind.Object: {
				return this.renderObjectDeclaration(identifier, friendlyName, schema);
			}
			case NodeKind.Array: {
				return this.renderArrayDeclaration(identifier, friendlyName, schema);
			}
			case NodeKind.Map: {
				return this.renderMapDeclaration(identifier, friendlyName, schema);
			}
			case NodeKind.Record: {
				return this.renderRecordDeclaration(identifier, friendlyName, schema);
			}
			case NodeKind.Leaf: {
				return {
					declaration: `type ${friendlyName} = ${this.renderLeaf(schema.leafKind)};`,
					description: schema.metadata?.description,
				};
			}
			default: {
				return undefined;
			}
		}
	}

	/**
	 * Emits the interface for a named object schema, including exposed helpers.
	 */
	private renderObjectDeclaration(
		definition: string,
		name: string,
		schema: SimpleObjectNodeSchema,
	): RenderResult {
		const fieldLines: string[] = [];
		const fieldNames = new Set<string>();

		// First expand the structural fields in definition order.
		for (const [fieldName, fieldSchema] of schema.fields) {
			fieldNames.add(fieldName);
			fieldLines.push(...this.renderFieldLine(fieldName, fieldSchema));
		}

		// Then merge in any bound helper properties/methods while ensuring there are no name collisions.
		const { methods, properties } = this.getBoundMembers(definition);
		ensureNoMemberConflicts(definition, fieldNames, methods, properties);
		fieldLines.push(...this.renderPropertyLines(properties));
		fieldLines.push(...this.renderMethodLines(methods));

		const members = fieldLines.map((line) => `    ${line}`).join("\n");
		const body = members === "" ? "" : `\n${members}`;
		return {
			declaration: `interface ${name} {${body}\n}`,
			description: schema.metadata?.description,
		};
	}

	/**
	 * Emits the alias for a named array schema, including helper bindings when present.
	 */
	private renderArrayDeclaration(
		definition: string,
		name: string,
		schema: SimpleArrayNodeSchema,
	): RenderResult {
		const elementTypes = this.renderAllowedTypes(schema.simpleAllowedTypes.keys());
		const base = `${this.formatExpression(elementTypes)}[]`;
		const binding = this.renderBindingIntersection(definition);
		return {
			declaration: `type ${name} = ${base}${binding.suffix};`,
			description: this.describeBinding(schema.metadata?.description, "array", binding),
		};
	}

	/**
	 * Emits the alias for a named map schema, including helper bindings when present.
	 */
	private renderMapDeclaration(
		definition: string,
		name: string,
		schema: SimpleMapNodeSchema,
	): RenderResult {
		const valueType = this.renderAllowedTypes(schema.simpleAllowedTypes.keys());
		const base = `Map<string, ${valueType.text}>`;
		const binding = this.renderBindingIntersection(definition);
		return {
			declaration: `type ${name} = ${base}${binding.suffix};`,
			description: this.describeBinding(schema.metadata?.description, "map", binding),
		};
	}

	/**
	 * Emits the alias for a named record schema, including helper bindings when present.
	 */
	private renderRecordDeclaration(
		definition: string,
		name: string,
		schema: SimpleRecordNodeSchema,
	): RenderResult {
		const valueType = this.renderAllowedTypes(schema.simpleAllowedTypes.keys());
		const base = `Record<string, ${valueType.text}>`;
		const binding = this.renderBindingIntersection(definition);
		return {
			declaration: `type ${name} = ${base}${binding.suffix};`,
			description: this.describeBinding(schema.metadata?.description, "record", binding),
		};
	}

	/**
	 * Builds a single TypeScript property signature (and optional inline comment) for the provided field.
	 */
	private renderFieldLine(name: string, field: SimpleFieldSchema): string[] {
		const { comment, optional, type } = this.describeField(field);
		const lines: string[] = [];
		if (comment !== undefined && comment !== "") {
			for (const note of comment.split("\n")) {
				lines.push(`// ${note}`);
			}
		}
		lines.push(`${name}${optional ? "?" : ""}: ${type};`);
		return lines;
	}

	/**
	 * Translates a field schema into a TypeScript property declaration with optional inline guidance.
	 */
	private describeField(field: SimpleFieldSchema): {
		comment?: string;
		optional: boolean;
		type: string;
	} {
		const allowedTypes = this.renderAllowedTypes(field.simpleAllowedTypes.keys());
		const type = this.formatExpression(allowedTypes);
		const optional = field.kind !== FieldKind.Required;
		const customMetadata = field.metadata.custom as
			| Record<string | symbol, unknown>
			| undefined;
		const getDefault = customMetadata?.[llmDefault];

		if (getDefault !== undefined) {
			if (typeof getDefault !== "function") {
				throw new UsageError(
					`Expected value of ${llmDefault.description} property to be a function, but got ${typeof getDefault}`,
				);
			}
			if (field.kind !== FieldKind.Optional) {
				throw new UsageError(
					`The ${llmDefault.description} property is only permitted on optional fields.`,
				);
			}
			return {
				optional,
				type,
				comment:
					"Do not populate this field. It will be automatically supplied by the system after insertion.",
			};
		}

		if (field.kind === FieldKind.Identifier) {
			return {
				optional: true,
				type,
				comment:
					"This is an ID automatically generated by the system. Do not supply it when constructing a new object.",
			};
		}

		const description = field.metadata?.description;
		return {
			optional,
			type,
			comment: description === undefined || description === "" ? undefined : description,
		};
	}

	/**
	 * Appends helper methods/properties as an intersection type when needed.
	 */
	private renderBindingIntersection(definition: string): BindingIntersectionResult {
		const { methods, properties } = this.getBoundMembers(definition);
		const propertyLines = this.renderPropertyLines(properties);
		const methodLines = this.renderMethodLines(methods);

		if (propertyLines.length === 0 && methodLines.length === 0) {
			return { hasMethods: false, hasProperties: false, suffix: "" };
		}

		const lines = [...propertyLines, ...methodLines].map((line) => `    ${line}`);
		const suffix = ` & {\n${lines.join("\n")}\n}`;
		return {
			hasMethods: methodLines.length > 0,
			hasProperties: propertyLines.length > 0,
			suffix,
		};
	}

	/**
	 * Generates a description that alerts the LLM about helper bindings when present.
	 */
	private describeBinding(
		description: string | undefined,
		typeLabel: "array" | "map" | "record",
		binding: BindingIntersectionResult,
	): string | undefined {
		let note = "";
		if (binding.hasMethods && binding.hasProperties) {
			note = `Note: this ${typeLabel} has custom user-defined methods and properties directly on it.`;
		} else if (binding.hasMethods) {
			note = `Note: this ${typeLabel} has custom user-defined methods directly on it.`;
		} else if (binding.hasProperties) {
			note = `Note: this ${typeLabel} has custom user-defined properties directly on it.`;
		}

		if (note === "") {
			return description === undefined || description === "" ? undefined : description;
		}
		if (description === undefined || description === "") {
			return note;
		}
		return `${description} - ${note}`;
	}

	/**
	 * Formats helper properties that are bound onto the schema.
	 */
	private renderPropertyLines(properties: Record<string, PropertyDef>): string[] {
		const lines: string[] = [];
		for (const [name, property] of Object.entries(properties)) {
			if (property.description !== undefined && property.description !== "") {
				for (const note of property.description.split("\n")) {
					lines.push(`// ${note}`);
				}
			}
			const modifier = property.readOnly ? "readonly " : "";
			lines.push(`${modifier}${name}: ${formatZodType(property.schema)};`);
		}
		return lines;
	}

	/**
	 * Formats helper method signatures and marks that helper instructions are required.
	 */
	private renderMethodLines(methods: Record<string, FunctionWrapper>): string[] {
		const lines: string[] = [];
		for (const [name, method] of Object.entries(methods)) {
			if (method.description !== undefined && method.description !== "") {
				for (const note of method.description.split("\n")) {
					lines.push(`// ${note}`);
				}
			}
			lines.push(this.formatMethod(name, method));
		}
		if (lines.length > 0) {
			// Downstream prompt builders need to know when helper instructions apply.
			this.hasHelperMethods = true;
		}
		return lines;
	}

	/**
	 * Formats a single helper method signature for inclusion in the generated interface.
	 */
	private formatMethod(name: string, method: FunctionWrapper): string {
		const args: string[] = [];
		for (const [argName, argType] of method.args) {
			const { innerType, optional } = unwrapOptional(argType);
			const renderedType = formatZodType(innerType);
			args.push(`${argName}${optional ? "?" : ""}: ${renderedType}`);
		}
		if (method.rest !== null) {
			// Preserve rest parameter arity so the LLM knows additional arguments are accepted.
			args.push(`...rest: ${formatZodType(method.rest)}[]`);
		}
		const line = `${name}(${args.join(", ")}): ${formatZodType(method.returns)};`;
		return line;
	}

	/**
	 * Retrieves any helper bindings wired up for the provided schema identifier.
	 */
	private getBoundMembers(definition: string): BoundMembers {
		const schemaClass = this.bindableSchemas.get(definition);
		if (schemaClass === undefined) {
			return { methods: {}, properties: {} };
		}
		return {
			methods: getExposedMethods(schemaClass).methods,
			properties: getExposedProperties(schemaClass).properties,
		};
	}

	/**
	 * Resolves the union of allowed node identifiers into a single TypeScript expression.
	 */
	private renderAllowedTypes(allowedTypes: Iterable<string>): TypeExpression {
		const expressions: TypeExpression[] = [];
		for (const identifier of allowedTypes) {
			expressions.push(this.renderTypeReference(identifier));
		}
		if (expressions.length === 0) {
			// Surface the impossibility explicitly so the prompt communicates the restriction.
			return { precedence: TypePrecedence.Object, text: "never" };
		}
		if (expressions.length === 1) {
			return expressions[0] ?? { precedence: TypePrecedence.Object, text: "never" };
		}
		return {
			precedence: TypePrecedence.Union,
			text: expressions
				.map((expr) => this.formatExpression(expr, TypePrecedence.Union))
				.join(" | "),
		};
	}

	/**
	 * Resolves either a friendly named reference or inlines the schema for anonymous identifiers.
	 */
	private renderTypeReference(identifier: string): TypeExpression {
		const schema = this.definitions.get(identifier);
		if (schema === undefined) {
			// Referenced identifiers outside the printable set still need stable friendly names.
			return {
				precedence: TypePrecedence.Object,
				text: this.friendlyNames.get(identifier) ?? unqualifySchema(identifier),
			};
		}
		if (isNamedSchema(identifier)) {
			return {
				precedence: TypePrecedence.Object,
				text: this.friendlyNames.get(identifier) ?? unqualifySchema(identifier),
			};
		}
		return this.renderInlineSchema(schema);
	}

	/**
	 * Inlines structural declarations for anonymous nodes that are referenced from other schemas.
	 */
	private renderInlineSchema(schema: SimpleNodeSchema): TypeExpression {
		switch (schema.kind) {
			case NodeKind.Object: {
				return this.renderInlineObject(schema);
			}
			case NodeKind.Array: {
				return this.renderInlineArray(schema);
			}
			case NodeKind.Map: {
				return this.renderInlineMap(schema);
			}
			case NodeKind.Record: {
				return this.renderInlineRecord(schema);
			}
			case NodeKind.Leaf: {
				return { precedence: TypePrecedence.Object, text: this.renderLeaf(schema.leafKind) };
			}
			default: {
				return { precedence: TypePrecedence.Object, text: "unknown" };
			}
		}
	}

	/**
	 * Builds an inline object literal for anonymous schemas.
	 */
	private renderInlineObject(schema: SimpleObjectNodeSchema): TypeExpression {
		const fieldLines: string[] = [];
		for (const [fieldName, fieldSchema] of schema.fields) {
			fieldLines.push(...this.renderFieldLine(fieldName, fieldSchema));
		}
		const members = fieldLines.map((line) => `    ${line}`).join("\n");
		const text =
			members === ""
				? "{\n}"
				: `{
${members}
}`;
		return { precedence: TypePrecedence.Object, text };
	}

	/**
	 * Builds an inline array declaration for anonymous schemas.
	 */
	private renderInlineArray(schema: SimpleArrayNodeSchema): TypeExpression {
		const elementTypes = this.renderAllowedTypes(schema.simpleAllowedTypes.keys());
		return {
			precedence: TypePrecedence.Object,
			text: `${this.formatExpression(elementTypes)}[]`,
		};
	}

	/**
	 * Builds an inline map declaration for anonymous schemas.
	 */
	private renderInlineMap(schema: SimpleMapNodeSchema): TypeExpression {
		const valueType = this.renderAllowedTypes(schema.simpleAllowedTypes.keys());
		return {
			precedence: TypePrecedence.Object,
			text: `Map<string, ${valueType.text}>`,
		};
	}

	/**
	 * Builds an inline record declaration for anonymous schemas.
	 */
	private renderInlineRecord(schema: SimpleRecordNodeSchema): TypeExpression {
		const valueType = this.renderAllowedTypes(schema.simpleAllowedTypes.keys());
		return {
			precedence: TypePrecedence.Object,
			text: `Record<string, ${valueType.text}>`,
		};
	}

	/**
	 * Maps SharedTree leaf kinds to their equivalent TypeScript primitive representations.
	 */
	private renderLeaf(leafKind: ValueSchema): string {
		switch (leafKind) {
			case ValueSchema.Boolean: {
				return "boolean";
			}
			case ValueSchema.Number: {
				return "number";
			}
			case ValueSchema.String: {
				return "string";
			}
			case ValueSchema.Null: {
				return "null";
			}
			default: {
				throw new Error(`Unsupported leaf kind ${NodeKind[leafKind]}.`);
			}
		}
	}

	/**
	 * Wraps expressions in parentheses when they are being used in a context with higher precedence.
	 */
	private formatExpression(
		expression: TypeExpression,
		minPrecedence: TypePrecedence = TypePrecedence.Object,
	): string {
		return expression.precedence < minPrecedence ? `(${expression.text})` : expression.text;
	}
}

/**
 * Detects optional zod wrappers so argument lists can keep TypeScript optional markers in sync.
 */
function unwrapOptional(type: z.ZodTypeAny): { innerType: z.ZodTypeAny; optional: boolean } {
	if (type instanceof z.ZodOptional) {
		const inner = type.unwrap() as z.ZodTypeAny;
		return { innerType: inner, optional: true };
	}
	return { innerType: type, optional: false };
}

/**
 * Verifies that helper members do not clobber structural fields and fails fast if they do.
 */
function ensureNoMemberConflicts(
	definition: string,
	fieldNames: ReadonlySet<string>,
	methods: Record<string, FunctionWrapper>,
	properties: Record<string, PropertyDef>,
): void {
	for (const name of Object.keys(methods)) {
		if (fieldNames.has(name)) {
			throw new UsageError(
				`Method ${name} conflicts with field of the same name in schema ${definition}`,
			);
		}
	}
	for (const name of Object.keys(properties)) {
		if (fieldNames.has(name)) {
			throw new UsageError(
				`Property ${name} conflicts with field of the same name in schema ${definition}`,
			);
		}
	}
}
