/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JSDoc, Node, SourceFile, SyntaxKind, ts } from "ts-morph";

export interface TypeData {
	readonly name: string;
	readonly kind: string;
	readonly node: Node;
	readonly tags: ReadonlySet<string>;
}

export function getFullTypeName(typeData: TypeData) {
	return `${typeData.kind}_${typeData.name}`;
}

function getTags(docs: JSDoc[]): ReadonlySet<string> {
	const tags: string[] = [];
	for (const comment of docs) {
		for (const tag of comment.getTags()) {
			const name = tag.getTagName();
			tags.push(name);
		}
	}
	return new Set(tags);
}

export function getNodeTypeData(node: Node, namespacePrefix?: string): TypeData[] {
	/*
        handles namespaces e.g.
        export namespace foo{
            export type first: "first";
            export type second: "second";
        }
        this will prefix foo and generate two type data:
        foo.first and foo.second
    */
	if (Node.isModuleDeclaration(node)) {
		const typeData: TypeData[] = [];
		for (const s of node.getStatements()) {
			// only get type data for nodes that are exported from the namespace
			if (Node.isExportable(s) && s.isExported()) {
				typeData.push(...getNodeTypeData(s, node.getName()));
			}
		}
		return typeData;
	}

	/*
        handles variable statements: const foo:number=0, bar:number = 0;
        this just grabs the declarations: foo:number=0 and bar:number
        which we can make type data from
    */
	if (Node.isVariableStatement(node)) {
		const typeData: TypeData[] = [];
		for (const dec of node.getDeclarations()) {
			typeData.push(...getNodeTypeData(dec, namespacePrefix));
		}
		return typeData;
	}

	if (Node.isIdentifier(node)) {
		const typeData: TypeData[] = [];
		node.getDefinitionNodes().forEach((d) =>
			typeData.push(...getNodeTypeData(d, namespacePrefix)),
		);
		return typeData;
	}

	if (
		Node.isClassDeclaration(node) ||
		Node.isEnumDeclaration(node) ||
		Node.isInterfaceDeclaration(node) ||
		Node.isTypeAliasDeclaration(node) ||
		Node.isVariableDeclaration(node) ||
		Node.isFunctionDeclaration(node)
	) {
		const name =
			namespacePrefix !== undefined
				? `${namespacePrefix}.${node.getName()}`
				: // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				  node.getName()!;

		const docs = Node.isVariableDeclaration(node)
			? node.getFirstAncestorByKindOrThrow(SyntaxKind.VariableStatement).getJsDocs()
			: node.getJsDocs();

		const typeData: TypeData[] = [
			{
				name,
				kind: node.getKindName(),
				node,
				tags: getTags(docs),
			},
		];
		return typeData;
	}

	if (Node.isSourceFile(node)) {
		return [...typeDataFromFile(node, namespacePrefix).values()];
	}

	throw new Error(`Unknown Export Kind: ${node.getKindName()}`);
}

export function toTypeString(prefix: string, typeData: TypeData, typePreprocessor: string) {
	const node = typeData.node;
	let typeParams: string | undefined;
	if (
		Node.isInterfaceDeclaration(node) ||
		Node.isTypeAliasDeclaration(node) ||
		Node.isClassDeclaration(node)
	) {
		// does the type take generics that don't have defaults?
		if (
			node.getTypeParameters().length > 0 &&
			node.getTypeParameters().some((tp) => tp.getDefault() === undefined)
		) {
			// it's really hard to build the right type for a generic,
			// so for now we'll just pass any, as it will always work
			// even though it may defeat the utility of a type or related test.
			typeParams = `<${node
				.getTypeParameters()
				.filter((tp) => tp.getDefault() === undefined)
				.map(() => "any")
				.join(",")}>`;
		}
	}

	const typeStringBase = `${prefix}.${typeData.name}${typeParams ?? ""}`;
	switch (node.getKind()) {
		case ts.SyntaxKind.VariableDeclaration:
		case ts.SyntaxKind.FunctionDeclaration:
		case ts.SyntaxKind.Identifier:
			// turn variables and functions into types
			return `${typePreprocessor}<typeof ${typeStringBase}>`;

		default:
			return `${typePreprocessor}<${typeStringBase}>`;
	}
}

export function selectTypePreprocessor(typeData: TypeData): string {
	if (typeData.tags.has("type-test-minimal")) {
		return "MinimalType";
	}
	if (typeData.tags.has("type-test-full")) {
		return "FullType";
	} else {
		return "TypeOnly";
	}
}

export function typeDataFromFile(
	file: SourceFile,
	namespacePrefix?: string,
): Map<string, TypeData> {
	const typeData = new Map<string, TypeData>();
	const exportedDeclarations = file.getExportedDeclarations();
	for (const declarations of exportedDeclarations.values()) {
		for (const dec of declarations) {
			getNodeTypeData(dec, namespacePrefix).forEach((td) => {
				const fullName = getFullTypeName(td);
				if (typeData.has(fullName)) {
					// This system does not properly handle overloads: instead it only keeps the last signature.
					console.warn(`skipping overload for ${fullName}`);
				}
				typeData.set(fullName, td);
			});
		}
	}
	return typeData;
}
