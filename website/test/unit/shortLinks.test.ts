/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GlobalVersion } from "@docusaurus/plugin-content-docs/client";
import { ApiItemKind } from "@fluid-tools/api-markdown-documenter";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const { useActivePluginAndVersion, usePluginData } = vi.hoisted(() => ({
	useActivePluginAndVersion: vi.fn(),
	usePluginData: vi.fn(),
}));

vi.mock("@docusaurus/plugin-content-docs/client", () => ({
	useActivePluginAndVersion,
	useDoc: vi.fn(),
}));

vi.mock("@docusaurus/useGlobalData", () => ({ usePluginData }));

// Tests intentionally reach into the website's component implementation and data contract.
/* eslint-disable import/no-internal-modules */
import type { ApiLinkManifests } from "../../src/apiLinkManifest.js";
import type { ApiDeclarationReference } from "../../src/apiLinkReference.js";
import { ApiLink, type ApiLinkProps } from "../../src/components/shortLinks.js";
/* eslint-enable import/no-internal-modules */

function useVersion(name: string, path: string): void {
	const activeVersion: GlobalVersion = {
		name,
		label: name,
		isLast: true,
		path,
		mainDocId: "introduction",
		docs: [],
		draftIds: [],
	};
	useActivePluginAndVersion.mockReturnValue({ activeVersion });
}

function createMockApiLinkManifests(): ApiLinkManifests {
	return {
		"current": {
			example: {
				"Widget": [
					{
						path: [{ name: "Widget", apiType: ApiItemKind.Class }],
						documentPath: "example/widget-class",
					},
					{
						path: [{ name: "Widget", apiType: ApiItemKind.Interface }],
						documentPath: "example/widget-interface",
					},
				],
				"Widget.run": [
					{
						path: [
							{ name: "Widget", apiType: ApiItemKind.Class },
							{ name: "run", apiType: ApiItemKind.Method, overloadIndex: 1 },
						],
						documentPath: "example/widget-class",
						headingId: "run-method",
					},
					{
						path: [
							{ name: "Widget", apiType: ApiItemKind.Class },
							{ name: "run", apiType: ApiItemKind.Method, overloadIndex: 2 },
						],
						documentPath: "example/widget-class",
						headingId: "run_1-method",
					},
					{
						path: [
							{ name: "Widget", apiType: ApiItemKind.Interface },
							{ name: "run", apiType: ApiItemKind.MethodSignature, overloadIndex: 1 },
						],
						documentPath: "example/widget-interface",
						headingId: "run-methodsignature",
					},
				],
			},
		},
		"1": {
			example: {
				Widget: [
					{
						path: [{ name: "Widget", apiType: ApiItemKind.Interface }],
						documentPath: "example/widget-interface",
					},
				],
			},
		},
	};
}

function useMockApiLinkManifests(): void {
	usePluginData.mockReturnValue(createMockApiLinkManifests());
}

function renderApiLink(props: ApiLinkProps): { href: string; children: ReactNode } {
	const link = ApiLink(props) as ReactElement<{ href: string; children: ReactNode }>;
	return { href: link.props.href, children: link.props.children };
}

describe("ApiLink", () => {
	afterEach(() => {
		useActivePluginAndVersion.mockReset();
		usePluginData.mockReset();
	});

	it("uses the active version manifest and versioned path", () => {
		useVersion("1", "/docs/v1");
		useMockApiLinkManifests();

		expect(
			renderApiLink({
				package: "example",
				api: "Widget",
			}),
		).toEqual({
			href: "/docs/v1/api/example/widget-interface",
			children: "Widget",
		});
	});

	it("resolves a selected parent and defaults to overload one", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(
			renderApiLink({
				package: "example",
				api: "(Widget:class).run",
			}),
		).toEqual({
			href: "/docs/api/example/widget-class#run-method",
			children: "Widget.run",
		});
	});

	it("selects parent kind and overload in the declaration reference", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(
			renderApiLink({
				package: "example",
				api: "(Widget:class).(run:2)",
			}),
		).toEqual({
			href: "/docs/api/example/widget-class#run_1-method",
			children: "Widget.run",
		});
	});

	it("allows a compatibility heading to override the manifest heading", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(
			renderApiLink({
				package: "example",
				api: "(Widget:class).run",
				headingId: "legacy-heading",
			}),
		).toEqual({
			href: "/docs/api/example/widget-class#legacy-heading",
			children: "Widget.run",
		});
	});

	it("throws when rendered outside a versioned Docusaurus document", () => {
		useActivePluginAndVersion.mockReturnValue(undefined);
		useMockApiLinkManifests();

		expect(() => renderApiLink({ package: "example", api: "Widget" })).toThrowError(
			"ApiLink must be rendered within a versioned Docusaurus document.",
		);
	});

	it("throws when the active version manifest is missing", () => {
		useVersion("local", "/docs/local");
		useMockApiLinkManifests();

		expect(() => renderApiLink({ package: "example", api: "Widget" })).toThrowError(
			'No API link manifest found for documentation version "local".',
		);
	});

	it("throws when no API target matches", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() => renderApiLink({ package: "example", api: "Missing" })).toThrowError(
			'No API documentation found for "example/Missing".',
		);
	});

	it("throws when a kind selector does not match", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() =>
			renderApiLink({
				package: "example",
				api: "(Widget:namespace)",
			}),
		).toThrowError('No API documentation found for "example/(Widget:namespace)".');
	});

	it("throws with available selectors when a parent segment is ambiguous", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() => renderApiLink({ package: "example", api: "Widget.run" })).toThrowError(
			'API segment "Widget" in "example/Widget.run" is ambiguous. Specify a selector. Available segments: (Widget:class), (Widget:interface).',
		);
	});

	it("throws when a numeric overload selector does not match", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() =>
			renderApiLink({
				package: "example",
				api: "(Widget:class).(run:3)",
			}),
		).toThrowError('No API documentation found for "example/(Widget:class).(run:3)".');
	});

	it("throws for malformed declaration-reference syntax", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() => renderApiLink({ package: "example", api: "(Widget:interface" })).toThrowError(
			/Invalid API declaration reference/,
		);
	});

	it("throws for unsupported TSDoc selectors", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() => renderApiLink({ package: "example", api: "(Widget:static)" })).toThrowError(
			'Unsupported selector "static" in API declaration reference "(Widget:static)".',
		);
	});
});

describe("ApiDeclarationReference", () => {
	it("accepts supported references and rejects malformed literal types", () => {
		expectTypeOf<ApiDeclarationReference<"Widget.run">>().toEqualTypeOf<"Widget.run">();
		expectTypeOf<
			ApiDeclarationReference<"(Widget:interface).(run:2)">
		>().toEqualTypeOf<"(Widget:interface).(run:2)">();
		expectTypeOf<ApiDeclarationReference<"Widget.(run:0)">>().toEqualTypeOf<never>();
		expectTypeOf<ApiDeclarationReference<"(Widget:static).run">>().toEqualTypeOf<never>();
		expectTypeOf<ApiDeclarationReference<"Widget.(run:2).result">>().toEqualTypeOf<never>();
	});
});
