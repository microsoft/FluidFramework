/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type definitions for ESLint 8 and 9 compatibility.
 *
 * ESLint 9 introduced breaking changes to the config system and some APIs.
 * This file provides union types to handle both versions in a type-safe way.
 */

import type { Rule as Rule8, Linter as Linter8, ESLint as ESLint8 } from "eslint8";
import type {
	Rule as Rule9,
	Linter as Linter9,
	SourceCode as SourceCode9,
	ESLint as ESLint9,
} from "eslint";
import type { ParserServicesWithTypeInformation } from "@typescript-eslint/utils";

/**
 * Union type for Rule.RuleContext that works with both ESLint 8 and 9.
 * The main differences are in how parserServices and getScope are accessed.
 */
export type CompatRuleContext = Rule8.RuleContext | Rule9.RuleContext;

/**
 * Extended context type that includes parserServices which may be on different properties
 * depending on ESLint version, and getScope which exists in ESLint 8 but was moved to
 * sourceCode.getScope in ESLint 9.
 */
export interface RuleContextWithParserServices extends Rule9.RuleContext {
	parserServices?: ParserServicesWithTypeInformation;
	sourceCode: SourceCode9 & {
		parserServices?: ParserServicesWithTypeInformation;
	};
	// getScope exists in ESLint 8, but not in ESLint 9 (moved to sourceCode.getScope)
	getScope?: () => ReturnType<Rule8.RuleContext["getScope"]>;
}

/**
 * Compatible plugin type that works with both ESLint 8 and 9.
 */
export type CompatPlugin = ESLint8.Plugin | ESLint9.Plugin;

/**
 * Compatible rules record type that works with both ESLint 8 and 9.
 * Rules can be configured as strings ("error", "warn", "off") or arrays with options.
 * The exact structure varies by rule, so we use a flexible type that matches both versions.
 */
export type CompatRulesRecord = Record<
	string,
	string | number | unknown[] | Record<string, unknown>
>;

/**
 * Compatible parser options type that works with both ESLint 8 and 9.
 * While both versions have ParserOptions types, they have incompatible literal types
 * (e.g., different allowed ecmaVersion values), so we use a flexible object type.
 */
export type CompatParserOptions = Record<string, unknown>;

/**
 * ESLint configuration options that work with both versions.
 * ESLint 8 uses legacy config, ESLint 9 uses flat config.
 */
export type CompatESLintOptions = {
	// ESLint 9 flat config properties
	overrideConfigFile?: boolean;
	overrideConfig?: Linter9.Config[];

	// ESLint 8 legacy config properties
	baseConfig?: Linter8.Config;
	useEslintrc?: boolean;
	plugins?: Record<string, CompatPlugin>;
};
