/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiClass,
	type ApiItem,
	ApiItemKind,
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

	it("omits base members by default and does not inline details for a local member with its own document", () => {
		const base = createInterface("Base", { members: [createMethod("read")] });
		const local = createProperty("position");
		const derived = createInterface("Derived", {
			bases: [createReferenceToken("Base", "test-api!Base:interface")],
			members: [local],
		});

		// Leave inheritance at its default. Set both property kinds to Document because the detail section
		// is grouped under Property, while the actual interface member is a PropertySignature.
		const config = createConfig([base, derived], {
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
		const item = new ApiClass({
			name: "Reader",
			docComment: undefined,
			isAbstract: false,
			isExported: true,
			releaseTag: ReleaseTag.Public,
			typeParameters: [],
			excerptTokens: [],
			extendsTokenRange: undefined,
			implementsTokenRanges: [],
			members: [shared, own],
		});
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
});
