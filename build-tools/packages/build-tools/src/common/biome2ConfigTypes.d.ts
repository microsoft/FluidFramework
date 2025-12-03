/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable */
/**
 * Type definitions for Biome 2.x configuration format.
 *
 * This file contains type definitions that reflect the changes in Biome 2.x where:
 * - `files.include` and `files.ignore` are replaced by `files.includes` (with negation support)
 * - `formatter.include` and `formatter.ignore` are replaced by `formatter.includes` (with negation support)
 * - `linter.include` and `linter.ignore` are replaced by `linter.includes` (with negation support)
 * - Globs are resolved from the configuration file location rather than working directory
 *
 * When Biome 2.x is available in the dependencies, this file can be regenerated using:
 *   pnpm run json-schema-to-typescript:biome2ConfigTypes
 *
 * The types here are a subset of the full Biome 2.x configuration, focusing on the fields
 * relevant for determining which files are in scope for formatting/linting.
 */

/**
 * A list of Unix shell style patterns with optional negation patterns (prefixed with `!`).
 * Negation patterns exclude files from the matched set.
 *
 * @example
 * ```json
 * {
 *   "includes": ["**", "!node_modules/**", "!dist/**"]
 * }
 * ```
 */
export type IncludesSet = string[];

export type StringSet = string[];

export type PlainIndentStyle = "tab" | "space";
export type IndentWidth = number;
export type LineEnding = "lf" | "crlf" | "cr";
export type LineWidth = number;
export type AttributePosition = "auto" | "multiline";
export type VcsClientKind = "git";

/**
 * The configuration of the filesystem for Biome 2.x.
 * Note: In Biome 2.x, the separate `include` and `ignore` fields are replaced by
 * a unified `includes` field that supports negation patterns.
 */
export interface FilesConfiguration2 {
	/**
	 * A list of Unix shell style patterns with negation support.
	 * Biome will handle only those files/folders that match these patterns.
	 * Use `!` prefix to exclude patterns.
	 */
	includes?: IncludesSet | null;
	/**
	 * Tells Biome to not emit diagnostics when handling files that it doesn't know
	 */
	ignoreUnknown?: boolean | null;
	/**
	 * The maximum allowed size for source code files in bytes.
	 */
	maxSize?: number | null;
}

/**
 * Formatter configuration for Biome 2.x.
 * Note: In Biome 2.x, the separate `include` and `ignore` fields are replaced by
 * a unified `includes` field that supports negation patterns.
 */
export interface FormatterConfiguration2 {
	/**
	 * The attribute position style in HTMLish languages. By default auto.
	 */
	attributePosition?: AttributePosition | null;
	enabled?: boolean | null;
	/**
	 * Stores whether formatting should be allowed to proceed if a given file has syntax errors
	 */
	formatWithErrors?: boolean | null;
	/**
	 * A list of Unix shell style patterns with negation support.
	 * The formatter will handle files/folders that match these patterns.
	 */
	includes?: IncludesSet | null;
	/**
	 * The size of the indentation, 2 by default
	 */
	indentWidth?: IndentWidth | null;
	/**
	 * The indent style.
	 */
	indentStyle?: PlainIndentStyle | null;
	/**
	 * The type of line ending.
	 */
	lineEnding?: LineEnding | null;
	/**
	 * What's the max width of a line. Defaults to 80.
	 */
	lineWidth?: LineWidth | null;
}

/**
 * Linter configuration for Biome 2.x.
 * Note: In Biome 2.x, the separate `include` and `ignore` fields are replaced by
 * a unified `includes` field that supports negation patterns.
 */
export interface LinterConfiguration2 {
	/**
	 * if `false`, it disables the feature and the linter won't be executed. `true` by default
	 */
	enabled?: boolean | null;
	/**
	 * A list of Unix shell style patterns with negation support.
	 * The linter will handle files/folders that match these patterns.
	 */
	includes?: IncludesSet | null;
	/**
	 * List of rules
	 */
	rules?: unknown | null;
}

/**
 * Organize imports configuration for Biome 2.x.
 */
export interface OrganizeImports2 {
	/**
	 * Enables the organization of imports
	 */
	enabled?: boolean | null;
	/**
	 * A list of Unix shell style patterns with negation support.
	 */
	includes?: IncludesSet | null;
}

/**
 * Override pattern for Biome 2.x.
 * Note: In Biome 2.x, the separate `include` and `ignore` fields are replaced by
 * a unified `includes` field that supports negation patterns.
 */
export interface OverridePattern2 {
	/**
	 * A list of Unix shell style patterns with negation support.
	 * The configuration will apply to files/folders that match these patterns.
	 */
	includes?: IncludesSet | null;
	/**
	 * Specific configuration for the formatter
	 */
	formatter?: FormatterConfiguration2 | null;
	/**
	 * Specific configuration for the linter
	 */
	linter?: LinterConfiguration2 | null;
	/**
	 * Specific configuration for the JavaScript language
	 */
	javascript?: unknown | null;
	/**
	 * Specific configuration for the JSON language
	 */
	json?: unknown | null;
	/**
	 * Specific configuration for the CSS language
	 */
	css?: unknown | null;
}

export type Overrides2 = OverridePattern2[];

/**
 * VCS configuration (unchanged in Biome 2.x)
 */
export interface VcsConfiguration2 {
	/**
	 * The kind of client.
	 */
	clientKind?: VcsClientKind | null;
	/**
	 * The main branch of the project
	 */
	defaultBranch?: string | null;
	/**
	 * Whether Biome should integrate itself with the VCS client
	 */
	enabled?: boolean | null;
	/**
	 * The folder where Biome should check for VCS files.
	 */
	root?: string | null;
	/**
	 * Whether Biome should use the VCS ignore file.
	 */
	useIgnoreFile?: boolean | null;
}

/**
 * The configuration that is contained inside the file `biome.json` for Biome 2.x.
 * This is a subset of the full configuration, containing fields relevant for
 * file scope determination.
 */
export interface Configuration2 {
	/**
	 * A field for the JSON schema specification
	 */
	$schema?: string | null;
	/**
	 * Indicates this is the root configuration file. When set to true, Biome will not
	 * look for configuration files in parent directories. When set to false or omitted,
	 * Biome will walk up the directory tree to find parent configs and merge them.
	 */
	root?: boolean | null;
	/**
	 * Specific configuration for the Css language
	 */
	css?: unknown | null;
	/**
	 * A list of paths to other JSON files, used to extend the current configuration.
	 */
	extends?: StringSet | null;
	/**
	 * The configuration of the filesystem
	 */
	files?: FilesConfiguration2 | null;
	/**
	 * The configuration of the formatter
	 */
	formatter?: FormatterConfiguration2 | null;
	/**
	 * Specific configuration for the JavaScript language
	 */
	javascript?: unknown | null;
	/**
	 * Specific configuration for the JSON language
	 */
	json?: unknown | null;
	/**
	 * The configuration for the linter
	 */
	linter?: LinterConfiguration2 | null;
	/**
	 * The configuration of the import sorting
	 */
	organizeImports?: OrganizeImports2 | null;
	/**
	 * A list of granular patterns that should be applied only to a sub set of files
	 */
	overrides?: Overrides2 | null;
	/**
	 * The configuration of the VCS integration
	 */
	vcs?: VcsConfiguration2 | null;
}
