/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This module evaluates the website's warning-selection policy using API items created in memory.
// Release levels, modifier tags, and deprecation blocks are supplied directly, without parsing comments or API reports.
// The real layout and documenter utilities are used so the tests do not mock the tag policy they evaluate.
//
// Keep the model dependency aligned with api-markdown-documenter.
// Its modifier-tag utilities use instanceof checks, so separate model copies would make tags invisible.

import {
	type ApiItem,
	getApiItemTransformationConfigurationWithDefaults,
	type Section,
	type SectionContent,
} from "@fluid-tools/api-markdown-documenter";
import {
	ApiEntryPoint,
	ApiInterface,
	ApiModel,
	ApiPackage,
	ApiPropertySignature,
	ExcerptTokenKind,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import {
	DocBlock,
	DocBlockTag,
	DocComment,
	DocParagraph,
	DocPlainText,
	TSDocConfiguration,
	TSDocTagDefinition,
	TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";
import type { ContainerDirective } from "mdast-util-directive";
import { beforeEach, describe, expect, it } from "vitest";

// Tests intentionally exercise the website's API documentation layout.
// eslint-disable-next-line import/no-internal-modules
import { layoutContent } from "../../infra/api-markdown-documenter/api-documentation-layout.mjs";

// Keep expected titles independent of the layout's notice definitions.
// Exact title arrays detect missing, duplicated, or unexpected warnings as well as incorrect warning text.
const systemWarning =
	"This API is reserved for internal system use and should not be imported directly. It may change at any time without notice.";
const alphaWarning = "This API is provided as an alpha preview and may change without notice.";
const betaWarning = "This API is provided as a beta preview and may change without notice.";
const deprecationWarning = "This API is deprecated and will be removed in a future release.";

/**
 * The ownership tree for the current test's API items.
 *
 * @remarks
 * Each test gets a fresh model so API items and their parent links are not shared between cases.
 * The package and entry point provide the ownership information the layout needs for import notices.
 */
let apiModel: ApiModel;

/**
 * The entry point to which the current test's interfaces are attached.
 */
let apiEntryPoint: ApiEntryPoint;

/**
 * Configuration shared by the in-memory documentation nodes.
 */
const tsdocConfiguration = new TSDocConfiguration();
tsdocConfiguration.addTagDefinition(
	new TSDocTagDefinition({
		tagName: "@system",
		syntaxKind: TSDocTagSyntaxKind.ModifierTag,
	}),
);

/**
 * Creates a comment containing only the tags needed by a test.
 *
 * @remarks
 * Constructing comment nodes directly keeps parsing outside the scope of these layout tests.
 *
 * @param modifierTags - Modifier tag names, including the leading `@`.
 * @param deprecationMessage - Text for an optional deprecation block.
 */
function createDocComment(
	modifierTags: readonly string[] = [],
	deprecationMessage?: string,
): DocComment {
	const comment = new DocComment({ configuration: tsdocConfiguration });
	for (const tagName of modifierTags) {
		comment.modifierTagSet.addTag(
			new DocBlockTag({ configuration: tsdocConfiguration, tagName }),
		);
	}

	if (deprecationMessage !== undefined) {
		const block = new DocBlock({
			configuration: tsdocConfiguration,
			blockTag: new DocBlockTag({
				configuration: tsdocConfiguration,
				tagName: "@deprecated",
			}),
		});
		block.content.appendNode(
			new DocParagraph({ configuration: tsdocConfiguration }, [
				new DocPlainText({
					configuration: tsdocConfiguration,
					text: deprecationMessage,
				}),
			]),
		);
		comment.deprecatedBlock = block;
	}

	return comment;
}

/**
 * Creates an interface in the current test's entry point.
 *
 * @remarks
 * The optional base supplies an `extends` reference, not a containment parent.
 * Attaching the interface with `addMember` establishes its package ownership independently of that reference.
 *
 * @param releaseTag - The interface's declared release level, supplied independently of its comment's modifier tags.
 * @param base - An optional base interface already attached to the current model.
 */
function createApi(
	name: string,
	releaseTag: ReleaseTag,
	modifierTags: readonly string[] = [],
	base?: ApiInterface,
): ApiInterface {
	const api = new ApiInterface({
		name,
		releaseTag,
		docComment: createDocComment(modifierTags),
		isExported: true,
		typeParameters: [],
		excerptTokens: [
			{
				kind: ExcerptTokenKind.Content,
				text: `export interface ${name}${base === undefined ? "" : " extends "}`,
			},
			...(base === undefined
				? []
				: [
						{
							kind: ExcerptTokenKind.Reference,
							text: base.displayName,
							canonicalReference: base.canonicalReference.toString(),
						},
					]),
		],
		extendsTokenRanges: base === undefined ? [] : [{ startIndex: 1, endIndex: 2 }],
	});
	apiEntryPoint.addMember(api);
	return api;
}

/**
 * Creates a property belonging to an interface.
 *
 * @remarks
 * The default public release level is deliberate.
 * A preview warning for that property must come from its containing interface rather than an explicit alpha or beta release level on the property.
 */
function createMember(
	api: ApiInterface,
	name = "member",
	releaseTag = ReleaseTag.Public,
	docComment = createDocComment(),
): ApiPropertySignature {
	const member = new ApiPropertySignature({
		name,
		releaseTag,
		docComment,
		isOptional: false,
		isReadonly: true,
		excerptTokens: [
			{ kind: ExcerptTokenKind.Content, text: `${name}: ` },
			{ kind: ExcerptTokenKind.Content, text: "string" },
		],
		propertyTypeTokenRange: { startIndex: 1, endIndex: 2 },
	});
	api.addMember(member);
	return member;
}

/**
 * A layout section that can contain Docusaurus admonitions.
 *
 * @remarks
 * The documenter's `Section` type describes standard Markdown blocks.
 * The website also includes container directives for admonitions, which this test-only type adds to the allowed children.
 * Nested sections remain valid so the same visitor can inspect both interface and member layouts.
 */
type LayoutSection = Omit<Section, "children"> & {
	readonly children: readonly (SectionContent | ContainerDirective | LayoutSection)[];
};

/**
 * Returns warning-admonition titles for an API item.
 *
 * @remarks
 * Only the selected declaration is laid out; item-specific child content is omitted.
 * A member's containing type still affects its effective release level, but the containing type's own rendered warning is not included in the result.
 * The layout wraps member content in an extra section, so warning discovery traverses sections.
 *
 * @returns Warning titles in layout order.
 * Other admonition kinds, warning bodies, and non-warning documentation are not included.
 * @throws If a warning does not follow the website's title format.
 */
function getWarningTitles(apiItem: ApiItem): string[] {
	const config = getApiItemTransformationConfigurationWithDefaults({ apiModel });
	const sections: readonly LayoutSection[] = layoutContent(apiItem, undefined, config);
	const titles: string[] = [];

	/**
	 * Collects warning titles from a section and its nested sections.
	 *
	 * @remarks
	 * The website's `createAdmonition` helper stores the title in the first paragraph and marks it with `directiveLabel`.
	 * Its title consists of plain-text nodes.
	 * Reject unexpected title structures rather than skipping them, which could hide a warning from an assertion.
	 */
	function visitSection(section: LayoutSection): void {
		for (const child of section.children) {
			if (child.type === "section") {
				visitSection(child);
			} else if (child.type === "containerDirective" && child.name === "warning") {
				const label = child.children[0];
				if (label?.type !== "paragraph" || label.data?.directiveLabel !== true) {
					throw new Error("Warning admonition does not have a title.");
				}
				titles.push(
					label.children
						.map((node) => {
							if (node.type !== "text") {
								throw new Error("Warning admonition title is not plain text.");
							}
							return node.value;
						})
						.join(""),
				);
			}
		}
	}

	for (const section of sections) {
		visitSection(section);
	}
	return titles;
}

describe("API documentation layout", () => {
	beforeEach(() => {
		apiModel = new ApiModel();
		const apiPackage = new ApiPackage({
			name: "layout-tests",
			docComment: undefined,
			tsdocConfiguration,
		});
		apiEntryPoint = new ApiEntryPoint({ name: "" });
		apiModel.addMember(apiPackage);
		apiPackage.addMember(apiEntryPoint);
	});

	describe("System API warnings", () => {
		// Vary the release level while keeping @system on the declaration itself.
		// Expecting exactly one warning verifies precedence, not merely the presence of a system notice.
		describe("explicit system tags", () => {
			it.each([
				{ name: "AlphaApi", releaseTag: ReleaseTag.Alpha },
				{ name: "BetaApi", releaseTag: ReleaseTag.Beta },
				{ name: "PublicApi", releaseTag: ReleaseTag.Public },
			])("retains the system warning for $name", ({ name, releaseTag }) => {
				const api = createApi(name, releaseTag, ["@system"]);
				expect(getWarningTitles(api)).toEqual([systemWarning]);
			});

			// This member combines @system, @alpha, and @deprecated in its own comment.
			// It must retain the system notice without adding either competing notice.
			it("keeps an explicit member system warning ahead of alpha and deprecation notices", () => {
				const api = createApi("AlphaApi", ReleaseTag.Alpha, ["@system"]);
				const member = createMember(
					api,
					"systemMember",
					ReleaseTag.Alpha,
					createDocComment(["@system", "@alpha"], "Retired system API."),
				);
				expect(getWarningTitles(member)).toEqual([systemWarning]);
			});
		});

		// These members have no @system tag, despite belonging to explicitly system-tagged interfaces.
		// Alpha and beta cases also ensure that removing system-tag propagation does not remove release-level inheritance.
		describe("members without system tags", () => {
			it("retains the containing type's alpha release level without its system warning", () => {
				const api = createApi("AlphaApi", ReleaseTag.Alpha, ["@system"]);
				expect(getWarningTitles(createMember(api))).toEqual([alphaWarning]);
			});

			it("retains the containing type's beta release level without its system warning", () => {
				const api = createApi("BetaApi", ReleaseTag.Beta, ["@system"]);
				expect(getWarningTitles(createMember(api))).toEqual([betaWarning]);
			});

			// An empty title list means there are no warning admonitions, not that the layout has no documentation.
			it("does not warn about a public member of a system type", () => {
				const api = createApi("PublicApi", ReleaseTag.Public, ["@system"]);
				expect(getWarningTitles(createMember(api))).toEqual([]);
			});

			// The public release level isolates deprecation from alpha and beta notice selection.
			// An ancestor system tag must not bypass this member's own deprecation handling.
			it("does not suppress a member's deprecation notice because its type is system-only", () => {
				const api = createApi("PublicApi", ReleaseTag.Public, ["@system"]);
				const member = createMember(
					api,
					"deprecatedMember",
					ReleaseTag.Public,
					createDocComment([], "Use member instead."),
				);
				expect(getWarningTitles(member)).toEqual([deprecationWarning]);
			});
		});

		// This case models TypeScript `extends`, not containment inside a system-tagged type.
		// The derived interface has its own alpha release level; extending AlphaApi must not copy the base type's @system tag.
		it("does not inherit a system warning from an extended interface", () => {
			const base = createApi("AlphaApi", ReleaseTag.Alpha, ["@system"]);
			const derived = createApi("DerivedInterface", ReleaseTag.Alpha, [], base);
			expect(getWarningTitles(derived)).toEqual([alphaWarning]);
		});
	});
});
