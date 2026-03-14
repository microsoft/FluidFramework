/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A regex-based validation pattern for checking user code.
 */
export interface ValidationPattern {
	/**
	 * Human-readable label shown in the checklist.
	 */
	label: string;

	/**
	 * Regex pattern string to test against the user's code.
	 */
	pattern: string;

	/**
	 * Regex flags (e.g. "s" for dotAll). Defaults to "s".
	 */
	flags?: string;
}

/**
 * A single step within a tutorial module.
 */
export interface TutorialStep {
	/**
	 * Unique step identifier.
	 */
	id: string;

	/**
	 * Step title displayed in the guide panel.
	 */
	title: string;

	/**
	 * Step instructions/description.
	 */
	description: string;

	/**
	 * Sandpack file map for this step.
	 * Keys are file paths (e.g. "/App.tsx"), values are file content strings.
	 */
	files: Record<string, string>;

	/**
	 * Which file is active/visible in the editor.
	 */
	activeFile: string;

	/**
	 * Expandable hint strings to help the user.
	 */
	hints: string[];

	/**
	 * Validation patterns checked against the active file's source.
	 */
	validationPatterns: ValidationPattern[];

	/**
	 * Optional solution code for the active file.
	 */
	solution?: string;
}

/**
 * A tutorial module grouping multiple steps.
 */
export interface TutorialModule {
	/**
	 * Unique module identifier.
	 */
	id: string;

	/**
	 * Module display title.
	 */
	title: string;

	/**
	 * Short description shown on the module card.
	 */
	description: string;

	/**
	 * Difficulty level.
	 */
	difficulty: "Beginner" | "Intermediate" | "Advanced";

	/**
	 * Ordered list of tutorial steps.
	 */
	steps: TutorialStep[];

	/**
	 * NPM dependencies required by Sandpack for this module.
	 */
	dependencies: Record<string, string>;
}
