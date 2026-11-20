/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import {
	createTypeExcerpt,
	createInterface,
	createMethod,
	createProperty,
	createReferenceToken,
} from "../../../test/index.js";
import {
	bindBase,
	getMemberType,
	localBindings,
	rebind,
	type TypeBindings,
} from "../InheritedMemberTypes.js";

/**
 * Projects each binding to its displayed type text for assertions.
 *
 * @remarks
 * Keeping keys whose value is `undefined` distinguishes an unresolved parameter from one that was never declared.
 * Tests that need to distinguish identically spelled types inspect their declaration references separately.
 */
function getBindingTexts(bindings: TypeBindings): Record<string, string | undefined> {
	return Object.fromEntries([...bindings].map(([name, value]) => [name, value?.text]));
}

describe("InheritedMemberTypes", () => {
	describe("localBindings", () => {
		it("returns no bindings for a declaration without type parameters", () => {
			expect(localBindings(createInterface("Container")).size).to.equal(0);
		});

		it("binds each name to itself in the declaring scope, not to its default", () => {
			// Inside `Container<T = string, U = T[]>`, T and U are still parameters.
			// Their defaults apply at a use of Container that omits an argument, not at the declaration.
			const bindings = localBindings(
				createInterface("Container", { typeParameters: { T: "string", U: "T[]" } }),
			);
			expect(getBindingTexts(bindings)).to.deep.equal({ T: "T", U: "U" });
		});
	});

	describe("bindBase", () => {
		const base = createInterface("Container", { typeParameters: { T: "string", U: "T[]" } });

		it("evaluates omitted defaults in declaration order", () => {
			expect(getBindingTexts(bindBase(base, [], createInterface("Container")))).to.deep.equal({
				T: "string",
				U: "string[]",
			});
		});

		it("resolves supplied names in the derived scope and dependent defaults in the base scope", () => {
			// Model `Derived<U = number> extends Container<U>`. The supplied U belongs to Derived.
			// Container's own U defaults to T[], which therefore means an array of Derived's U, not number[].
			const bindings = bindBase(
				base,
				[createTypeExcerpt("U")],
				createInterface("Container", { typeParameters: { U: "number" } }),
			);
			expect(getBindingTexts(bindings)).to.deep.equal({ T: "U", U: "U[]" });
		});

		it("uses an explicitly supplied argument instead of an unresolved default", () => {
			const bindings = bindBase(
				createInterface("Container", { typeParameters: { T: undefined, U: "T" } }),
				[createTypeExcerpt("Unknown"), createTypeExcerpt("boolean")],
				createInterface("Container"),
			);
			expect(getBindingTexts(bindings)).to.deep.equal({ T: undefined, U: "boolean" });
		});

		it("keeps an unresolved binding and any dependent default unresolved", () => {
			// T has no default. Omitting its argument and supplying an unsupported mapped type
			// both leave T unresolved. Only U depends on T; V can still use its own default.
			for (const supplied of [[], [createTypeExcerpt("{ [K in keyof X]: X[K] }")]]) {
				const bindings = bindBase(
					createInterface("Container", {
						typeParameters: { T: undefined, U: "T", V: "number" },
					}),
					supplied,
					createInterface("Container"),
				);
				expect(getBindingTexts(bindings)).to.deep.equal({
					T: undefined,
					U: undefined,
					V: "number",
				});
			}
		});
	});

	describe("rebind", () => {
		it("substitutes across an edge without changing the original bindings", () => {
			// Model `Middle<T> extends Base<T[]>` followed by `Leaf extends Middle<string | number>`.
			// Base's Value is T[] on Middle and (string | number)[] on Leaf; both views must remain usable.
			const original = new Map([["Value", createTypeExcerpt("T[]")]]);
			const edge = new Map([["T", createTypeExcerpt("string | number")]]);
			expect(getBindingTexts(rebind(original, edge, undefined))).to.deep.equal({
				Value: "(string | number)[]",
			});
			expect(getBindingTexts(original)).to.deep.equal({ Value: "T[]" });
		});

		it("preserves agreeing paths even if the plain text tokens are split differently", () => {
			const target = createReferenceToken("Thing", "pkg-a!Thing:interface");
			const left = createTypeExcerpt(target, "[]");
			const right = createTypeExcerpt(target, "[", "]");

			// The empty edge introduces no substitutions. Both paths display Thing[] and link to the same
			// declaration, so splitting the brackets into separate tokens must not create a conflict.
			const result = rebind(new Map([["T", left]]), new Map(), new Map([["T", right]]));
			expect(result.get("T")?.text).to.equal("Thing[]");
			expect(result.get("T")?.spannedTokens[0].canonicalReference?.toString()).to.equal(
				target.canonicalReference,
			);
		});

		it("leaves only the conflicting parameter unresolved when identical names link to different declarations", () => {
			const current = new Map([
				["T", createTypeExcerpt(createReferenceToken("Thing", "pkg-a!Thing:interface"))],
				["U", createTypeExcerpt("number")],
			]);
			const previous = new Map([
				["T", createTypeExcerpt(createReferenceToken("Thing", "pkg-b!Thing:interface"))],
				["U", createTypeExcerpt("number")],
			]);
			expect(getBindingTexts(rebind(current, new Map(), previous))).to.deep.equal({
				T: undefined,
				U: "number",
			});
		});

		it("does not equate references to the same declaration at different positions", () => {
			// Both excerpts display `Thing | Thing`. Only the first occurrence is linked in one;
			// only the second is linked in the other. Comparing text and link targets alone would miss this.
			const target = createReferenceToken("Thing", "pkg-a!Thing:interface");
			const current = new Map([["T", createTypeExcerpt(target, " | Thing")]]);
			const previous = new Map([["T", createTypeExcerpt("Thing | ", target)]]);
			expect(getBindingTexts(rebind(current, new Map(), previous))).to.deep.equal({
				T: undefined,
			});
		});

		it("does not recover a binding that was already ambiguous on another path", () => {
			const current = new Map([["T", createTypeExcerpt("number")]]);

			// A previous entry of T -> undefined records a conflict; it is not the absence of a previous path.
			expect(
				getBindingTexts(rebind(current, new Map(), new Map([["T", undefined]]))),
			).to.deep.equal({ T: undefined });
		});
	});

	describe("getMemberType", () => {
		it("returns the original excerpt without a fallback label when there is nothing to specialize", () => {
			const member = createProperty("value", { type: "number" });
			const result = getMemberType(member, new Map());
			expect(result.excerpt).to.equal(member.propertyTypeExcerpt);
			expect(result.asDeclared).to.equal(false);
		});

		it("specializes a property's type while preserving precedence and declaration links", () => {
			const target = createReferenceToken("Thing", "pkg-a!Thing:interface");
			const result = getMemberType(
				createProperty("value", { type: "T[]" }),
				new Map([["T", createTypeExcerpt(target, " | string")]]),
			);
			expect(result.excerpt.text).to.equal("(Thing | string)[]");
			expect(
				result.excerpt.spannedTokens
					.find((token) => token.text === "Thing")
					?.canonicalReference?.toString(),
			).to.equal(target.canonicalReference);
			expect(result.asDeclared).to.equal(false);
		});

		it("substitutes outer parameters in a return type but not a method's own parameters", () => {
			const bindings = new Map([
				["T", createTypeExcerpt("number")],
				["U", createTypeExcerpt("string")],
			]);
			const result = getMemberType(
				createMethod("read", { returnType: "[T, U]", typeParameters: ["U"] }),
				bindings,
			);
			expect(result.excerpt.text).to.equal("[number, U]");
			expect(result.asDeclared).to.equal(false);
		});

		it("falls back rather than capturing a method's type parameter", () => {
			const member = createMethod("read", { returnType: "T", typeParameters: ["U"] });

			// The replacement U belongs to the derived type. Printing `read<U>(): U` would instead
			// make the return type refer to the caller's choice of method argument.
			const result = getMemberType(member, new Map([["T", createTypeExcerpt("U")]]));
			expect(result.excerpt).to.equal(member.returnTypeExcerpt);
			expect(result.asDeclared).to.equal(true);
		});

		it("falls back to the whole declaration if any required binding is unresolved", () => {
			const bindings: TypeBindings = new Map([
				["T", createTypeExcerpt("number")],
				["U", undefined],
			]);
			const member = createProperty("value", { type: "[T, U]" });
			const result = getMemberType(member, bindings);

			// The label “as declared” describes the whole cell: [number, U] would be neither the
			// original declaration nor a fully specialized type. A separate T-only cell needs no fallback.
			expect(result.excerpt).to.equal(member.propertyTypeExcerpt);
			expect(result.asDeclared).to.equal(true);
			expect(
				getMemberType(createProperty("value", { type: "T" }), bindings).asDeclared,
			).to.equal(false);
		});
	});
});
