/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "path";

import { decodeComponentId, RPCs } from "@previewjs/api";
import { createChromelessWorkspace } from "@previewjs/chromeless";
import reactPlugin from "@previewjs/plugin-react";
import { expect } from "chai";
import chalk from "chalk";
import { run } from "mocha";
import { globby } from "globby";
import { chromium } from "playwright";
import { simpleGit, pathspec } from "simple-git";

import { ThemeOption } from "../ThemeHelper";

/**
 * Viewport configuration for running a screenshot test.
 */
interface Viewport {
	width: number;
	height: number;
}

// The below implementation is derived from @previewjs/screenshot, but updated to allow parametric testing
// of test "stories" in different theme contexts.
// https://github.com/fwouts/previewjs/blob/main/screenshot/src/index.ts

/**
 * The supported themes in which each test "story" will be rendered.
 * A separate screenshot will be generated for each of these.
 */
const allThemes: ThemeOption[] = [ThemeOption.Dark, ThemeOption.Light, ThemeOption.HighContrast];

/**
 * The default viewport configuration under which test stories will be rendered.
 *
 * @remarks The default here is somewhat arbitrary, but has a similar aspect ratio to default devtools view in
 * some configurations.
 */
const defaultViewports: Viewport[] = [{ width: 400, height: 600 }];

/**
 * Gets the desired "color-scheme" setting (which is used for specifying dark vs light mode)
 * for the browser page, based on the provided theme selection.
 */
function colorSchemeFromTheme(theme: ThemeOption): "dark" | "light" | "no-preference" {
	switch (theme) {
		case ThemeOption.Dark:
		case ThemeOption.HighContrast: // Ensure we run high-contrast in dark mode
			return "dark";
		case ThemeOption.Light:
			return "light";
		default:
			return "no-preference";
	}
}

/**
 * Gets the desired "forced-colors" setting (which is used for specifying high-contrast mode)
 * for the browser page, based on the provided theme selection.
 */
function forcedColorsFromTheme(theme: ThemeOption): "active" | "none" {
	switch (theme) {
		case ThemeOption.HighContrast:
			return "active";
		default:
			return "none";
	}
}

/**
 * Generate screenshot test name from parameters.
 *
 * Format: `<story-component-name> (<theme>, <viewport-width>x<viewport-height>)`
 */
function getScreenshotTestName(
	storyComponentName: string,
	theme: ThemeOption,
	viewport: Viewport,
): string {
	return `${storyComponentName} (${theme}, ${viewport.width}x${viewport.height})`;
}

/**
 * Generate the file path for the screenshot generated for the specified test.
 *
 * Format: `<output-dir>/<story-module-name>/<test-name>.png`
 */
function getScreenshotTestPath(
	testName: string,
	storyModuleName: string,
	outputDirectoryPath: string,
): string {
	return Path.join(outputDirectoryPath, storyModuleName, `${testName}.png`);
}

const workingDirectory = process.cwd();

const git = simpleGit(workingDirectory);

async function checkScreenshotDiff(screenshotFilePath: string): Promise<boolean> {
	const screenshotStatus = await git.status([pathspec(screenshotFilePath)]);
	return !screenshotStatus.isClean();
}

/**
 * Dynamically and asynchronously generates a test suite covering all stories.
 *
 * Generated structure is hierarchical, and results in 1 test per screenshot scenario (story + theme + viewport), such
 * that we can succeed or fail on a per screenshot basis.
 *
 * Since the story modules are discovered and read asynchronously, creation of the test suite is also asynchronous.
 *
 * Note: this currently creates a test for each theme + viewport combination specified at the top of this file.
 * We may want to make this more configurable on a story-by-story basis in the future (for specific regression tests,
 * etc.).
 */
async function generateTestSuite(): Promise<void> {
	const storiesPathPatterns = ["src/screenshot-tests/stories/*.tsx"];
	const screenshotsDirectory = "__screenshots__";

	// Initialize chromium browser instance for test suite
	const browser = await chromium.launch();

	const workspace = await createChromelessWorkspace({
		frameworkPlugins: [reactPlugin],
		rootDirPath: workingDirectory,
	});

	const storyModules = await globby(storiesPathPatterns, {
		gitignore: false,
		ignore: ["**/node_modules/**"],
		cwd: workingDirectory,
		followSymbolicLinks: false,
	});

	// `describe` blocks cannot be async, so before we start building out the test suites, we will asynchronously
	// create a mapping of story modules to all of the story components they contain.
	// From this map, we will build up our test suite (synchronously).
	const componentMap: Map<string, RPCs.Component[]> = new Map<string, RPCs.Component[]>();

	for (const storyModuleFilePath of storyModules) {
		const { components } = await workspace.detectComponents({
			filePaths: [storyModuleFilePath],
		});

		componentMap.set(storyModuleFilePath, components);
	}

	// Generated suite has the following hierarchy: `root -> story module -> story (component) -> test (theme + viewport)`
	describe("devtools-view Screenshot Tests", () => {
		after(async () => {
			await browser.close();
			await workspace.dispose();
		});

		// Create sub-suite for each story module
		for (const [storyFilePath, components] of componentMap) {
			const storyFileName = Path.basename(storyFilePath);

			// Story module sub-suite
			// eslint-disable-next-line jest/valid-title
			describe(storyFileName, () => {
				// Create sub-suite for each component
				for (const component of components) {
					const { componentId } = component;
					const { name: storyName } = decodeComponentId(componentId);

					// Story (component) sub-suite
					// eslint-disable-next-line jest/valid-title
					describe(storyName, () => {
						// We expect this to succeed. If not, let the test blow up.
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const storyModuleName = storyFileName.match(/(.*)\.stories\.tsx/)![1];

						// Generate an individual test for each theme / viewport combination.
						for (const theme of allThemes) {
							for (const viewport of defaultViewports) {
								const testName = getScreenshotTestName(storyName, theme, viewport);

								// eslint-disable-next-line jest/valid-title
								it(testName, async (): Promise<void> => {
									const screenshotFilePath = getScreenshotTestPath(
										testName,
										storyModuleName,
										screenshotsDirectory,
									);

									const page = await browser.newPage({
										viewport,

										// Dark mode vs light mode setting
										// docs: https://playwright.dev/docs/api/class-page#page-emulate-media
										colorScheme: colorSchemeFromTheme(theme),

										// High contrast setting
										// docs: https://playwright.dev/docs/api/class-page#page-emulate-media
										forcedColors: forcedColorsFromTheme(theme),
									});
									const preview = await workspace.preview.start(page);

									try {
										await preview.show(componentId);
										await preview.iframe.takeScreenshot(screenshotFilePath);
									} catch (error) {
										console.error(
											chalk.red(
												`Failed to generate ${testName} screenshot due to an error:`,
											),
											error,
										);
										throw error;
									}

									const screenshotDiff = await checkScreenshotDiff(
										screenshotFilePath,
									);

									if (screenshotDiff) {
										expect.fail(
											"Git detected a screenshot diff. Please check the visual diff and commit the changes if appropriate.",
										);
									}
								});
							}
						}
					});
				}
			});
		}
	});
}

/**
 * Asynchronously generate test suite, then run it.
 */
generateTestSuite().then(
	() => {
		// Execute generated test suite
		run();
	},
	(error: Error) => {
		console.error(chalk.red(`Test suite generation failed due to an error:`, error.message));
		throw error;
	},
);
