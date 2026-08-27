/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const templatesDirectory = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"templates",
);

const scopeTemplates = {
	EXAMPLE: "Example-Package-Notice-Template.md",
	EXPERIMENTAL: "Experimental-Package-Notice-Template.md",
	INTERNAL: "Internal-Package-Notice-Template.md",
	PRIVATE: "Private-Package-Notice-Template.md",
	TOOLS: "Tools-Package-Notice-Template.md",
};

/**
 * Validates transform options against a small JSON-compatible schema.
 *
 * @param {unknown} value - The options value to validate.
 * @param {string} transformName - The transform name to include in an error.
 * @param {Record<string, { type: "boolean" | "integer" | "string"; default?: unknown; required?: boolean; values?: readonly string[]; minimum?: number; maximum?: number }>} schema - The accepted keys, types, defaults, and limits.
 * @returns {Record<string, unknown>} The validated options with defaults applied.
 */
function validateOptions(value, transformName, schema) {
	if (value === null || Array.isArray(value) || typeof value !== "object") {
		throw new TypeError(`Options for "${transformName}" must be an object.`);
	}
	for (const key of Object.keys(value)) {
		if (!(key in schema)) {
			throw new TypeError(`Unknown option "${key}" for transform "${transformName}".`);
		}
	}

	const result = {};
	for (const [key, definition] of Object.entries(schema)) {
		const option = Object.hasOwn(value, key) ? value[key] : definition.default;
		if (option === undefined) {
			if (definition.required === true) {
				throw new TypeError(`Transform "${transformName}" requires option "${key}".`);
			}
			continue;
		}
		if (definition.type === "integer") {
			if (!Number.isInteger(option)) {
				throw new TypeError(`Option "${key}" for "${transformName}" must be an integer.`);
			}
			if (
				(definition.minimum !== undefined && option < definition.minimum) ||
				(definition.maximum !== undefined && option > definition.maximum)
			) {
				throw new TypeError(
					`Option "${key}" for "${transformName}" must be between ${definition.minimum} and ${definition.maximum}.`,
				);
			}
		} else if (typeof option !== definition.type) {
			throw new TypeError(
				`Option "${key}" for "${transformName}" must be a ${definition.type}.`,
			);
		}
		if (definition.values !== undefined && !definition.values.includes(option)) {
			throw new TypeError(
				`Option "${key}" for "${transformName}" has invalid value "${option}".`,
			);
		}
		result[key] = option;
	}
	return result;
}

const packageSchema = {
	packageJsonPath: { type: "string", default: "./package.json" },
};

const headingSchema = {
	includeHeading: { type: "boolean", default: true },
	headingLevel: { type: "integer", default: 2, minimum: 1, maximum: 6 },
};

const scopeValues = ["FRAMEWORK", "EXAMPLE", "EXPERIMENTAL", "INTERNAL", "PRIVATE", "TOOLS"];

/**
 * Parses generated Markdown into nodes for structural composition.
 *
 * @param {string} markdown - The generated Markdown fragment.
 * @param {{ destinationPath: string; parseDocument: Function }} context - The transform context.
 * @param {string} name - The fragment name to use in the virtual path.
 * @returns {import("mdast").RootContent[]} The parsed root-content nodes.
 */
function parseFragment(markdown, context, name) {
	const virtualPath = path.join(
		path.dirname(context.destinationPath),
		`.markdown-magic-${name}.md`,
	);
	return context.parseDocument(markdown, virtualPath).tree.children;
}

/**
 * Reads and parses a shared Markdown template.
 *
 * @param {string} templateName - The template file name.
 * @param {{ destinationPath: string; parseDocument: Function }} context - The transform context.
 * @returns {Promise<import("mdast").RootContent[]>} A mutable copy of the template nodes.
 */
async function readTemplateNodes(templateName, context) {
	const templatePath = path.join(templatesDirectory, templateName);
	const source = await readFile(templatePath, "utf8");
	return structuredClone(context.parseDocument(source, templatePath).tree.children);
}

/**
 * Creates a section from a template and adjusts nested heading depths.
 *
 * @param {string} templateName - The template file name.
 * @param {{ includeHeading: boolean; headingLevel: number }} options - The heading options.
 * @param {string} headingText - The optional section heading text.
 * @param {object} context - The transform context.
 * @returns {Promise<import("mdast").RootContent[]>} The section nodes.
 */
async function generateTemplateSection(templateName, options, headingText, context) {
	if (options.headingLevel < 1 || options.headingLevel > 6) {
		throw new TypeError(`Option "headingLevel" must be between 1 and 6.`);
	}
	const nodes = await readTemplateNodes(templateName, context);
	for (const node of nodes) {
		if (node.type === "heading") {
			node.depth += options.headingLevel;
			if (node.depth > 6) {
				throw new TypeError(`Template heading depth exceeds 6.`);
			}
		}
	}
	return options.includeHeading
		? [
				{
					type: "heading",
					depth: options.headingLevel,
					children: [{ type: "text", value: headingText }],
				},
				...nodes,
			]
		: nodes;
}

/**
 * Resolves a path from the directory that contains a document.
 *
 * @param {string} documentPath - The destination document path.
 * @param {string} relativePath - The path relative to the document directory.
 * @returns {string} The absolute path.
 */
function resolveRelativePath(documentPath, relativePath) {
	return path.resolve(path.dirname(documentPath), relativePath);
}

/**
 * Reads package metadata for a destination document.
 *
 * @param {{ destinationPath: string }} context - The transform context.
 * @param {{ packageJsonPath: string }} options - The package file option.
 * @returns {Promise<Record<string, unknown>>} The parsed package metadata.
 */
async function readPackage(context, options) {
	const packagePath = resolveRelativePath(context.destinationPath, options.packageJsonPath);
	return JSON.parse(await readFile(packagePath, "utf8"));
}

/**
 * Maps a package name to a supported Fluid package kind.
 *
 * @param {string} packageName - The package name.
 * @returns {string | undefined} The package kind, or `undefined` for an unknown scope.
 */
function getScopeKind(packageName) {
	if (packageName === "fluid-framework") {
		return "FRAMEWORK";
	}
	const scope = packageName.startsWith("@") ? packageName.split("/")[0] : "";
	return {
		"@fluidframework": "FRAMEWORK",
		"@fluid-example": "EXAMPLE",
		"@fluid-experimental": "EXPERIMENTAL",
		"@fluid-internal": "INTERNAL",
		"@fluid-private": "PRIVATE",
		"@fluid-tools": "TOOLS",
	}[scope];
}

/**
 * Tests whether package defaults must include public guidance.
 *
 * @param {Record<string, unknown>} packageMetadata - The package metadata.
 * @returns {boolean} `true` for a non-private framework or experimental package.
 */
function isPublic(packageMetadata) {
	if (packageMetadata.private === true) {
		return false;
	}
	return (
		getScopeKind(packageMetadata.name) === "FRAMEWORK" ||
		getScopeKind(packageMetadata.name) === "EXPERIMENTAL"
	);
}

/**
 * Generates the notice for a package kind.
 *
 * @param {string | undefined} kind - The package kind.
 * @param {object} context - The transform context.
 * @returns {Promise<import("mdast").RootContent[]>} The notice nodes, or an empty array if the kind has no notice.
 */
async function generateScopeNotice(kind, context) {
	const templateName = scopeTemplates[kind];
	return templateName === undefined ? [] : readTemplateNodes(templateName, context);
}

/**
 * Generates package installation instructions.
 *
 * @param {string} packageName - The package name to install.
 * @param {boolean} devDependency - Whether to add the development-dependency flag.
 * @param {{ includeHeading: boolean; headingLevel: number }} options - The heading options.
 * @param {object} context - The transform context.
 * @returns {import("mdast").RootContent[]} The installation section nodes.
 */
function generateInstallation(packageName, devDependency, options, context) {
	const heading = options.includeHeading
		? `${"#".repeat(options.headingLevel)} Installation\n\n`
		: "";
	return parseFragment(
		`${heading}To get started, install the package by running the following command:\n\n\`\`\`bash\nnpm i ${packageName}${devDependency ? " -D" : ""}\n\`\`\``,
		context,
		"installation",
	);
}

/**
 * Generates a link to the package API documentation.
 *
 * @param {string} packageName - The package name.
 * @param {{ includeHeading: boolean; headingLevel: number }} options - The heading options.
 * @param {object} context - The transform context.
 * @returns {import("mdast").RootContent[]} The API documentation section nodes.
 */
function generateApiDocs(packageName, options, context) {
	const shortName = packageName.includes("/")
		? packageName.slice(packageName.indexOf("/") + 1)
		: packageName;
	const heading = options.includeHeading
		? `${"#".repeat(options.headingLevel)} API Documentation\n\n`
		: "";
	return parseFragment(
		`${heading}API documentation for **${packageName}** is available at <https://fluidframework.com/docs/apis/${shortName}>.`,
		context,
		"api-docs",
	);
}

/**
 * Generates instructions for the supported special package exports.
 *
 * @param {Record<string, unknown>} packageMetadata - The package metadata.
 * @param {{ includeHeading: boolean; headingLevel: number }} options - The heading options.
 * @param {object} context - The transform context.
 * @returns {import("mdast").RootContent[]} The import section nodes, or an empty array if no special export exists.
 */
function generateImportInstructions(packageMetadata, options, context) {
	const packageExports = packageMetadata.exports;
	if (
		packageExports === undefined ||
		packageExports === null ||
		typeof packageExports !== "object"
	) {
		return [];
	}
	const specialExports = ["beta", "alpha", "legacy"].filter(
		(name) => `./${name}` in packageExports,
	);
	if (specialExports.length === 0) {
		return [];
	}
	const packageName = packageMetadata.name;
	const heading = options.includeHeading
		? `${"#".repeat(options.headingLevel)} Importing from this package\n\n`
		: "";
	const paragraphs = [
		"This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.\nFor more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).",
		`To access the \`public\` ([SemVer](https://semver.org/)) APIs, import via \`${packageName}\` like normal.`,
		...specialExports.map(
			(name) => `To access the \`${name}\` APIs, import via \`${packageName}/${name}\`.`,
		),
	];
	return parseFragment(`${heading}${paragraphs.join("\n\n")}`, context, "import-instructions");
}

/**
 * Generates setup steps for an example package.
 *
 * @param {Record<string, unknown>} packageMetadata - The package metadata.
 * @param {boolean} usesTinylicious - Whether to include Tinylicious setup steps.
 * @param {{ includeHeading: boolean; headingLevel: number }} options - The heading options.
 * @param {object} context - The transform context.
 * @returns {import("mdast").RootContent[]} The setup section nodes.
 */
function generateGettingStarted(packageMetadata, usesTinylicious, options, context) {
	const heading = options.includeHeading
		? `${"#".repeat(options.headingLevel)} Getting Started\n\n`
		: "";
	const steps = [
		"1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.",
		`1. Run \`pnpm install\` and \`pnpm run build:fast --nolint\` from the \`FluidFramework\` root directory.\n    - For an even faster build, you can add the package name to the build command, like this:\n      \`pnpm run build:fast --nolint ${packageMetadata.name}\``,
	];
	if (usesTinylicious) {
		steps.push(
			"1. In a separate terminal, start a Tinylicious server by running `pnpm tinylicious` in this directory.",
			'1. If using codespaces in a browser, set tinylicious (port 7070) visibility to "public". "Private to Organization" will not work. See [sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port) for how to do this.',
		);
	}
	steps.push(
		"1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.",
		"1. If you want to run the app against SharePoint, follow the instructions in [webpack-fluid-loader](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get auth credentials. Then run `pnpm start:spo` or `pnpm start:spo-df` and open <http://localhost:8080> like above.",
	);
	return parseFragment(
		`${heading}You can run this example using the following steps:\n\n${steps.join("\n")}`,
		context,
		"getting-started",
	);
}

/**
 * Generates a GitHub Flavored Markdown table of package scripts.
 *
 * @param {Record<string, string>} scripts - The package scripts.
 * @param {{ includeHeading: boolean; headingLevel: number }} options - The heading options.
 * @returns {import("mdast").RootContent[]} The optional heading and table nodes.
 */
function generateScripts(scripts, options) {
	const rows = Object.entries(scripts).map(([name, command]) => ({
		type: "tableRow",
		children: [name, command].map((value) => ({
			type: "tableCell",
			children: [{ type: "inlineCode", value }],
		})),
	}));
	const table = {
		type: "table",
		align: [null, null],
		children: [
			{
				type: "tableRow",
				children: ["Script", "Description"].map((value) => ({
					type: "tableCell",
					children: [{ type: "text", value }],
				})),
			},
			...rows,
		],
	};
	return options.includeHeading
		? [
				{
					type: "heading",
					depth: options.headingLevel,
					children: [{ type: "text", value: "Scripts" }],
				},
				table,
			]
		: [table];
}

/**
 * Creates a transform with schema-based option validation.
 *
 * @param {string} name - The transform name.
 * @param {Record<string, object>} schema - The option schema.
 * @param {(options: object, context: object) => Promise<readonly object[]> | readonly object[]} generate - The node generator.
 * @returns {{ validateOptions: (value: unknown) => Record<string, unknown>; generate: typeof generate }} The transform implementation.
 */
function transform(name, schema, generate) {
	return {
		validateOptions: (value) => validateOptions(value, name, schema),
		generate,
	};
}

/**
 * Creates transforms for standard README sections and package metadata.
 *
 * Composite transforms call node generators directly. They do not serialize intermediate output.
 *
 * @returns {Record<string, { validateOptions: (value: unknown) => Record<string, unknown>; generate: Function }>} The README transform registry.
 */
export function createReadmeTransforms() {
	const templateTransforms = {
		"client-requirements": ["Client-Requirements-Template.md", "Minimum Client Requirements"],
		trademark: ["Trademark-Template.md", "Trademark"],
		"contribution-guidelines": [
			"Contribution-Guidelines-Template.md",
			"Contribution Guidelines",
		],
		"dependency-guidelines": [
			"Dependency-Guidelines-Template.md",
			"Using Fluid Framework libraries",
		],
		help: ["Help-Template.md", "Help"],
	};
	const transforms = {};
	for (const [name, [templateName, headingText]] of Object.entries(templateTransforms)) {
		transforms[name] = transform(name, headingSchema, (options, context) =>
			generateTemplateSection(templateName, options, headingText, context),
		);
	}

	transforms["package-scope-notice"] = transform(
		"package-scope-notice",
		{
			...packageSchema,
			scopeKind: { type: "string", values: scopeValues },
		},
		async (options, context) => {
			const packageMetadata = await readPackage(context, options);
			return generateScopeNotice(
				options.scopeKind ?? getScopeKind(packageMetadata.name),
				context,
			);
		},
	);

	transforms["installation-instructions"] = transform(
		"installation-instructions",
		{ ...packageSchema, ...headingSchema, devDependency: { type: "boolean", default: false } },
		async (options, context) => {
			const packageMetadata = await readPackage(context, options);
			return generateInstallation(
				packageMetadata.name,
				options.devDependency,
				options,
				context,
			);
		},
	);

	transforms["api-docs"] = transform(
		"api-docs",
		{ ...packageSchema, ...headingSchema },
		async (options, context) => {
			const packageMetadata = await readPackage(context, options);
			return generateApiDocs(packageMetadata.name, options, context);
		},
	);

	transforms["import-instructions"] = transform(
		"import-instructions",
		{ ...packageSchema, ...headingSchema },
		async (options, context) =>
			generateImportInstructions(await readPackage(context, options), options, context),
	);

	transforms["example-getting-started"] = transform(
		"example-getting-started",
		{
			...packageSchema,
			...headingSchema,
			usesTinylicious: { type: "boolean", default: true },
		},
		async (options, context) =>
			generateGettingStarted(
				await readPackage(context, options),
				options.usesTinylicious,
				options,
				context,
			),
	);

	transforms["package-scripts"] = transform(
		"package-scripts",
		{ ...packageSchema, ...headingSchema },
		async (options, context) => {
			const packageMetadata = await readPackage(context, options);
			return generateScripts(packageMetadata.scripts ?? {}, options);
		},
	);

	transforms["library-readme-header"] = transform(
		"library-readme-header",
		{
			...packageSchema,
			packageScopeNotice: { type: "string", values: scopeValues },
			dependencyGuidelines: { type: "boolean" },
			installation: { type: "boolean" },
			devDependency: { type: "boolean", default: false },
			importInstructions: { type: "boolean", default: true },
			apiDocs: { type: "boolean" },
		},
		async (options, context) => {
			const packageMetadata = await readPackage(context, options);
			const packageIsPublic = isPublic(packageMetadata);
			const sectionOptions = { includeHeading: true, headingLevel: 2 };
			return [
				...(await generateScopeNotice(
					options.packageScopeNotice ?? getScopeKind(packageMetadata.name),
					context,
				)),
				...((options.dependencyGuidelines ?? packageIsPublic)
					? await generateTemplateSection(
							"Dependency-Guidelines-Template.md",
							sectionOptions,
							"Using Fluid Framework libraries",
							context,
						)
					: []),
				...((options.installation ?? packageIsPublic)
					? generateInstallation(
							packageMetadata.name,
							options.devDependency,
							sectionOptions,
							context,
						)
					: []),
				...(options.importInstructions
					? generateImportInstructions(packageMetadata, sectionOptions, context)
					: []),
				...((options.apiDocs ?? packageIsPublic)
					? generateApiDocs(packageMetadata.name, sectionOptions, context)
					: []),
			];
		},
	);

	transforms["example-app-readme-header"] = transform(
		"example-app-readme-header",
		{
			...packageSchema,
			gettingStarted: { type: "boolean", default: true },
			usesTinylicious: { type: "boolean", default: true },
		},
		async (options, context) =>
			options.gettingStarted
				? generateGettingStarted(
						await readPackage(context, options),
						options.usesTinylicious,
						{ includeHeading: true, headingLevel: 2 },
						context,
					)
				: [],
	);

	transforms["readme-footer"] = transform(
		"readme-footer",
		{
			...packageSchema,
			scripts: { type: "boolean", default: false },
			clientRequirements: { type: "boolean" },
			contributionGuidelines: { type: "boolean", default: true },
			help: { type: "boolean", default: true },
			trademark: { type: "boolean", default: true },
		},
		async (options, context) => {
			const packageMetadata = await readPackage(context, options);
			const sectionOptions = { includeHeading: true, headingLevel: 2 };
			return [
				...(options.scripts
					? generateScripts(packageMetadata.scripts ?? {}, sectionOptions)
					: []),
				...((options.clientRequirements ?? isPublic(packageMetadata))
					? await generateTemplateSection(
							"Client-Requirements-Template.md",
							sectionOptions,
							"Minimum Client Requirements",
							context,
						)
					: []),
				...(options.contributionGuidelines
					? await generateTemplateSection(
							"Contribution-Guidelines-Template.md",
							sectionOptions,
							"Contribution Guidelines",
							context,
						)
					: []),
				...(options.help
					? await generateTemplateSection("Help-Template.md", sectionOptions, "Help", context)
					: []),
				...(options.trademark
					? await generateTemplateSection(
							"Trademark-Template.md",
							sectionOptions,
							"Trademark",
							context,
						)
					: []),
			];
		},
	);

	return transforms;
}
