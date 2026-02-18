/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { FieldSchema, TreeNodeSchema } from "@fluidframework/tree";
import {
	ArrayNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	RecordNodeSchema,
} from "@fluidframework/tree/alpha";
import { FieldKind, NodeKind, ValueSchema } from "@fluidframework/tree/internal";
import type { SimpleLeafNodeSchema } from "@fluidframework/tree/internal";

import type { BindableSchema, FunctionWrapper } from "./methodBinding.js";
import { getExposedMethods } from "./methodBinding.js";
import { fluidHandleTypeName } from "./prompt.js";
import { getExposedProperties, type PropertyDef } from "./propertyBinding.js";
import { renderTypeFactoryTypeScript } from "./renderTypeFactoryTypeScript.js";
import type { TypeFactoryOptional, TypeFactoryType } from "./treeAgentTypes.js";
import { isTypeFactoryType } from "./treeAgentTypes.js";
import {
	IdentifierCollisionResolver,
	getFriendlyName,
	isNamedSchema,
	llmDefault,
} from "./utils.js";

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
 * Output of rendering schema metadata into TypeScript declaration text.
 */
export interface SchemaTypeScriptRenderResult {
	schemaText: string;
	hasHelperMethods: boolean;
}

/**
 * Converts schema metadata into TypeScript declarations suitable for prompt inclusion.
 */
export function renderSchemaTypeScript(
	definitions: Iterable<TreeNodeSchema>,
	bindableSchemas: Map<string, BindableSchema>,
): SchemaTypeScriptRenderResult {
	const allSchemas = [...definitions];
	let hasHelperMethods = false;

	// Resolve short name collisions
	const resolver = new IdentifierCollisionResolver();
	for (const schema of allSchemas) {
		resolver.resolve(schema);
	}

	const declarations: string[] = [];
	for (const schema of allSchemas) {
		const identifier = schema.identifier;
		if (!isNamedSchema(identifier)) {
			continue;
		}
		const friendlyName = resolver.resolve(schema);
		const rendered = renderNamedSchema(identifier, friendlyName, schema);
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
		hasHelperMethods,
	};

	function renderNamedSchema(
		identifier: string,
		friendlyName: string,
		schema: TreeNodeSchema,
	): RenderResult | undefined {
		if (schema instanceof ObjectNodeSchema) {
			return renderObjectDeclaration(identifier, friendlyName, schema);
		}
		if (schema instanceof ArrayNodeSchema) {
			return renderArrayDeclaration(identifier, friendlyName, schema);
		}
		if (schema instanceof MapNodeSchema) {
			return renderMapDeclaration(identifier, friendlyName, schema);
		}
		if (schema instanceof RecordNodeSchema) {
			return renderRecordDeclaration(identifier, friendlyName, schema);
		}
		if (schema.kind === NodeKind.Leaf) {
			const leafSchema = schema as unknown as SimpleLeafNodeSchema;
			return {
				declaration: `type ${friendlyName} = ${renderLeaf(leafSchema.leafKind)};`,
				description: leafSchema.metadata?.description,
			};
		}
		return undefined;
	}

	function renderObjectDeclaration(
		definition: string,
		name: string,
		schema: ObjectNodeSchema,
	): RenderResult {
		const fieldLines: string[] = [];
		const fieldNames = new Set<string>();

		for (const [fieldName, fieldSchema] of schema.fields) {
			fieldNames.add(fieldName);
			fieldLines.push(...renderFieldLine(fieldName, fieldSchema));
		}

		const { methods, properties } = getBoundMembers(definition);
		ensureNoMemberConflicts(definition, fieldNames, methods, properties);
		fieldLines.push(...renderPropertyLines(properties));
		fieldLines.push(...renderMethodLines(methods));

		const members = fieldLines.map((line) => `    ${line}`).join("\n");
		const body = members === "" ? "" : `\n${members}`;
		return {
			declaration: `interface ${name} {${body}\n}`,
			description: schema.metadata?.description,
		};
	}

	function renderArrayDeclaration(
		definition: string,
		name: string,
		schema: ArrayNodeSchema,
	): RenderResult {
		const elementTypes = renderAllowedTypes(schema.childTypes);
		const base = `${formatExpression(elementTypes)}[]`;
		const binding = renderBindingIntersection(definition);
		return {
			declaration: `type ${name} = ${base}${binding.suffix};`,
			description: describeBinding(schema.metadata?.description, "array", binding),
		};
	}

	function renderMapDeclaration(
		definition: string,
		name: string,
		schema: MapNodeSchema,
	): RenderResult {
		const valueType = renderAllowedTypes(schema.childTypes);
		const base = `Map<string, ${valueType.text}>`;
		const binding = renderBindingIntersection(definition);
		return {
			declaration: `type ${name} = ${base}${binding.suffix};`,
			description: describeBinding(schema.metadata?.description, "map", binding),
		};
	}

	function renderRecordDeclaration(
		definition: string,
		name: string,
		schema: RecordNodeSchema,
	): RenderResult {
		const valueType = renderAllowedTypes(schema.childTypes);
		const base = `Record<string, ${valueType.text}>`;
		const binding = renderBindingIntersection(definition);
		return {
			declaration: `type ${name} = ${base}${binding.suffix};`,
			description: describeBinding(schema.metadata?.description, "record", binding),
		};
	}

	function renderFieldLine(name: string, field: FieldSchema): string[] {
		const { comment, optional, type } = describeField(field);
		const lines: string[] = [];
		if (comment !== undefined && comment !== "") {
			for (const note of comment.split("\n")) {
				lines.push(`// ${note}`);
			}
		}
		lines.push(`${name}${optional ? "?" : ""}: ${type};`);
		return lines;
	}

	function describeField(field: FieldSchema): {
		comment?: string;
		optional: boolean;
		type: string;
	} {
		const allowedTypes = renderAllowedTypes(field.allowedTypeSet);
		const type = formatExpression(allowedTypes);
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

	function renderBindingIntersection(definition: string): BindingIntersectionResult {
		const { methods, properties } = getBoundMembers(definition);
		const propertyLines = renderPropertyLines(properties);
		const methodLines = renderMethodLines(methods);

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

	function renderMethodLines(methods: Record<string, FunctionWrapper>): string[] {
		const lines: string[] = [];
		for (const [name, method] of Object.entries(methods)) {
			if (method.description !== undefined && method.description !== "") {
				for (const note of method.description.split("\n")) {
					lines.push(`// ${note}`);
				}
			}
			const methodString = formatMethod(name, method);
			const methodLines = methodString.split("\n");
			lines.push(...methodLines);
		}
		if (lines.length > 0) {
			hasHelperMethods = true;
		}
		return lines;
	}

	function getBoundMembers(definition: string): BoundMembers {
		const schemaClass = bindableSchemas.get(definition);
		if (schemaClass === undefined) {
			return { methods: {}, properties: {} };
		}
		return {
			methods: getExposedMethods(schemaClass).methods,
			properties: getExposedProperties(schemaClass).properties,
		};
	}

	function renderAllowedTypes(allowedTypes: Iterable<TreeNodeSchema>): TypeExpression {
		const expressions: TypeExpression[] = [];
		for (const schema of allowedTypes) {
			expressions.push(renderTypeReference(schema));
		}
		if (expressions.length === 0) {
			return { precedence: TypePrecedence.Object, text: "never" };
		}
		if (expressions.length === 1) {
			return expressions[0] ?? { precedence: TypePrecedence.Object, text: "never" };
		}
		return {
			precedence: TypePrecedence.Union,
			text: expressions
				.map((expr) => formatExpression(expr, TypePrecedence.Union))
				.join(" | "),
		};
	}

	function renderTypeReference(schema: TreeNodeSchema): TypeExpression {
		if (isNamedSchema(schema.identifier)) {
			return {
				precedence: TypePrecedence.Object,
				text: resolver.resolve(schema),
			};
		}
		return renderInlineSchema(schema);
	}

	function renderInlineSchema(schema: TreeNodeSchema): TypeExpression {
		if (schema instanceof ObjectNodeSchema) {
			return renderInlineObject(schema);
		}
		if (schema instanceof ArrayNodeSchema) {
			return renderInlineArray(schema);
		}
		if (schema instanceof MapNodeSchema) {
			return renderInlineMap(schema);
		}
		if (schema instanceof RecordNodeSchema) {
			return renderInlineRecord(schema);
		}
		if (schema.kind === NodeKind.Leaf) {
			return {
				precedence: TypePrecedence.Object,
				text: renderLeaf((schema as unknown as SimpleLeafNodeSchema).leafKind),
			};
		}
		return { precedence: TypePrecedence.Object, text: "unknown" };
	}

	function renderInlineObject(schema: ObjectNodeSchema): TypeExpression {
		const fieldLines: string[] = [];
		for (const [fieldName, fieldSchema] of schema.fields) {
			fieldLines.push(...renderFieldLine(fieldName, fieldSchema));
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

	function renderInlineArray(schema: ArrayNodeSchema): TypeExpression {
		const elementTypes = renderAllowedTypes(schema.childTypes);
		return {
			precedence: TypePrecedence.Object,
			text: `${formatExpression(elementTypes)}[]`,
		};
	}

	function renderInlineMap(schema: MapNodeSchema): TypeExpression {
		const valueType = renderAllowedTypes(schema.childTypes);
		return {
			precedence: TypePrecedence.Object,
			text: `Map<string, ${valueType.text}>`,
		};
	}

	function renderInlineRecord(schema: RecordNodeSchema): TypeExpression {
		const valueType = renderAllowedTypes(schema.childTypes);
		return {
			precedence: TypePrecedence.Object,
			text: `Record<string, ${valueType.text}>`,
		};
	}
}

function describeBinding(
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

function renderPropertyLines(properties: Record<string, PropertyDef>): string[] {
	const lines: string[] = [];
	for (const [name, property] of Object.entries(properties)) {
		if (property.description !== undefined && property.description !== "") {
			for (const note of property.description.split("\n")) {
				lines.push(`// ${note}`);
			}
		}
		const modifier = property.readOnly ? "readonly " : "";
		const typeString = renderTypeFactoryTypeScript(property.schema, getFriendlyName, 0);
		const propertyLine = `${modifier}${name}: ${typeString};`;
		// Split multi-line type strings and add to lines array
		const propertyLines = propertyLine.split("\n");
		lines.push(...propertyLines);
	}
	return lines;
}

function formatMethod(name: string, method: FunctionWrapper): string {
	const args: string[] = [];
	for (const [argName, argType] of method.args) {
		const { innerType, optional } = unwrapOptional(argType);
		const renderedType = renderTypeFactoryTypeScript(innerType, getFriendlyName, 0);
		args.push(`${argName}${optional ? "?" : ""}: ${renderedType}`);
	}
	if (method.rest !== null) {
		args.push(`...rest: ${renderTypeFactoryTypeScript(method.rest, getFriendlyName, 0)}[]`);
	}
	return `${name}(${args.join(", ")}): ${renderTypeFactoryTypeScript(method.returns, getFriendlyName, 0)};`;
}

function renderLeaf(leafKind: ValueSchema): string {
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
		case ValueSchema.FluidHandle: {
			return fluidHandleTypeName;
		}
		default: {
			throw new Error(`Unsupported leaf kind.`);
		}
	}
}

function formatExpression(
	expression: TypeExpression,
	minPrecedence: TypePrecedence = TypePrecedence.Object,
): string {
	return expression.precedence < minPrecedence ? `(${expression.text})` : expression.text;
}

/**
 * Detects optional type factory wrappers so argument lists can keep TypeScript optional markers in sync.
 */
function unwrapOptional(type: TypeFactoryType): {
	innerType: TypeFactoryType;
	optional: boolean;
} {
	// Handle type factory optional type
	if (isTypeFactoryType(type) && type._kind === "optional") {
		return { innerType: (type as TypeFactoryOptional).innerType, optional: true };
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
