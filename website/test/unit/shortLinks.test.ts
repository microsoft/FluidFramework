/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GlobalDoc, GlobalVersion } from "@docusaurus/plugin-content-docs/client";
import type { ApiItemKind } from "@fluid-tools/api-markdown-documenter";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useActivePluginAndVersion } = vi.hoisted(() => ({
	useActivePluginAndVersion: vi.fn(),
}));

vi.mock("@docusaurus/plugin-content-docs/client", () => ({
	useActivePluginAndVersion,
	useDoc: vi.fn(),
}));

// Tests intentionally reach into the website's component implementation.
// eslint-disable-next-line import/no-internal-modules
import { ApiLink, type ApiLinkProps } from "../../src/components/shortLinks.js";

function createDocument(id: string, path: string): GlobalDoc {
	return { id, path };
}

function useDocuments(documents: GlobalDoc[]): void {
	const activeVersion: GlobalVersion = {
		name: "current",
		label: "Current",
		isLast: true,
		path: "/docs",
		mainDocId: "introduction",
		docs: documents,
		draftIds: [],
	};
	useActivePluginAndVersion.mockReturnValue({ activeVersion });
}

function renderApiLink(props: ApiLinkProps): { href: string; children: ReactNode } {
	const link = ApiLink(props) as ReactElement<{ href: string; children: ReactNode }>;
	return { href: link.props.href, children: link.props.children };
}

describe("ApiLink", () => {
	afterEach(() => {
		useActivePluginAndVersion.mockReset();
	});

	it("infers the API type when exactly one document matches", () => {
		useDocuments([
			createDocument(
				"api/fluid-framework/ifluidcontainer-interface",
				"/docs/api/fluid-framework/ifluidcontainer-interface",
			),
		]);

		expect(
			renderApiLink({
				packageName: "fluid-framework",
				apiName: "IFluidContainer",
			}),
		).toEqual({
			href: "/docs/api/fluid-framework/ifluidcontainer-interface",
			children: "IFluidContainer",
		});
	});

	it("uses the versioned document path and appends a heading", () => {
		useDocuments([
			createDocument(
				"api/container-loader/iloaderprops-interface",
				"/docs/v1/api/container-loader/iloaderprops-interface",
			),
		]);

		expect(
			renderApiLink({
				packageName: "container-loader",
				apiName: "ILoaderProps",
				headingId: "logger-propertysignature",
				children: "logger",
			}),
		).toEqual({
			href: "/docs/v1/api/container-loader/iloaderprops-interface#logger-propertysignature",
			children: "logger",
		});
	});

	it("uses apiType to disambiguate documents with the same API name", () => {
		useDocuments([
			createDocument("api/example/widget-class", "/docs/api/example/widget-class"),
			createDocument("api/example/widget-interface", "/docs/api/example/widget-interface"),
		]);

		expect(
			renderApiLink({
				packageName: "example",
				apiName: "Widget",
				apiType: "Class" as ApiItemKind,
			}),
		).toEqual({
			href: "/docs/api/example/widget-class",
			children: "Widget",
		});
	});

	it("throws when rendered outside a versioned Docusaurus document", () => {
		useActivePluginAndVersion.mockReturnValue(undefined);

		expect(() => renderApiLink({ packageName: "example", apiName: "Widget" })).toThrowError(
			"ApiLink must be rendered within a versioned Docusaurus document.",
		);
	});

	it("throws when no API document matches", () => {
		useDocuments([
			createDocument(
				"api/example/widget-namespace/member-class",
				"/docs/api/example/widget-namespace/member-class",
			),
		]);

		expect(() => renderApiLink({ packageName: "example", apiName: "Widget" })).toThrowError(
			'No API documentation found for "example/Widget".',
		);
	});

	it("throws when the specified API type does not match", () => {
		useDocuments([
			createDocument("api/example/widget-interface", "/docs/api/example/widget-interface"),
		]);

		expect(() =>
			renderApiLink({
				packageName: "example",
				apiName: "Widget",
				apiType: "Class" as ApiItemKind,
			}),
		).toThrowError('No API documentation found for "example/Widget" with type "Class".');
	});

	it("throws with candidate types when API name inference is ambiguous", () => {
		useDocuments([
			createDocument("api/example/widget-class", "/docs/api/example/widget-class"),
			createDocument("api/example/widget-interface", "/docs/api/example/widget-interface"),
		]);

		expect(() => renderApiLink({ packageName: "example", apiName: "Widget" })).toThrowError(
			'Multiple API documents found for "example/Widget" (class, interface). Specify `apiType` to disambiguate the link.',
		);
	});
});
