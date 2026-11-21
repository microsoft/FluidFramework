/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiClass,
	type ApiEntryPoint,
	type ApiItem,
	type ApiMethodSignature,
	ApiModel,
	ApiProperty,
	ApiPropertySignature,
	ExcerptTokenKind,
	type IExcerptToken,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import { TSDocParser } from "@microsoft/tsdoc";
import { expect } from "chai";

import { defaultConsoleLogger } from "../../../Logging.js";
import {
	createInterface,
	createMethod,
	createPackage,
	createProperty,
	createReferenceToken,
	createTypeAlias,
} from "../../../test/index.js";
import {
	type ApiItemTransformationConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
} from "../../index.js";
import { getInheritedMembers } from "../InheritedMembers.js";

const packageName = "test-api";

/**
 * Creates a reference to a named declaration in the fixture model.
 *
 * @remarks
 * Most bases are interfaces in the local package. Override the kind or package to exercise class,
 * alias, and cross-package resolution without changing how the resolver looks up the reference.
 */
function createReference(
	name: string,
	kind = "interface",
	targetPackage = packageName,
): IExcerptToken {
	return createReferenceToken(name, `${targetPackage}!${name}:${kind}`);
}

describe("InheritedMembers", () => {
	describe("getInheritedMembers", () => {
		let apiModel: ApiModel;
		let entry: ApiEntryPoint;
		let config: ApiItemTransformationConfiguration;
		let warnings: string[];

		// Use a fresh configuration per test: the resolver caches completed traversals and reported
		// cycles by configuration. Calls within one test can then exercise that cache deliberately.
		beforeEach(() => {
			apiModel = new ApiModel();
			const testPackage = createPackage(packageName);
			apiModel.addMember(testPackage);
			[entry] = testPackage.entryPoints;
			warnings = [];
			config = getApiItemTransformationConfigurationWithDefaults({
				apiModel,
				includeInheritedMembers: true,
				logger: {
					...defaultConsoleLogger,
					warning: (message) => warnings.push(String(message)),
				},
			});
		});

		it("returns no inherited declarations for a type without bases", () => {
			const item = createInterface("Root", { members: [createProperty("own")] });
			entry.addMember(item);

			// A nonempty root distinguishes "inherited members only" from "all visible members."
			expect(getInheritedMembers(item, config).size).to.equal(0);
		});

		it("returns original member objects once per declaration, not once per inheritance path", () => {
			const first = createMethod("read");
			const second = createMethod("read", { overloadIndex: 2 });
			const event = createProperty("changed", {
				documentComment: new TSDocParser().parseString("/** @eventProperty */").docComment,
			});
			const root = createInterface("Root", { members: [first, second, event] });
			const derived = createInterface("Derived", {
				bases: [createReference("Left"), createReference("Right")],
				members: [createProperty("own")],
			});
			entry.addMember(root);
			entry.addMember(createInterface("Left", { bases: [createReference("Root")] }));
			entry.addMember(createInterface("Right", { bases: [createReference("Root")] }));
			entry.addMember(derived);

			// Identity matters: callers use the original member and its parent to build canonical links.
			const members = getInheritedMembers(derived, config);
			expect([...members.keys()]).to.have.members([first, second, event]);
			expect(event.parent).to.equal(root);
			expect(warnings).to.be.empty;
		});

		it("keeps independent declarations with the same name", () => {
			const left = createProperty("value");
			const right = createProperty("value");
			entry.addMember(createInterface("Left", { members: [left] }));
			entry.addMember(createInterface("Right", { members: [right] }));
			const item = createInterface("Both", {
				bases: [createReference("Left"), createReference("Right")],
			});
			entry.addMember(item);

			// Unlike two paths to one Root.value, these two value declarations have different owners and link targets.
			expect([...getInheritedMembers(item, config).keys()]).to.have.members([left, right]);
		});

		it("does not revive a hidden declaration through a second base or after filtering its override", () => {
			const original = createProperty("value");
			const override = createProperty("value");
			const other = createProperty("other");
			entry.addMember(createInterface("Root", { members: [original, other] }));
			entry.addMember(
				createInterface("Refined", { bases: [createReference("Root")], members: [override] }),
			);
			const item = createInterface("Both", {
				bases: [createReference("Refined"), createReference("Root")],
			});
			entry.addMember(item);
			expect([...getInheritedMembers(item, config).keys()]).to.have.members([override, other]);

			// Excluding Refined.value removes the row. It does not undo the override and reveal Root.value.
			expect([
				...getInheritedMembers(item, {
					...config,
					exclude: (member) => member === override,
				}).keys(),
			]).to.have.members([other]);
		});

		it("follows a superclass but does not inherit static members, unresolved computed keys, or contract members", () => {
			const propertyOptions = {
				docComment: undefined,
				releaseTag: ReleaseTag.Public,
				isAbstract: false,
				isOptional: false,
				isProtected: true,
				isReadonly: true,
				isStatic: false,
				excerptTokens: [{ kind: ExcerptTokenKind.Content, text: "number" }],
				propertyTypeTokenRange: { startIndex: 0, endIndex: 1 },
			};
			const inherited = new ApiProperty({ ...propertyOptions, name: "value" });
			const classOptions = {
				docComment: undefined,
				releaseTag: ReleaseTag.Public,
				isAbstract: false,
				isExported: true,
				typeParameters: [],
			};
			const base = new ApiClass({
				...classOptions,
				name: "Base",
				excerptTokens: [],
				extendsTokenRange: undefined,
				implementsTokenRanges: [],
				members: [
					inherited,
					new ApiProperty({ ...propertyOptions, name: "shared", isStatic: true }),
					new ApiProperty({ ...propertyOptions, name: "[key]" }),
				],
			});
			const item = new ApiClass({
				...classOptions,
				name: "Derived",

				// The two token ranges model `extends Base implements Contract`; only the first supplies members.
				excerptTokens: [createReference("Base", "class"), createReference("Contract")],
				extendsTokenRange: { startIndex: 0, endIndex: 1 },
				implementsTokenRanges: [{ startIndex: 1, endIndex: 2 }],
			});
			entry.addMember(base);
			entry.addMember(createInterface("Contract", { members: [createProperty("optional")] }));
			entry.addMember(item);
			expect([...getInheritedMembers(item, config).keys()]).to.have.members([inherited]);
		});

		it("matches symbol overrides by the key declaration, not by its spelling or the type of the member", () => {
			/**
			 * Creates a computed property whose bracketed key links to the supplied symbol declaration.
			 */
			function createSymbolProperty(name: string, keyReference: string): ApiPropertySignature {
				return new ApiPropertySignature({
					name: `[${name}]`,
					docComment: undefined,
					releaseTag: ReleaseTag.Public,
					isOptional: false,
					isReadonly: true,
					excerptTokens: [
						{ kind: ExcerptTokenKind.Content, text: "readonly [" },
						createReferenceToken(name, keyReference),
						{ kind: ExcerptTokenKind.Content, text: "]: " },
						{ kind: ExcerptTokenKind.Content, text: "number" },
					],
					propertyTypeTokenRange: { startIndex: 3, endIndex: 4 },
				});
			}
			const left = createSymbolProperty("key", "left!key:var");
			const right = createSymbolProperty("key", "right!key:var");
			const override = createSymbolProperty("renamedKey", "left!key:var");
			entry.addMember(createInterface("Left", { members: [left] }));
			entry.addMember(createInterface("Right", { members: [right] }));
			const intermediate = createInterface("Intermediate", {
				bases: [createReference("Left"), createReference("Right")],
				members: [override],
			});
			entry.addMember(intermediate);
			const leaf = createInterface("Leaf", { bases: [createReference("Intermediate")] });
			entry.addMember(leaf);

			// A re-export can change the spelling of one key without overriding the unrelated key from Right.
			expect([...getInheritedMembers(intermediate, config).keys()]).to.have.members([right]);
			expect([...getInheritedMembers(leaf, config).keys()]).to.have.members([override, right]);
		});

		for (const boundary of ["excluded type", "excluded package", "release level"]) {
			it(`stops traversal at an intermediate base hidden by ${boundary}`, () => {
				const secret = createProperty("secret");
				const mid = createProperty("intermediate");
				const ready = createProperty("ready");
				const hidden = createInterface("Hidden", {
					bases: [createReference("Ancestor")],
					members: [mid],
					releaseTag: ReleaseTag.Alpha,
				});
				const hiddenPackage = createPackage("other-api", hidden);
				apiModel.addMember(hiddenPackage);
				entry.addMember(createInterface("Ancestor", { members: [secret] }));
				entry.addMember(createInterface("Other", { members: [ready] }));
				const item = createInterface("Consumer", {
					bases: [
						createReference("Hidden", "interface", hiddenPackage.name),
						createReference("Other"),
					],
				});
				entry.addMember(item);
				const visible = { ...config, minimumReleaseLevel: ReleaseTag.Alpha } as const;

				// Establish that the cross-package path resolves before testing where traversal stops.
				expect([...getInheritedMembers(item, visible).keys()]).to.have.members([
					secret,
					mid,
					ready,
				]);
				const restricted: ApiItemTransformationConfiguration =
					boundary === "release level"
						? { ...config, minimumReleaseLevel: ReleaseTag.Public }
						: {
								...visible,
								exclude: (member: ApiItem) =>
									member === (boundary === "excluded type" ? hidden : hiddenPackage),
							};
				expect([...getInheritedMembers(item, restricted).keys()]).to.have.members([ready]);
			});
		}

		it("continues past missing packages and resolves them when present in a new configuration", () => {
			const local = createProperty("local");
			const external = createProperty("external");
			entry.addMember(createInterface("Local", { members: [local] }));
			const item = createInterface("Both", {
				bases: [
					createReference("Remote", "interface", "another-api"),
					createReference("Local"),
				],
			});
			entry.addMember(item);
			expect([...getInheritedMembers(item, config).keys()]).to.have.members([local]);
			expect(warnings).to.have.length(1);
			expect(warnings[0])
				.to.contain("Cannot resolve base")
				.and.to.contain("another-api!Remote");
			apiModel.addMember(
				createPackage("another-api", createInterface("Remote", { members: [external] })),
			);

			// A new configuration represents a new documentation run; it must not reuse the earlier missing-base result.
			expect([...getInheritedMembers(item, { ...config }).keys()]).to.have.members([
				local,
				external,
			]);
		});

		it("breaks cycles without treating a partial traversal as a cached result", () => {
			const first = createProperty("first");
			const second = createProperty("second");
			const extra = createProperty("extra");
			const a = createInterface("A", {
				bases: [createReference("B"), createReference("Extra")],
				members: [first],
			});
			const b = createInterface("B", { bases: [createReference("A")], members: [second] });
			entry.addMember(a);
			entry.addMember(b);
			entry.addMember(createInterface("Extra", { members: [extra] }));

			// While resolving A, B cannot follow its edge back to A. Starting at B must still reach Extra.
			expect([...getInheritedMembers(a, config).keys()]).to.have.members([second, extra]);
			expect([...getInheritedMembers(a, config).keys()]).to.have.members([second, extra]);
			expect(warnings).to.have.length(1);
			expect(warnings[0]).to.contain("cyclic inheritance");
			expect([...getInheritedMembers(b, config).keys()]).to.have.members([first, extra]);
		});

		describe("generic bases and forwarding aliases", () => {
			let valueMember: ApiPropertySignature;
			let list: ApiPropertySignature;
			let count: ApiPropertySignature;
			let read: ApiMethodSignature;
			let map: ApiMethodSignature;

			beforeEach(() => {
				// In Box<T = string, U = T>, value uses U and read uses T. The count property needs no
				// substitution at all, while map<T>() introduces a different T with the same spelling.
				valueMember = createProperty("value", { type: "U" });
				list = createProperty("list", { type: "T[]" });
				count = createProperty("count", { type: "number" });
				read = createMethod("read", { returnType: "T" });
				map = createMethod("map", { returnType: "T", typeParameters: ["T"] });
				entry.addMember(
					createInterface("Box", {
						typeParameters: { T: "string", U: "T" },
						members: [valueMember, list, count, read, map],
					}),
				);
			});

			it("applies omitted and dependent defaults to the original members", () => {
				for (const [name, typeArguments, expected] of [
					["Default", "", "string"],
					["Explicit", "<number>", "number"],
				]) {
					const item = createTypeAlias(name, createReference("Box"), typeArguments);
					entry.addMember(item);
					const result = getInheritedMembers(item, config);

					// Looking up both original members checks their identity as well as the specialized property and return types.
					for (const member of [valueMember, read]) {
						expect(result.get(member)?.excerpt.text).to.equal(expected);
						expect(result.get(member)?.asDeclared).to.equal(false);
					}
				}
			});

			it("composes arguments across interfaces and alias chains without changing method-local parameters", () => {
				entry.addMember(
					createInterface("ListBox", {
						typeParameters: { X: undefined },
						bases: [[createReference("Box"), "<X[]>"]],
					}),
				);
				entry.addMember(
					createTypeAlias("Either", createReference("ListBox"), "<string | number>"),
				);
				const item = createTypeAlias("Forwarded", createReference("Either", "type"));
				entry.addMember(item);

				// ListBox contributes one array layer and Box.list contributes the second.
				// Neither application binds the T declared by map itself.
				const result = getInheritedMembers(item, config);
				expect(result.get(read)?.excerpt.text).to.equal("(string | number)[]");
				expect(result.get(list)?.excerpt.text).to.equal("(string | number)[][]");
				expect(result.get(map)?.excerpt.text).to.equal("T");
				expect(result.get(map)?.asDeclared).to.equal(false);
			});

			it("preserves references and argument boundaries in nested applications", () => {
				const other = createInterface("Other");
				entry.addMember(other);

				// In Box<Box<Other[], number>, boolean>, only the second comma separates the outer arguments.
				// The link to Other belongs to the inner expression and must survive the substitution.
				const item = createTypeAlias(
					"Nested",
					createReference("Box"),
					"<",
					createReference("Box"),
					"<",
					createReference("Other"),
					"[], number>, boolean>",
				);
				entry.addMember(item);
				const result = getInheritedMembers(item, config);
				const type = result.get(read)?.excerpt;
				expect(type?.text).to.equal("Box<Other[], number>");
				expect(
					type?.spannedTokens
						.find((token) => token.text === "Other")
						?.canonicalReference?.toString(),
				).to.equal(other.canonicalReference.toString());
				expect(result.get(valueMember)?.excerpt.text).to.equal("boolean");
			});

			it("falls back only for members that depend on an unsupported argument", () => {
				const item = createTypeAlias(
					"Mapped",
					createReference("Box"),
					"<{ [K in keyof X]: K }, string>",
				);
				entry.addMember(item);
				const result = getInheritedMembers(item, config);

				// The mapped argument affects read(): T. It does not prevent value: U from using the explicit string argument.
				expect(result.get(read)?.excerpt).to.equal(read.returnTypeExcerpt);
				expect(result.get(read)?.asDeclared).to.equal(true);
				expect(result.get(valueMember)?.excerpt.text).to.equal("string");
				expect(result.get(count)?.asDeclared).to.equal(false);
			});

			it("leaves a conflicting diamond binding unresolved rather than selecting one path", () => {
				entry.addMember(createTypeAlias("Numbers", createReference("Box"), "<number>"));
				entry.addMember(createTypeAlias("Strings", createReference("Box"), "<string>"));
				const item = createInterface("Both", {
					bases: [createReference("Numbers", "type"), createReference("Strings", "type")],
				});
				entry.addMember(item);
				const result = getInheritedMembers(item, config);

				// Both paths reach the same Box.value, but its dependent default U = T differs between them.
				// The declaration's own U is a safer fallback than whichever argument was visited last.
				expect(result.get(valueMember)?.excerpt).to.equal(valueMember.propertyTypeExcerpt);
				expect(result.get(valueMember)?.asDeclared).to.equal(true);
				expect(result.get(count)?.asDeclared).to.equal(false);
			});

			it("does not guess a base from a constituent, type argument, or partial expression", () => {
				// Every excerpt contains a real Box reference. None identifies Box as the outer type of a valid forwarding alias.
				for (const item of [
					createTypeAlias("Union", createReference("Box"), " | string"),
					createTypeAlias("Array", createReference("Box"), "<string>[]"),
					createTypeAlias("MissingOuter", "Missing<", createReference("Box"), "<string>>"),
					createTypeAlias("Malformed", createReference("Box"), "<string[]"),
				]) {
					entry.addMember(item);
					expect(getInheritedMembers(item, config).size, item.name).to.equal(0);
				}
			});
		});
	});
});
