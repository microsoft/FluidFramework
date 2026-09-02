/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GlobalVersion } from "@docusaurus/plugin-content-docs/client";
import { ApiItemKind } from "@fluid-tools/api-markdown-documenter";
import { createElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const { useActivePluginAndVersion, usePluginData } = vi.hoisted(() => ({
	useActivePluginAndVersion: vi.fn(),
	usePluginData: vi.fn(),
}));

vi.mock("@docusaurus/plugin-content-docs/client", () => ({
	useActivePluginAndVersion,
}));

vi.mock("@docusaurus/useGlobalData", () => ({ usePluginData }));

// Tests intentionally reach into the website's component implementation and data contract.
/* eslint-disable import/no-internal-modules */
import type { ApiLinkManifests } from "../../src/apiLinkManifest.js";
import type { ApiDeclarationReference } from "../../src/apiLinkReference.js";
import { ApiLink, type ApiLinkProps, PackageLink } from "../../src/components/shortLinks.js";
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

describe("PackageLink", () => {
	afterEach(() => {
		useActivePluginAndVersion.mockReset();
		usePluginData.mockReset();
		vi.restoreAllMocks();
	});

	it("uses the configured path for the active documentation version", () => {
		useVersion("local", "/docs/local");

		const link = PackageLink({ package: "example" }) as ReactElement<{
			href: string;
			children: ReactNode;
		}>;

		expect({ href: link.props.href, children: link.props.children }).toEqual({
			href: "/docs/local/api/example",
			children: "example",
		});
	});

	it("renders inline code when a new package is not documented", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		const link = PackageLink({ package: "new-package", newApi: true });

		expect({ type: link.type, children: link.props.children }).toEqual({
			type: "code",
			children: "new-package",
		});
	});

	it("preserves rich children when a new package is not documented", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();
		const children = createElement("strong", undefined, "New package");

		const link = PackageLink({ package: "new-package", newApi: true, children });

		expect(link.type).toBe("code");
		expect(link.props.children).toBe(children);
	});

	it("links and warns when a new package is documented", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const link = PackageLink({ package: "example", newApi: true });
		PackageLink({ package: "example", newApi: true });

		expect({ type: link.type, href: link.props.href, children: link.props.children }).toEqual({
			type: "a",
			href: "/docs/api/example",
			children: "example",
		});
		expect(warn).toHaveBeenCalledWith(
			'[PackageLink] Package "example" exists in API documentation version "current". Remove the newApi prop.',
		);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("falls back to the original package until its replacement is documented", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const link = PackageLink({
			package: { previous: "example", new: "replacement" },
		});

		expect({ href: link.props.href, children: link.props.children }).toEqual({
			href: "/docs/api/example",
			children: "replacement",
		});
		expect(warn).not.toHaveBeenCalled();
	});

	it("uses and warns about a documented replacement package", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const link = PackageLink({
			package: { previous: "old-package", new: "example" },
		});

		expect({ href: link.props.href, children: link.props.children }).toEqual({
			href: "/docs/api/example",
			children: "example",
		});
		expect(warn).toHaveBeenCalledWith(
			'[PackageLink] New package name "example" exists in API documentation version "current". Set package="example".',
		);
	});
});

describe("ApiLink", () => {
	afterEach(() => {
		useActivePluginAndVersion.mockReset();
		usePluginData.mockReset();
		vi.restoreAllMocks();
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

	it("renders inline code with rich children when a new API is not documented", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();
		const children = createElement("strong", undefined, "New API");

		const link = ApiLink({ package: "example", api: "Missing", newApi: true, children });

		expect(link.type).toBe("code");
		expect(link.props.children).toBe(children);
	});

	it("links and warns when a new API is documented", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const link = renderApiLink({ package: "example", api: "(Widget:class)", newApi: true });

		expect(link).toEqual({
			href: "/docs/api/example/widget-class",
			children: "Widget",
		});
		expect(warn).toHaveBeenCalledWith(
			'[ApiLink] API "example/(Widget:class)" exists in API documentation version "current". Remove the newApi prop.',
		);
	});

	it("falls back to the original API until its replacement is documented", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const link = renderApiLink({
			package: "example",
			api: { previous: "(Widget:class)", new: "Replacement" },
		});

		expect(link).toEqual({
			href: "/docs/api/example/widget-class",
			children: "Widget",
		});
		expect(warn).not.toHaveBeenCalled();
	});

	it("preserves rich children while an API rename is staged", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();
		const children = createElement("strong", undefined, "Renamed API");

		const link = ApiLink({
			package: "example",
			api: { previous: "(Widget:class)", new: "Replacement" },
			children,
		});

		expect(link.type).toBe("a");
		expect(link.props.children).toBe(children);
	});

	it("renders inline code when neither API rename target is documented", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		const link = ApiLink({
			package: "example",
			api: { previous: "OldMissing", new: "NewMissing" },
			newApi: true,
		});

		expect({ type: link.type, children: link.props.children }).toEqual({
			type: "code",
			children: "NewMissing",
		});
	});

	it("uses and warns about a documented replacement API", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const link = renderApiLink({
			package: "example",
			api: { previous: "Missing", new: "(Widget:class)" },
		});

		expect(link).toEqual({
			href: "/docs/api/example/widget-class",
			children: "Widget",
		});
		expect(warn).toHaveBeenCalledWith(
			'[ApiLink] New API name "example/(Widget:class)" exists in API documentation version "current". Set api="(Widget:class)".',
		);
	});

	it("does not let newApi hide an invalid replacement reference", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() =>
			ApiLink({
				package: "example",
				api: { previous: "Missing", new: "(Widget:static)" as string },
				newApi: true,
			}),
		).toThrowError(
			'Unsupported selector "static" in API declaration reference "(Widget:static)".',
		);
	});

	it("does not let a replacement hide an invalid original reference", () => {
		useVersion("current", "/docs");
		useMockApiLinkManifests();

		expect(() =>
			ApiLink({
				package: "example",
				api: {
					previous: "(Widget:static)" as string,
					new: "(Widget:class)",
				},
			}),
		).toThrowError(
			'Unsupported selector "static" in API declaration reference "(Widget:static)".',
		);
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
		expectTypeOf<ApiLinkProps<"Widget", "(Replacement:class)">["api"]>().toEqualTypeOf<
			| "Widget"
			| {
					previous: "Widget";
					new: "(Replacement:class)";
			  }
		>();
	});
});
