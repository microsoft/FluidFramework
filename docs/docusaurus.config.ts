/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
require('dotenv').config();
import type { VersionOptions } from "@docusaurus/plugin-content-docs";
import * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";


import DocsVersions from "./config/docs-versions.mjs";

const includeLocalApiDocs = process.env.LOCAL_API_DOCS === "true";

const githubUrl = "https://github.com/microsoft/FluidFramework";
const githubMainBranchUrl = `${githubUrl}/tree/main`;
const githubDocsUrl = `${githubMainBranchUrl}/docs`;

// #region Generate the Docusaurus versions from our versions config.

const versionsConfig: { [versionName: string]: VersionOptions } = {
	current: {
		label: DocsVersions.currentVersion.label,
		badge: false,
		banner: "none",
	},
};

for (const version of DocsVersions.otherVersions) {
	versionsConfig[version.version] = {
		label: version.label,
		path: version.path,
		badge: true,
		banner: "unmaintained",
	};
}

if (includeLocalApiDocs) {
	versionsConfig[DocsVersions.local.version] = {
		label: DocsVersions.local.label,
		path: DocsVersions.local.path,
		badge: true,
		banner: "unreleased",
	};
}

// #endregion

const config: Config = {
	title: "Fluid Framework",
	tagline: "Build collaborative apps fast!",
	favicon: "assets/fluid-icon.svg",

	// Set the production url of your site here
	url: "https://fluidframework.com/",
	// Set the /<baseUrl>/ pathname under which your site is served
	// For GitHub pages deployment, it is often '/<projectName>/'
	baseUrl: "/",

	onBrokenAnchors: "throw",
	onBrokenLinks: "throw",
	onBrokenMarkdownLinks: "throw",
	onDuplicateRoutes: "throw",

	// Even if you don't use internationalization, you can use this field to set
	// useful metadata like html lang. For example, if your site is Chinese, you
	// may want to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: "en",
		locales: ["en"],
	},
	// TODO: consider re-enabling after the following issue is resolved:
	// <https://github.com/Azure/static-web-apps/issues/1036>
	// trailingSlash: false,
	plugins: ["docusaurus-plugin-sass"],
	presets: [
		[
			"classic",
			{
				docs: {
					sidebarPath: "./sidebars.ts",
					lastVersion: "current",
					includeCurrentVersion: true,
					versions: versionsConfig,
					// Determines whether or not to display an "Edit this page" link at
					// the bottom of each page.
					editUrl: ({ version, versionDocsDirPath, docPath, permalink, locale }) => {
						// If the doc is a generated API document, don't display edit link.
						if (docPath.startsWith("api/")) {
							return undefined;
						}
						return `${githubDocsUrl}/${versionDocsDirPath}${docPath}`;
					},
				},
				// We can add support for blog posts in the future.
				blog: undefined,
				theme: {
					customCss: ["./src/css/custom.scss", "./src/css/typography.scss"],
				},
			} satisfies Preset.Options,
		],
	],
	markdown: {
		// `.mdx` files will be treated as MDX, and `.md` files will be treated as standard Markdown.
		// Needed to support current API docs output, which is not MDX compatible.
		format: "detect",
		mermaid: true,
	},
	themeConfig: {
		colorMode: {
			// Default to user's browser preference
			respectPrefersColorScheme: true,
		},

		// TODO: As needed, we can enable this to show an announcement bar.
		// announcementBar: {
		// 	id: "fluid-2-announcement",
		// 	content: '🎉 Fluid Framework 2 is now in General Availability! <a target="_blank" rel="noreferrer" href="https://aka.ms/fluid/release_blog">Learn more</a>.',
		// 	isCloseable: true,
		// },

		// Top nav-bar
		navbar: {
			title: "Fluid Framework",
			logo: {
				alt: "Fluid Framework Logo",
				src: "assets/fluid-icon.svg",
			},
			items: [
				{
					type: "docsVersionDropdown",
					position: "left",
					dropdownActiveClassDisabled: true,
				},
				{
					type: "docSidebar",
					sidebarId: "docsSidebar",
					position: "left",
					label: "Docs",
				},
				{ to: "/community/", label: "Community", position: "left" },
				{ to: "/support/", label: "Support", position: "left" },
			],
		},
		// Note: we have configured a custom footer component. See src/theme/Footer/index.tsx.
		prism: {
			theme: prismThemes.vsLight,
			darkTheme: prismThemes.vsDark,
		},
	} satisfies Preset.ThemeConfig,
	themes: [
		// Theme for rendering Mermaid diagrams in markdown.
		"@docusaurus/theme-mermaid",

		// Theme that adds local search support (including generating an index as a part of the build).
		[
			"@easyops-cn/docusaurus-search-local",
			{
				// `hashed` is recommended as long-term-cache of index file is possible.
				hashed: true,

				// Include pages (as opposed to docs) in search results.
				// Default: false
				indexPages: true,
			},
		],
	],
	headTags: [
		{
			tagName: "script",
			attributes: {
				src: "https://wcpstatic.microsoft.com/mscc/lib/v2/wcp-consent.js",
				async: "true",
			},
		},
	],
	customFields: {
		'INSTRUMENTATION_KEY': process.env.INSTRUMENTATION_KEY,
		'APPLICATION_ID': process.env.APPLICATION_ID,
	}
};

export default config;
