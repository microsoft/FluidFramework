/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GlobalVersion } from "@docusaurus/plugin-content-docs/client";
import { ApiItemKind } from "@fluid-tools/api-markdown-documenter";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
					{ apiType: ApiItemKind.Class, documentPath: "example/widget-class" },
					{ apiType: ApiItemKind.Interface, documentPath: "example/widget-interface" },
				],
				"Widget.run": [
					{
						apiType: ApiItemKind.Method,
						overloadIndex: 1,
						documentPath: "example/widget-class",
						headingId: "run-method",
					},
					{
						apiType: ApiItemKind.Method,
						overloadIndex: 2,
						documentPath: "example/widget-class",
						headingId: "run_1-method",
					},
				],
			},
		},
		"1": {
			example: {
				Widget: [
					{ apiType: ApiItemKind.Interface, documentPath: "example/widget-interface" },
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
				packageName: "example",
				apiName: "Widget",
			}),
		).toEqual({
			href: "/docs/v1/api/example/widget-interface",
			children: "Widget",
		});
	});

	it("resolves qualified members and defaults to overload one", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(
			renderApiLink({
				packageName: "example",
				apiName: "Widget.run",
			}),
		).toEqual({
			href: "/docs/api/example/widget-class#run-method",
			children: "Widget.run",
		});
	});

	it("selects an explicit API kind and overload", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(
			renderApiLink({
				packageName: "example",
				apiName: "Widget.run",
				apiType: ApiItemKind.Method,
				overloadIndex: 2,
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
				packageName: "example",
				apiName: "Widget.run",
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

		expect(() => renderApiLink({ packageName: "example", apiName: "Widget" })).toThrowError(
			"ApiLink must be rendered within a versioned Docusaurus document.",
		);
	});

	it("throws when the active version manifest is missing", () => {
		useVersion("local", "/docs/local");
		useMockApiLinkManifests();

		expect(() => renderApiLink({ packageName: "example", apiName: "Widget" })).toThrowError(
			'No API link manifest found for documentation version "local".',
		);
	});

	it("throws when no API target matches", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() => renderApiLink({ packageName: "example", apiName: "Missing" })).toThrowError(
			'No API documentation found for "example/Missing".',
		);
	});

	it("throws when the specified API type does not match", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() =>
			renderApiLink({
				packageName: "example",
				apiName: "Widget",
				apiType: ApiItemKind.Namespace,
			}),
		).toThrowError('No API documentation found for "example/Widget" with type "Namespace".');
	});

	it("throws with candidate types when API name inference is ambiguous", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() => renderApiLink({ packageName: "example", apiName: "Widget" })).toThrowError(
			'API "Widget" in package "example" is ambiguous. Specify `apiType`. Available kinds: Class, Interface.',
		);
	});

	it("throws when an explicit overload does not match", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() =>
			renderApiLink({
				packageName: "example",
				apiName: "Widget.run",
				overloadIndex: 3,
			}),
		).toThrowError(
			'No API documentation found for "example/Widget.run" with overload index 3.',
		);
	});
});
