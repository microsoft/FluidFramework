/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiClass,
	type ApiItem,
	ApiItemKind,
	ApiMethod,
	ApiModel,
	ApiProperty,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import { TSDocParser } from "@microsoft/tsdoc";
import { expect } from "chai";
import type { Table } from "mdast";

import type { Section } from "../../mdast/index.js";
import {
	createInterface,
	createMethod,
	createPackage,
	createProperty,
	createReferenceToken,
	createTypeAlias,
} from "../../test/index.js";
import {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationOptions,
	getApiItemTransformationConfigurationWithDefaults,
	HierarchyKind,
} from "../configuration/index.js";
import { transformApiTypeLike } from "../default-implementations/index.js";
import { getLinkForApiItem } from "../utilities/index.js";

/**
 * Creates a transformation configuration for an in-memory package named `test-api`.
 *
 * @remarks
 * Registering the declarations in one model lets the transform resolve references between them.
 * The layout callback returns only the member sections, so the tests can inspect their nodes without rendering Markdown.
 */
function createConfig(
	items: ApiItem[],
	options: Omit<ApiItemTransformationOptions, "apiModel"> = {},
): ApiItemTransformationConfiguration {
	const apiModel = new ApiModel();
	apiModel.addMember(createPackage("test-api", ...items));
	return getApiItemTransformationConfigurationWithDefaults({
		apiModel,
		...options,

		defaultSectionLayout: (_item, sections) => sections ?? [],
	});
}

/**
 * Finds the summary table under a section heading.
 *
 * @throws If the section is absent or its first child is not a table.
 */
function getTable(sections: readonly Section[], heading: string): Table {
	const table = sections.find((section) => section.heading?.title === heading)?.children[0];
	if (table?.type !== "table") {
		throw new Error(`Expected a table in the ${heading} section.`);
	}
	return table;
}

/**
 * Returns a summary table's column names in header order.
 *
 * @remarks
 * Empty optional columns are omitted, so a column such as `Type` need not have the same index in every fixture.
 */
function getColumnNames(table: Table): string[] {
	return table.children[0].children.map((cell) => {
		const [label] = cell.children;
		if (label?.type !== "text") {
			throw new Error("Expected a text label in the table header.");
		}
		return label.value;
	});
}

/**
 * Creates a test class with an optional base from the same package.
 */
function createClass(name: string, members: ApiItem[], base?: ApiClass): ApiClass {
	return new ApiClass({
		name,
		members,
		docComment: undefined,
		isAbstract: false,
		isExported: true,
		releaseTag: ReleaseTag.Public,
		typeParameters: [],
		excerptTokens:
			base === undefined
				? []
				: [createReferenceToken(base.name, `test-api!${base.name}:class`)],
		extendsTokenRange: base === undefined ? undefined : { startIndex: 0, endIndex: 1 },
		implementsTokenRanges: [],
	});
}

/**
 * Creates a class method with an empty signature and the specified overload and access flags.
 */
function createClassMethod(
	name: string,
	options: { isProtected?: boolean; isStatic?: boolean; overloadIndex?: number } = {},
): ApiMethod {
	return new ApiMethod({
		name,
		docComment: undefined,
		releaseTag: ReleaseTag.Public,
		isAbstract: false,
		isOptional: false,
		isProtected: false,
		isStatic: false,
		overloadIndex: 1,
		...options,
		parameters: [],
		typeParameters: [],
		excerptTokens: [],
		returnTypeTokenRange: { startIndex: 0, endIndex: 0 },
	});
}

describe("transformApiTypeLike", () => {
	// A method link can target a heading on the declaring type's page or a separate method document.
	// In either layout the name must identify the individual overload; the Declared By link is shared.
	for (const layout of [HierarchyKind.Section, HierarchyKind.Document] as const) {
		it(`links each forwarded overload to its own ${layout} and the declaring type`, () => {
			const methods = [createMethod("read"), createMethod("read", { overloadIndex: 2 })];
			const base = createInterface("Reader", { members: methods });
			const alias = createTypeAlias(
				"Forwarded",
				createReferenceToken("Reader", "test-api!Reader:interface"),
			);
			const config = createConfig([base, alias], {
				includeInheritedMembers: true,
				hierarchy: { [ApiItemKind.MethodSignature]: layout },
			});
			const sections = transformApiTypeLike(alias, config, () =>
				expect.fail("A forwarding alias owns no method details."),
			);
			expect(sections.map((section) => section.heading?.title)).to.deep.equal(["Methods"]);
			const table = getTable(sections, "Methods");
			expect(getColumnNames(table)).to.deep.equal(["Method", "Declared By", "Description"]);
			const rows = table.children.slice(1);
			expect(rows).to.have.length(methods.length);
			for (const [index, method] of methods.entries()) {
				const [name, owner] = rows[index].children;
				const label = `${config.getLinkTextForItem(method)} - overload ${method.overloadIndex}`;
				expect(name.children).to.deep.equal([getLinkForApiItem(method, config, label)]);
				expect(owner.children).to.deep.equal([getLinkForApiItem(base, config)]);
			}
		});
	}

	it("does not label an inherited instance method as an overload of a static method", () => {
		const read = createClassMethod("read");
		const base = createClass("Base", [
			read,
			createClassMethod("read", { isStatic: true }),
			createClassMethod("read", { isStatic: true, overloadIndex: 2 }),
		]);
		const derived = createClass("Derived", [], base);
		const config = createConfig([base, derived], { includeInheritedMembers: true });
		const table = getTable(
			transformApiTypeLike(derived, config, () => []),
			"Methods",
		);

		// Only the instance declaration is inherited, so its ordinary link text is unambiguous.
		expect(table.children.slice(1).map((row) => row.children[0].children)).to.deep.equal([
			[getLinkForApiItem(read, config)],
		]);
	});

	it("groups members by kind, specializes inherited types, and generates details only for local declarations", () => {
		const value = createProperty("item2", { type: "T" });
		const event = createProperty("changed", {
			documentComment: new TSDocParser().parseString("/** @eventProperty */").docComment,
		});
		const base = createInterface("Base", {
			typeParameters: { T: undefined },
			members: [value, event],
		});
		const local = createProperty("item10");
		const method = createMethod("reset");
		const derived = createInterface("Derived", {
			bases: [[createReferenceToken("Base", "test-api!Base:interface"), "<string>"]],
			members: [local, method],
		});
		const config = createConfig([base, derived], { includeInheritedMembers: true });

		// Recording the child-content requests checks ownership independently of what the detail sections contain.
		// Inherited items belong in the summary tables but must not trigger detail generation on Derived.
		const detailItems: ApiItem[] = [];
		const sections = transformApiTypeLike(derived, config, (item) => {
			detailItems.push(item);
			return [];
		});
		expect(sections.map((section) => section.heading?.title)).to.deep.equal([
			"Events",
			"Properties",
			"Methods",
			"Property Details",
			"Method Details",
		]);
		expect(detailItems).to.deep.equal([local, method]);

		const properties = getTable(sections, "Properties");
		const columns = getColumnNames(properties);
		expect(columns.slice(0, 2)).to.deep.equal(["Property", "Inherited From"]);

		// The first row is Base<T>.item2: its links still point to Base, but its type comes from Base<string>.
		// The local item10 sorts after it and has no declaring base to link to.
		const rows = properties.children.slice(1);
		expect(rows.map((row) => row.children[0].children)).to.deep.equal([
			[getLinkForApiItem(value, config)],
			[getLinkForApiItem(local, config)],
		]);
		expect(rows[0].children[1].children).to.deep.equal([getLinkForApiItem(base, config)]);
		expect(rows[1].children[1].children).to.be.empty;
		expect(rows[0].children[columns.indexOf("Type")].children).to.deep.equal([
			{ type: "text", value: "string" },
		]);

		const events = getTable(sections, "Events");
		expect(events.children[1].children[0].children).to.deep.equal([
			getLinkForApiItem(event, config),
		]);
		expect(events.children[1].children[1].children).to.deep.equal([
			getLinkForApiItem(base, config),
		]);
		expect(getColumnNames(getTable(sections, "Methods"))).not.to.include("Inherited From");
	});

	it("labels only the inherited callable property whose type requires a fallback", () => {
		const shadowed = createProperty("shadowed", { type: "<T>() => T" });
		const unrelated = createProperty("unrelated", { type: "<U>() => U" });
		const base = createInterface("Base", {
			typeParameters: { T: undefined },
			members: [shadowed, unrelated],
		});
		const derived = createInterface("Derived", {
			bases: [[createReferenceToken("Base", "test-api!Base:interface"), "<string>"]],
		});
		const config = createConfig([base, derived], { includeInheritedMembers: true });
		const table = getTable(
			transformApiTypeLike(derived, config, () => []),
			"Properties",
		);
		const typeColumn = getColumnNames(table).indexOf("Type");

		// Both signatures must remain generic. Only the one that mentions T needs a label;
		// marking the entire table would incorrectly suggest that the U signature also needed substitution.
		const rows = table.children.slice(1).map(({ children }) => ({
			name: children[0].children,
			type: children[typeColumn].children,
		}));
		expect(rows).to.deep.equal([
			{
				name: [getLinkForApiItem(shadowed, config)],
				type: [
					{ type: "text", value: "<T>() => T" },
					{ type: "text", value: " (as declared)" },
				],
			},
			{
				name: [getLinkForApiItem(unrelated, config)],
				type: [{ type: "text", value: "<U>() => U" }],
			},
		]);
	});

	it("links only documented types or explicit URI overrides in specialized member cells", () => {
		const value = createProperty("value", { type: "T" });
		const read = createMethod("read", { returnType: "T" });
		const base = createInterface("Base", {
			typeParameters: { T: undefined },
			members: [value, read],
		});
		const hidden = createInterface("Hidden");
		const beta = createInterface("Beta", { releaseTag: ReleaseTag.Beta });
		const external = createInterface("External");
		const visible = createInterface("Visible");

		// One union puts all four link policies in the same type cell: explicitly excluded, below
		// the release cutoff, excluded with an external destination, and visible in this suite.
		const derived = createInterface("Derived", {
			bases: [
				[
					createReferenceToken("Base", "test-api!Base:interface"),
					"<",
					createReferenceToken("Hidden", "test-api!Hidden:interface"),
					" | ",
					createReferenceToken("Beta", "test-api!Beta:interface"),
					" | ",
					createReferenceToken("External", "test-api!External:interface"),
					" | ",
					createReferenceToken("Visible", "test-api!Visible:interface"),
					">",
				],
			],
		});
		const config = createConfig([base, hidden, beta, external, visible, derived], {
			includeInheritedMembers: true,
			minimumReleaseLevel: ReleaseTag.Public,
			exclude: (item) => item === hidden || item === external,
			getUriBaseOverrideForItem: (item) =>
				item === external ? "https://example.com/api" : undefined,
		});
		const sections = transformApiTypeLike(derived, config, () => []);
		for (const [heading, column, member] of [
			["Properties", "Type", value],
			["Methods", "Return Type", read],
		] as const) {
			const table = getTable(sections, heading);
			const cells = table.children[1].children;

			// Filtering the type argument must not strip the member or declaring type links from the row.
			expect(cells[0].children).to.deep.equal([getLinkForApiItem(member, config)]);
			expect(cells[1].children).to.deep.equal([getLinkForApiItem(base, config)]);
			expect(cells[getColumnNames(table).indexOf(column)].children).to.deep.equal([
				{ type: "text", value: "Hidden" },
				{ type: "text", value: " | " },
				{ type: "text", value: "Beta" },
				{ type: "text", value: " | " },
				getLinkForApiItem(external, config, "External"),
				{ type: "text", value: " | " },
				getLinkForApiItem(visible, config, "Visible"),
			]);
		}
	});

	it("omits base members by default and does not inline details for a local member with its own document", () => {
		const base = createInterface("Base", { members: [createMethod("read")] });
		const hidden = createInterface("Position");
		const local = createProperty("position", {
			type: createReferenceToken("Position", "test-api!Position:interface"),
		});
		const derived = createInterface("Derived", {
			bases: [createReferenceToken("Base", "test-api!Base:interface")],
			members: [local],
		});

		// Leave inheritance at its default. Set both property kinds to Document because the detail section
		// is grouped under Property, while the actual interface member is a PropertySignature.
		const config = createConfig([base, derived, hidden], {
			exclude: (item) => item === hidden,
			hierarchy: {
				[ApiItemKind.Property]: HierarchyKind.Document,
				[ApiItemKind.PropertySignature]: HierarchyKind.Document,
			},
		});
		const sections = transformApiTypeLike(derived, config, () =>
			expect.fail("The local property has its own document."),
		);
		expect(sections.map((section) => section.heading?.title)).to.deep.equal(["Properties"]);
		const properties = getTable(sections, "Properties");
		expect(getColumnNames(properties)).not.to.include("Inherited From");
		expect(properties.children[1].children[0].children).to.deep.equal([
			getLinkForApiItem(local, config),
		]);

		// The visibility rule for specialized types does not change ordinary excerpt links.
		const typeCell =
			properties.children[1].children[getColumnNames(properties).indexOf("Type")];
		expect(typeCell.children).to.deep.equal([getLinkForApiItem(hidden, config, "Position")]);
	});

	it("keeps a class's static and instance properties in separate tables", () => {
		const options = {
			docComment: undefined,
			releaseTag: ReleaseTag.Public,
			isAbstract: false,
			isOptional: false,
			isProtected: false,
			isReadonly: true,
			excerptTokens: [],
			propertyTypeTokenRange: { startIndex: 0, endIndex: 0 },
		};
		const shared = new ApiProperty({ ...options, name: "shared", isStatic: true });
		const own = new ApiProperty({ ...options, name: "own", isStatic: false });
		const item = createClass("Reader", [shared, own]);
		const config = createConfig([item], { includeInheritedMembers: true });
		const sections = transformApiTypeLike(item, config, () => []);

		// Both properties are declared on Reader. Splitting them by the static modifier must not
		// introduce an Inherited From column in either table, even though inheritance is enabled.
		for (const [heading, member] of [
			["Static Properties", shared],
			["Properties", own],
		] as const) {
			const table = getTable(sections, heading);
			expect(getColumnNames(table)).not.to.include("Inherited From");
			expect(table.children.slice(1).map((row) => row.children[0].children)).to.deep.equal([
				[getLinkForApiItem(member, config)],
			]);
		}
	});

	it("marks inherited protected methods and properties without changing declared modifiers", () => {
		const value = new ApiProperty({
			name: "value",
			docComment: undefined,
			releaseTag: ReleaseTag.Public,
			isAbstract: false,
			isOptional: false,
			isProtected: true,
			isStatic: false,
			excerptTokens: [],
			isReadonly: true,
			propertyTypeTokenRange: { startIndex: 0, endIndex: 0 },
		});
		const read = createClassMethod("read", { isProtected: true });
		const base = createClass("Base", [value, read]);
		const derived = createClass("Derived", [], base);
		const config = createConfig([base, derived], { includeInheritedMembers: true });

		// On Base, the property already shows readonly and the method needs no Modifiers column.
		const declared = transformApiTypeLike(base, config, () => []);
		const properties = getTable(declared, "Properties");
		const readonlyModifier = { type: "inlineCode", value: "readonly" };
		const modifierColumn = getColumnNames(properties).indexOf("Modifiers");
		expect(properties.children[1].children[modifierColumn].children).to.deep.equal([
			readonlyModifier,
		]);
		expect(getColumnNames(getTable(declared, "Methods"))).not.to.include("Modifiers");

		// Derived has no local signature to show access. Its method therefore needs a Modifiers column
		// even though that column was absent on Base; its property must retain readonly as well.
		const inherited = transformApiTypeLike(derived, config, () => []);
		const protectedModifier = { type: "inlineCode", value: "protected" };
		for (const [heading, expected] of [
			["Methods", [protectedModifier]],
			["Properties", [protectedModifier, { type: "text", value: ", " }, readonlyModifier]],
		] as const) {
			const table = getTable(inherited, heading);
			const columns = getColumnNames(table);
			expect(columns).to.include("Modifiers");
			expect(table.children[1].children[columns.indexOf("Modifiers")].children).to.deep.equal(
				expected,
			);
		}
	});
});
