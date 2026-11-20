/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import {
	ApiInterface,
	type ApiItem,
	ApiMethodSignature,
	ApiModel,
	ApiPropertySignature,
	ApiTypeAlias,
	ExcerptTokenKind,
	type IApiTypeParameterOptions,
	type IExcerptToken,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import { type DocComment, TSDocParser } from "@microsoft/tsdoc";
import { expect } from "chai";

import { getFilteredMembers } from "../api-item-transforms/index.js";
import {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationOptions,
	ApiItemUtilities,
	defaultConsoleLogger,
	getApiItemTransformationConfigurationWithDefaults,
	MarkdownRenderer,
	transformApiModel,
} from "../index.js";

import { HierarchyConfigurations, testDataDirectoryPath } from "./EndToEndTestUtilities.js";

const common = {
	docComment: undefined,
	isExported: true,
	releaseTag: ReleaseTag.Public,
	typeParameters: [],
};
const emptyRange = { startIndex: 0, endIndex: 0 };

function reference(
	name: string,
	kind = "interface",
	packageName = "test-suite-b",
): IExcerptToken {
	return {
		kind: ExcerptTokenKind.Reference,
		text: name,
		canonicalReference: `${packageName}!${name}:${kind}`,
	};
}

function content(text: string): IExcerptToken {
	return { kind: ExcerptTokenKind.Content, text };
}

function makeInterface(
	name: string,
	bases: IExcerptToken[] = [],
	members: ApiItem[] = [],
): ApiInterface {
	return new ApiInterface({
		...common,
		name,
		members,
		excerptTokens: bases,
		extendsTokenRanges: bases.map((_, index) => ({ startIndex: index, endIndex: index + 1 })),
	});
}

function property(
	name: string,
	type = "number",
	documentComment?: DocComment,
): ApiPropertySignature {
	return new ApiPropertySignature({
		...common,
		name,
		docComment: documentComment,
		isOptional: false,
		isReadonly: true,
		excerptTokens: [content(type)],
		propertyTypeTokenRange: { startIndex: 0, endIndex: 1 },
	});
}

function method(overloadIndex: number, name = "read"): ApiMethodSignature {
	return new ApiMethodSignature({
		...common,
		name,
		isOptional: false,
		overloadIndex,
		parameters: [],
		excerptTokens: [],
		returnTypeTokenRange: emptyRange,
	});
}

function alias(name: string, ...excerptTokens: IExcerptToken[]): ApiTypeAlias {
	return new ApiTypeAlias({
		...common,
		name,
		excerptTokens,
		typeTokenRange: { startIndex: 0, endIndex: excerptTokens.length },
	});
}

function reportPath(name: string): string {
	return path.join(testDataDirectoryPath, "simple-suite-test", `${name}.api.json`);
}

function memberRows(page: string, name: string): string[] {
	return page
		.split("\n")
		.filter((line) => line.startsWith(`| [${name}](`) || line.startsWith(`| [${name}(`));
}

describe("Inherited member summaries", () => {
	let apiModel: ApiModel;
	let root: ApiInterface;
	let derived: ApiInterface;
	let sources: ApiItem[];

	beforeEach(() => {
		apiModel = new ApiModel();
		const entry = apiModel.loadPackage(reportPath("test-suite-b")).entryPoints[0];
		sources = [property("ready"), method(1), method(2)];
		root = makeInterface("Root", [], sources);
		derived = makeInterface(
			"Derived",
			[reference("Left"), reference("Right")],
			[property("position")],
		);
		for (const item of [
			root,
			makeInterface("Left", [reference("Root")]),
			makeInterface("Right", [reference("Root")]),
			derived,
		]) {
			entry.addMember(item);
		}
	});

	function render(
		item: ApiItem,
		options: Partial<ApiItemTransformationOptions> = {},
	): {
		text: string;
		config: ApiItemTransformationConfiguration;
	} {
		const config = getApiItemTransformationConfigurationWithDefaults({ apiModel, ...options });
		const documents = transformApiModel(config);
		const { documentPath } = ApiItemUtilities.getLinkTargetForApiItem(item, config);
		const document = documents.find((candidate) => candidate.documentPath === documentPath);
		if (document === undefined) {
			throw new Error(`Missing document ${documentPath}.`);
		}
		return { text: MarkdownRenderer.renderDocument(document, {}).contents, config };
	}

	it("does not change summaries unless requested", () => {
		expect(render(derived).text).not.to.contain("Inherited From");
		expect(render(root, { includeInheritedMembers: true }).text).not.to.contain(
			"Inherited From",
		);
	});

	it("selects visible members and preserves the original declarations for details", () => {
		const item2 = property("item2");
		const item3 = property("item3");
		const item10 = property("item10");
		root.addMember(item2);
		derived.addMember(item3);
		derived.addMember(item10);
		const config = getApiItemTransformationConfigurationWithDefaults({
			apiModel,
			exclude: (item) => item.displayName === "ready" || item.displayName === "position",
		});
		const direct = derived.members.filter((item) => item.displayName !== "position");
		expect(getFilteredMembers(derived, config).members).to.deep.equal(direct);

		const { members, declaredMembers, inheritedTypes } = getFilteredMembers(derived, {
			...config,
			includeInheritedMembers: true,
		});
		expect(members).to.deep.equal([item2, item3, item10, ...sources.slice(1)]);
		expect(declaredMembers).to.deep.equal(direct);
		expect(inheritedTypes?.get(item2)?.excerpt.text).to.equal("number");
		expect(inheritedTypes?.has(item3)).to.equal(false);
	});

	it("does not return inherited members for an excluded type", () => {
		const config = getApiItemTransformationConfigurationWithDefaults({
			apiModel,
			includeInheritedMembers: true,
			exclude: (item) => item === derived,
		});
		expect(getFilteredMembers(derived, config).members).to.be.empty;
	});

	for (const kind of ["event", "property", "method"]) {
		it(`sorts declared and inherited ${kind} rows together in numeric name order`, () => {
			const comment =
				kind === "event"
					? new TSDocParser().parseString("/** @eventProperty */").docComment
					: undefined;
			const member = (name: string): ApiItem =>
				kind === "method" ? method(1, name) : property(name, "number", comment);
			root.addMember(member("item10"));
			root.addMember(member("item2"));
			derived.addMember(member("item3"));
			const { text } = render(derived, { includeInheritedMembers: true });
			const rowNames = [...text.matchAll(/^\| \[(item\d+)(?:\(\))?]/gm)].map(
				(match) => match[1],
			);
			expect(rowNames).to.deep.equal(["item2", "item3", "item10"]);
		});
	}

	describe("inherited type cells", () => {
		const parameter = (name: string): IApiTypeParameterOptions => ({
			typeParameterName: name,
			constraintTokenRange: emptyRange,
			defaultTypeTokenRange: emptyRange,
		});

		beforeEach(() => {
			const read = (name: string, shadow: boolean): ApiMethodSignature =>
				new ApiMethodSignature({
					...common,
					name,
					parameters: [],
					overloadIndex: 1,
					isOptional: false,
					typeParameters: shadow ? [parameter("T")] : [],
					excerptTokens: [content("T")],
					returnTypeTokenRange: { startIndex: 0, endIndex: 1 },
				});
			const box = new ApiInterface({
				...common,
				name: "Box",
				typeParameters: [parameter("T")],
				excerptTokens: [],
				extendsTokenRanges: [],
				members: [
					property("value", "T"),
					property("list", "T[]"),
					property("count"),
					property("callback", "<T>() => T"),
					read("get", false),
					read("map", true),
				],
			});
			const entry = apiModel.packages[0].entryPoints[0];
			entry.addMember(box);
			entry.addMember(
				new ApiInterface({
					...common,
					name: "Middle",
					typeParameters: [parameter("U")],
					excerptTokens: [reference("Box"), content("<U>")],
					extendsTokenRanges: [{ startIndex: 0, endIndex: 2 }],
				}),
			);
		});

		function typeCell(page: string, name: string): string | undefined {
			return memberRows(page, name)[0]?.split("|").at(-3)?.trim();
		}

		it("specializes properties and return types through a generic base without capturing method parameters", () => {
			const item = alias("StringBox", reference("Middle"), content("<string>"));
			apiModel.packages[0].entryPoints[0].addMember(item);
			const { text } = render(item, { includeInheritedMembers: true });
			expect(typeCell(text, "value")).to.equal("string");
			expect(typeCell(text, "get")).to.equal("string");
			expect(typeCell(text, "map")).to.equal("T");
			expect(typeCell(text, "count")).to.equal("number");
			expect(typeCell(text, "list")?.replaceAll("\\", "")).to.equal("string[]");
			expect(typeCell(text, "callback"))
				.to.contain("(as declared)")
				.and.not.to.contain("string");
		});

		it("preserves links to named type arguments", () => {
			const item = alias(
				"NamedBox",
				reference("Box"),
				content("<"),
				reference("Root"),
				content(">"),
			);
			apiModel.packages[0].entryPoints[0].addMember(item);
			const { text, config } = render(item, { includeInheritedMembers: true });
			expect(typeCell(text, "value")).to.equal(
				`[Root](${ApiItemUtilities.getLinkForApiItem(root, config).url})`,
			);
		});

		it("keeps the original type when paths disagree, without marking unrelated members", () => {
			const entry = apiModel.packages[0].entryPoints[0];
			for (const type of ["string", "number"]) {
				entry.addMember(alias(`${type}Box`, reference("Box"), content(`<${type}>`)));
			}
			const both = makeInterface("Both", [
				reference("stringBox", "type"),
				reference("numberBox", "type"),
			]);
			entry.addMember(both);
			const { text } = render(both, { includeInheritedMembers: true });
			expect(typeCell(text, "value")).to.equal("T (as declared)");
			expect(typeCell(text, "count")).to.equal("number");
		});
	});

	it("merges diamond paths and preserves canonical links for each overload", () => {
		const { text, config } = render(derived, { includeInheritedMembers: true });
		const ownerUrl = ApiItemUtilities.getLinkForApiItem(root, config).url;
		expect(text)
			.to.contain("| Property | Inherited From |")
			.and.to.contain("| Method | Inherited From |");
		const [local] = memberRows(text, "position");
		expect(local.split("|")[2].trim()).to.equal("");
		expect(memberRows(text, "ready")).to.have.length(1);
		const overloadRows = memberRows(text, "read");
		expect(overloadRows).to.have.length(2);
		for (const [index, row] of overloadRows.entries()) {
			const memberUrl = ApiItemUtilities.getLinkForApiItem(sources[index + 1], config).url;
			expect(row).to.contain(`overload ${index + 1}](${memberUrl}) | [Root](${ownerUrl}) |`);
		}
		expect(text).not.to.contain("Method Details");
	});

	for (const [name, hierarchy] of Object.entries(HierarchyConfigurations)) {
		it(`links to the canonical target in the ${name} hierarchy`, () => {
			const { text, config } = render(derived, { includeInheritedMembers: true, hierarchy });
			const url = ApiItemUtilities.getLinkForApiItem(sources[0], config).url;
			const ownerUrl = ApiItemUtilities.getLinkForApiItem(root, config).url;
			expect(text).to.contain(`| [ready](${url}) | [Root](${ownerUrl}) |`);
		});
	}

	it("respects filtered overrides even when the ancestor is also a direct base", () => {
		const override = property("ready");
		const refined = makeInterface("Refined", [reference("Root")], [override]);
		const empty = makeInterface("Empty", [reference("Root"), reference("Refined")]);
		const entry = apiModel.packages[0].entryPoints[0];
		entry.addMember(refined);
		entry.addMember(empty);
		const { text, config } = render(empty, { includeInheritedMembers: true });
		const ownerUrl = ApiItemUtilities.getLinkForApiItem(refined, config).url;
		expect(memberRows(text, "ready")).to.have.length(1);
		expect(memberRows(text, "ready")[0]).to.contain(`| [Refined](${ownerUrl}) |`);
		const filtered = render(empty, {
			includeInheritedMembers: true,
			exclude: (item) => item === override,
		});
		expect(memberRows(filtered.text, "ready")).to.be.empty;
	});

	it("forwards aliases and generic targets without leaking members from type arguments or unions", () => {
		const entry = apiModel.packages[0].entryPoints[0];
		const generic = alias(
			"Generic",
			reference("Root"),
			content("<"),
			reference("Derived"),
			content(">"),
		);
		const forwarded = alias("Forwarded", reference("Generic", "type"));
		const union = alias("Union", reference("Root"), content(" | "), reference("Derived"));
		for (const item of [generic, forwarded, union]) {
			entry.addMember(item);
		}
		const { text, config } = render(forwarded, { includeInheritedMembers: true });
		expect(text).to.contain("| Property | Declared By |").and.not.to.contain("Inherited From");
		expect(memberRows(text, "ready")[0]).to.contain(
			`| [Root](${ApiItemUtilities.getLinkForApiItem(root, config).url}) |`,
		);
		expect(memberRows(text, "position")).to.be.empty;
		expect(render(union, { includeInheritedMembers: true }).text).not.to.contain(
			"Declared By",
		);
	});

	it("keeps distinct same-name members from independent bases", () => {
		const other = makeInterface("Other", [], [property("ready")]);
		const both = makeInterface("Both", [reference("Root"), reference("Other")]);
		const entry = apiModel.packages[0].entryPoints[0];
		entry.addMember(other);
		entry.addMember(both);
		const { text, config } = render(both, { includeInheritedMembers: true });
		const rows = memberRows(text, "ready");
		expect(rows).to.have.length(2);
		for (const owner of [root, other]) {
			const memberUrl = ApiItemUtilities.getLinkForApiItem(
				owner.findMembersByName("ready")[0],
				config,
			).url;
			const ownerUrl = ApiItemUtilities.getLinkForApiItem(owner, config).url;
			expect(text).to.contain(
				`| [ready](${memberUrl}) | [${owner.displayName}](${ownerUrl}) |`,
			);
		}
	});

	it("continues past cycles and missing packages, without caching partial results", () => {
		const entry = apiModel.packages[0].entryPoints[0];
		const a = makeInterface(
			"A",
			[reference("B"), reference("TestInterface", "interface", "test-suite-a")],
			[property("first")],
		);
		const b = makeInterface("B", [reference("A")], [property("second")]);
		entry.addMember(a);
		entry.addMember(b);
		const warnings: string[] = [];
		const options = {
			includeInheritedMembers: true,
			logger: {
				...defaultConsoleLogger,
				warning: (message: string | Error) => warnings.push(String(message)),
			},
		};
		expect(memberRows(render(b, options).text, "first")[0]).to.contain("| [A](");
		expect(warnings.some((message) => message.includes("cyclic inheritance"))).to.equal(true);
		expect(warnings.some((message) => message.includes("Cannot resolve base"))).to.equal(true);
		apiModel.loadPackage(reportPath("test-suite-a"));
		const { text } = render(a, options);
		expect(memberRows(text, "second")[0]).to.contain("| [B](");
		expect(memberRows(text, "testInterfaceProperty")[0]).to.contain("| [TestInterface](");
	});

	it("includes inherited protected class members and interface events without duplicating overrides", () => {
		const entry = apiModel.loadPackage(reportPath("test-suite-a")).entryPoints[0];
		const [testClass] = entry.findMembersByName("TestClass");
		const [testInterface] = entry.findMembersByName("TestInterfaceExtendingOtherInterfaces");
		const options = { includeInheritedMembers: true };
		const classPage = render(testClass, options).text;
		expect(memberRows(classPage, "protectedProperty")[0]).to.contain("| [TestAbstractClass](");
		expect(memberRows(classPage, "sealedMethod")[0]).to.contain("| [TestAbstractClass](");
		expect(memberRows(classPage, "virtualMethod")[0].split("|")[2].trim()).to.equal("");
		const interfacePage = render(testInterface, options).text;
		expect(memberRows(interfacePage, "testClassEventProperty")[0]).to.contain(
			"| [TestInterface](",
		);
		const [propertyRow] = memberRows(interfacePage, "testProperty");
		expect(propertyRow).to.contain("| [TestInterfaceWithTypeParameter](");
		expect(propertyRow).to.contain("| number |").and.not.to.contain("(as declared)");
	});
});
