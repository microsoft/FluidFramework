/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Plugin, PluginContentLoadedActions } from "@docusaurus/types";
import { ApiItemKind } from "@fluid-tools/api-markdown-documenter";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock("node:fs/promises", () => ({ readFile }));

// Tests intentionally exercise the website's Docusaurus plugin implementation.
/* eslint-disable import/no-internal-modules */
import {
	apiLinkManifestPlugin,
	type ApiLinkManifest,
	type ApiLinkManifests,
	apiLinkManifestPluginName,
} from "../../src/plugins/apiLinkManifestPlugin.js";
/* eslint-enable import/no-internal-modules */

const v1Manifest: ApiLinkManifest = {
	example: {
		Widget: [
			{
				path: [{ name: "Widget", apiType: ApiItemKind.Interface }],
				documentPath: "example/widget-interface",
			},
		],
	},
};

const v2Manifest: ApiLinkManifest = {
	example: {
		Widget: [
			{
				path: [{ name: "Widget", apiType: ApiItemKind.Class }],
				documentPath: "example/widget-class",
			},
		],
	},
};

async function createPlugin(): Promise<Plugin> {
	return apiLinkManifestPlugin({
		"current": "/manifests/v2.json",
		"1": "/manifests/v1.json",
	});
}

describe("apiLinkManifestPlugin", () => {
	beforeEach(() => {
		readFile.mockReset();
	});

	it("loads manifests using Docusaurus version names", async () => {
		readFile.mockImplementation(async (manifestPath: string) => {
			return JSON.stringify(manifestPath === "/manifests/v1.json" ? v1Manifest : v2Manifest);
		});
		const plugin = await createPlugin();

		await expect(plugin.loadContent?.()).resolves.toEqual({
			"current": v2Manifest,
			"1": v1Manifest,
		});
		expect(readFile).toHaveBeenCalledWith("/manifests/v2.json", "utf8");
		expect(readFile).toHaveBeenCalledWith("/manifests/v1.json", "utf8");
	});

	it("publishes loaded manifests as global plugin data", async () => {
		const plugin = await createPlugin();
		const manifests: ApiLinkManifests = { "current": v2Manifest, "1": v1Manifest };
		const setGlobalData = vi.fn();
		const actions: PluginContentLoadedActions = {
			addRoute: vi.fn(),
			createData: vi.fn(),
			setGlobalData,
		};

		await plugin.contentLoaded?.({
			content: manifests,
			actions,
		});

		expect(plugin.name).toBe(apiLinkManifestPluginName);
		expect(setGlobalData).toHaveBeenCalledOnce();
		expect(setGlobalData).toHaveBeenCalledWith(manifests);
	});
});
