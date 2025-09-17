/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiItemKind,
	ExcerptTokenKind,
	type HeritageType,
	type ApiInterface,
	type ApiProperty,
	type IResolveDeclarationReferenceResult,
} from "@microsoft/api-extractor-model";
import { expect } from "chai";

import type { ApiTypeLike } from "../../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../../configuration/index.js";
import { getTypeMembers } from "../InheritanceUtilities.js";

function createMockContainerKey(displayName: string, kind: ApiItemKind): string {
	return `${displayName}|${kind}`;
}

function createMockHeritageType(type: ApiTypeLike): HeritageType {
	return {
		excerpt: {
			spannedTokens: [
				{
					kind: ExcerptTokenKind.Reference,
					// Test config will need to handle this mock format
					canonicalReference: type.displayName,
				},
			],
		},
	} as unknown as HeritageType;
}

function createMockProperty(displayName: string): ApiProperty {
	return {
		kind: ApiItemKind.Property,
		displayName,
		containerKey: createMockContainerKey(displayName, ApiItemKind.Property),
	} as unknown as ApiProperty;
}

function createMockInterface(
	displayName: string,
	members: readonly ApiProperty[],
	extendsTypes: readonly ApiInterface[],
): ApiInterface {
	return {
		kind: ApiItemKind.Interface,
		displayName,
		members,
		containerKey: createMockContainerKey(displayName, ApiItemKind.Interface),
		extendsTypes: extendsTypes.map((extendsType) => createMockHeritageType(extendsType)),
	} as unknown as ApiInterface;
}

describe("InheritanceUtilities tests", () => {
	describe("getTypeMembers", () => {
		it("Interface", () => {
			// Define inputs
			const aFoo = createMockProperty("foo");
			const aBar = createMockProperty("bar");
			const aBaz = createMockProperty("baz");
			const a = createMockInterface("A", [aFoo, aBar, aBaz], []);

			const bBaz = createMockProperty("baz");
			const bQux = createMockProperty("qux");
			const b = createMockInterface("B", [bBaz, bQux], [a]);

			const cBar = createMockProperty("bar");
			const cBaz = createMockProperty("baz");
			const c = createMockInterface("C", [cBar, cBaz], [b]);

			const typeReferences = new Map<string, ApiInterface>([
				["A", a],
				["B", b],
				["C", c],
			]);

			const config = {
				exclude: () => false,
				apiModel: {
					resolveDeclarationReference: (
						reference: string,
					): IResolveDeclarationReferenceResult => {
						return {
							errorMessage: undefined,
							resolvedApiItem: typeReferences.get(reference),
						} as unknown as IResolveDeclarationReferenceResult;
					},
				},
			} as unknown as ApiItemTransformationConfiguration;

			const aMembers = getTypeMembers(a, config);
			expect(aMembers).to.deep.equal([
				{
					kind: "own",
					item: aFoo,
					overrides: undefined,
				},
				{
					kind: "own",
					item: aBar,
					overrides: undefined,
				},
				{
					kind: "own",
					item: aBaz,
					overrides: undefined,
				},
			]);

			const bMembers = getTypeMembers(b, config);
			expect(bMembers).to.deep.equal([
				{
					kind: "inherited",
					item: aFoo,
					inheritedFrom: a,
				},
				{
					kind: "inherited",
					item: aBar,
					inheritedFrom: a,
				},
				{
					kind: "own",
					item: bBaz,
					overrides: aBaz,
				},
				{
					kind: "own",
					item: bQux,
					overrides: undefined,
				},
			]);

			const cMembers = getTypeMembers(c, config);
			expect(cMembers).to.deep.equal([
				{
					kind: "inherited",
					item: aFoo,
					inheritedFrom: a,
				},
				{
					kind: "inherited",
					item: bQux,
					inheritedFrom: b,
				},
				{
					kind: "own",
					item: cBar,
					overrides: aBar,
				},
				{
					kind: "own",
					item: bBaz,
					overrides: bBaz,
				},
			]);
		});
	});
});
