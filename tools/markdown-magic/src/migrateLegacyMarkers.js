/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parseDocument } from "./processorProfiles.js";

const legacyOpeningPattern =
	/^<!-- AUTO-GENERATED-CONTENT:START \(([A-Z_]+)(?::(.*))?\) -->$/s;
const legacyClosingMarker = "<!-- AUTO-GENERATED-CONTENT:END -->";

const transformNames = {
	API_DOCS: "api-docs",
	CLIENT_REQUIREMENTS: "client-requirements",
	CONTRIBUTION_GUIDELINES: "contribution-guidelines",
	DEPENDENCY_GUIDELINES: "dependency-guidelines",
	EXAMPLE_APP_README_HEADER: "example-app-readme-header",
	EXAMPLE_GETTING_STARTED: "example-getting-started",
	HELP: "help",
	IMPORT_INSTRUCTIONS: "import-instructions",
	INCLUDE: "include",
	INCLUDE_CODE: "include-code",
	INSTALLATION_INSTRUCTIONS: "installation-instructions",
	LIBRARY_README_HEADER: "library-readme-header",
	PACKAGE_SCOPE_NOTICE: "package-scope-notice",
	PACKAGE_SCRIPTS: "package-scripts",
	README_FOOTER: "readme-footer",
	TRADEMARK: "trademark",
};

const integerOptions = new Set(["start", "end", "headingLevel"]);

/**
 * Converts a legacy string value to its JSON value.
 *
 * @param {string} value - The legacy option value.
 * @param {string} key - The option key.
 * @returns {boolean | number | string} The converted value.
 */
function parseLegacyValue(value, key) {
	if (value === "TRUE") {
		return true;
	}
	if (value === "FALSE") {
		return false;
	}
	if (integerOptions.has(key)) {
		const parsed = Number(value);
		if (!Number.isInteger(parsed)) {
			throw new Error(`Legacy option "${key}" must contain an integer.`);
		}
		return parsed;
	}
	return value;
}

/**
 * Parses the legacy ampersand-separated option syntax.
 *
 * @param {string | undefined} source - The legacy option text.
 * @param {string} transformName - The new transform name.
 * @returns {Record<string, boolean | number | string>} The options with JSON-compatible values.
 */
function parseLegacyOptions(source, transformName) {
	const options = {};
	if (source === undefined || source.length === 0) {
		return options;
	}
	for (const option of source.split("&")) {
		const separator = option.indexOf("=");
		if (separator < 1) {
			throw new Error(`Invalid legacy option "${option}".`);
		}
		const key = option.slice(0, separator);
		const value = option.slice(separator + 1);
		if (transformName === "library-readme-header" && key === "scripts") {
			continue;
		}
		options[key] = parseLegacyValue(value, key);
	}
	return options;
}

/**
 * Converts legacy Markdown markers without changing generated region bodies.
 *
 * This helper is for the one-use repository migration. It recognizes top-level HTML comment
 * markers in Markdown documents. It does not migrate MDX markers.
 *
 * @param {string} source - The Markdown source text.
 * @param {string} filePath - The source path used for parsing and errors.
 * @returns {string} The source text with converted marker comments.
 * @throws If the source contains an unknown transform or an invalid legacy option.
 */
export function migrateLegacyMarkers(source, filePath) {
	const document = parseDocument(source, filePath);
	const replacements = [];

	for (const node of document.tree.children) {
		if (
			node.type !== "html" ||
			node.position?.start.offset === undefined ||
			node.position.end.offset === undefined
		) {
			continue;
		}
		if (node.value === legacyClosingMarker) {
			replacements.push({
				start: node.position.start.offset,
				end: node.position.end.offset,
				content: "<!-- markdown-magic:end -->",
			});
			continue;
		}
		const match = legacyOpeningPattern.exec(node.value);
		if (match === null) {
			continue;
		}
		const transformName = transformNames[match[1]];
		if (transformName === undefined) {
			throw new Error(
				`${filePath}:${node.position.start.line}: Unknown legacy transform "${match[1]}".`,
			);
		}
		const options = {
			transform: transformName,
			...parseLegacyOptions(match[2], transformName),
		};
		replacements.push({
			start: node.position.start.offset,
			end: node.position.end.offset,
			content: `<!-- markdown-magic:begin ${JSON.stringify(options)} -->`,
		});
	}

	let output = source;
	// Apply replacements in reverse source order so that recorded offsets remain valid.
	for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
		output = `${output.slice(0, replacement.start)}${replacement.content}${output.slice(replacement.end)}`;
	}
	return output;
}
