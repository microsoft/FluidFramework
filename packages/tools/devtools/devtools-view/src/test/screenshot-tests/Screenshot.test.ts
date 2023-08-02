/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "path";

import { decodeComponentId } from "@previewjs/api";
import { createChromelessWorkspace } from "@previewjs/chromeless";
import reactPlugin from "@previewjs/plugin-react";
import chalk from "chalk";
import { globby } from "globby";
import { chromium } from "playwright";
import { describe } from "node:test";

/**
 * Supported theme modes in which the tests can be run.
 */
export type Theme = "dark" | "light" | "high-contrast";

/**
 * TODO
 */
export interface Viewport {
	width: number;
	height: number;
}

// The below implementation is derived from @previewjs/screenshot, but updated to allow parametric testing
// of test "stories" in different theme contexts.
// https://github.com/fwouts/previewjs/blob/main/screenshot/src/index.ts

/**
 * Pattern used to discover test "story" modules for screenshot tests.
 * Relative to the package root.
 */
const storyFilePathPattern = "src/test/screenshot-tests/*.stories.tsx";

/**
 * Output directory under which the generated screenshots will be saved.
 * Relative to the package root.
 */
const outputDirectoryPath = "__screenshots__";

/**
 * The supported themes in which each test "story" will be rendered.
 * A separate screenshot will be generated for each of these.
 *
 * @remarks Note: these strings are not intended to match our "ThemeOptions" enum used in React code.
 */
const allThemes: Theme[] = ["dark", "light", "high-contrast"];

const defaultViewports: Viewport[] = [{ width: 400, height: 600 }]; // Default here is somewhat arbitrary, but has a similar aspect ratio to default devtools view in some configurations

/**
 * TODO
 */
async function generateScreenshots(components: unknown[]): Promise<void> {
	const cwd = process.cwd();
	const browser = await chromium.launch();

	const workspace = await createChromelessWorkspace({
		frameworkPlugins: [reactPlugin],
		rootDirPath: cwd,
	});

	// console.debug(`Found ${components.length} test stories. Generating screenshots...`);
	for (const component of components) {
		try {
			const { filePath: storyFilePath, name: storyName } = decodeComponentId(
				component.componentId,
			);

			const storyFileName = Path.basename(storyFilePath);

			const storyModuleName = storyFileName.match(/(.*)\.stories\.tsx/)[1];

			// Generate a separate screenshot for each of our supported themes
			for (const theme of allThemes) {
				const testName = `${storyModuleName}-${storyName} (${theme})`;
				const screenshotFilePath = Path.join(outputDirectoryPath, `${testName}.png`);

				const page = await browser.newPage({
					// Dark mode vs light mode setting
					// docs: https://playwright.dev/docs/api/class-page#page-emulate-media
					colorScheme: colorSchemeFromTheme(theme),

					// High contrast setting
					// docs: https://playwright.dev/docs/api/class-page#page-emulate-media
					forcedColors: forcedColorsFromTheme(theme),
				});
				const preview = await workspace.preview.start(page);

				try {
					await preview.show(component.componentId);
					await preview.iframe.takeScreenshot(screenshotFilePath);
				} catch (error) {
					console.error(
						chalk.red(`Failed to generate ${testName} screenshot due to an error:`),
						error,
					);
					throw error;
				}

				console.debug(chalk.green(`${testName} screenshot generated successfully!`));
				console.group();
				console.debug(`Saved to "${screenshotFilePath}".`);
				console.groupEnd();
			}
		} finally {
			await browser.close();
		}
	}
}

async function getStoryComponentsFromFilePath(
	storyFilePath: string,
	workingDirectory: string,
): Promise<unknown[]> {
	const workspace = await createChromelessWorkspace({
		frameworkPlugins: [reactPlugin],
		rootDirPath: workingDirectory,
	});

	const { components } = await workspace.detectComponents({
		filePaths: [storyFilePath],
	});

	return components;
}

/**
 * Gets the desired "color-scheme" setting (which is used for specifying dark vs light mode)
 * for the browser page, based on the provided theme selection.
 */
function colorSchemeFromTheme(theme): "dark" | "light" | "no-preference" {
	switch (theme) {
		case "dark":
		case "high-contrast": // Ensure we run high-contrast in dark mode
			return "dark";
		case "light":
			return "light";
		default:
			return "no-preference";
	}
}

/**
 * Gets the desired "forced-colors" setting (which is used for specifying high-contrast mode)
 * for the browser page, based on the provided theme selection.
 */
function forcedColorsFromTheme(theme): "active" | "none" {
	switch (theme) {
		case "high-contrast":
			return "active";
		default:
			return "none";
	}
}

/**
 * TODO
 */
export interface ScreenshotTestOptions {
	/**
	 * Globby-style match pattern for story modules.
	 * Relative to {@link ScreenshotTestOptions.workingDirectory}.
	 */
	storiesPathPatterns: string[];

	/**
	 * Path where snapshots should be saved.
	 * Relative to Relative to {@link ScreenshotTestOptions.workingDirectory}.
	 */
	snapshotDirectory: string;

	/**
	 * Temp directory under which new snapshots will be saved for comparison against existing ones.
	 * Relative to {@link ScreenshotTestOptions.workingDirectory}.
	 */
	tempDirectory: string;

	/**
	 * Working directory from which to run the tests.
	 *
	 * @defaultValue `process.cwd()`
	 */
	workingDirectory?: string;

	/**
	 * The list of viewport dimensions in which to run the tests.
	 *
	 * @defaultValue {@link defaultViewports}
	 */
	viewports?: Viewport[];

	/**
	 * The list of themes in which to run the tests.
	 *
	 * @defaultValue {@link allThemes}
	 */
	themes?: Theme[];
}

const screenshotTestOptionDefaults = {
	workingDirectory: process.cwd(),
	viewports: defaultViewports,
	themes: allThemes,
};

/**
 * TODO
 */
export async function screenshotTests(options: ScreenshotTestOptions): Promise<void> {
	const optionsWithDefaults: Required<ScreenshotTestOptions> = {
		...screenshotTestOptionDefaults,
		...options,
	};
	const { workingDirectory } = optionsWithDefaults;

	const filePaths = await globby(storyFilePathPattern, {
		gitignore: false,
		ignore: ["**/node_modules/**"],
		cwd: workingDirectory,
		followSymbolicLinks: false,
	});

	return describe("devtools-view Screenshot tests", async (): Promise<void> => {
		// Queries all specified story files for their individual components ("stories").
		const components = await getStoryComponentsFromFilePath(storyFilePath, workingDirectory);

		return Promise.all(components.map(async (component) => renderComponent(component)));
	});
}

// generateScreenshots().then(
// 	() => {
// 		console.log(
// 			chalk.green(
// 				`SUCCESS: Story screenshots generated! They can be found under "${outputDirectoryPath}".`,
// 			),
// 		);
// 		console.info(
// 			chalk.blue(
// 				"If any screenshots were added or changed, verify that the changes are expected and check them in alongside your code changes.",
// 			),
// 		);
// 		// eslint-disable-next-line unicorn/no-process-exit
// 		process.exit(0);
// 	},
// 	(error) => {
// 		console.error(
// 			chalk.red("FAILURE: Story screenshot generation failed due to an error: "),
// 			error,
// 		);
// 		// eslint-disable-next-line unicorn/no-process-exit
// 		process.exit(1);
// 	},
// );
