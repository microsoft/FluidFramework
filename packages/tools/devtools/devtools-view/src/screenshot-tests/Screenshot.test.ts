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

/**
 * Supported theme modes in which the tests can be run.
 *
 * TODO: share existing enum, now that this is in TS
 */
type Theme = "dark" | "light" | "high-contrast";

/**
 * TODO
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
 *
 * @remarks Note: these strings are not intended to match our "ThemeOptions" enum used in React code.
 */
const allThemes: Theme[] = ["dark", "light", "high-contrast"];

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
// interface ScreenshotTestOptions {
// 	/**
// 	 * Globby-style match pattern for story modules.
// 	 * Relative to {@link ScreenshotTestOptions.workingDirectory}.
// 	 */
// 	storiesPathPatterns: string[];

// 	/**
// 	 * Path where snapshots should be saved.
// 	 * Relative to Relative to {@link ScreenshotTestOptions.workingDirectory}.
// 	 */
// 	screenshotsDirectory: string;

// 	/**
// 	 * Temp directory under which new snapshots will be saved for comparison against existing ones.
// 	 * Relative to {@link ScreenshotTestOptions.workingDirectory}.
// 	 */
// 	tempDirectory: string;

// 	/**
// 	 * Working directory from which to run the tests.
// 	 *
// 	 * @defaultValue `process.cwd()`
// 	 */
// 	workingDirectory?: string;

// 	/**
// 	 * The list of viewport dimensions in which to run the tests.
// 	 *
// 	 * @defaultValue {@link defaultViewports}
// 	 */
// 	viewports?: Viewport[];

// 	/**
// 	 * The list of themes in which to run the tests.
// 	 *
// 	 * @defaultValue {@link allThemes}
// 	 */
// 	themes?: Theme[];
// }

function getScreenshotTestName(
	storyComponentName: string,
	theme: Theme,
	viewport: Viewport,
): string {
	return `${storyComponentName} (${theme}, ${viewport.width}x${viewport.height})`;
}

function getScreenshotTestPath(
	testName: string,
	storyModuleName: string,
	outputDirectoryPath: string,
): string {
	return Path.join(outputDirectoryPath, storyModuleName, `${testName}.png`);
}

const workingDirectory = process.cwd();
const storiesPathPatterns = ["src/screenshot-tests/stories/*.tsx"];
const screenshotsDirectory = "__screenshots__";

const git = simpleGit(workingDirectory);

async function checkScreenshotDiff(screenshotFilePath: string): Promise<boolean> {
	const screenshotStatus = await git.status([pathspec(screenshotFilePath)]);
	return !screenshotStatus.isClean();
}

const componentMap: Map<string, RPCs.Component[]> = new Map<string, RPCs.Component[]>();

async function generateTestSuite(): Promise<void> {
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

	for (const storyModuleFilePath of storyModules) {
		const { components } = await workspace.detectComponents({
			filePaths: [storyModuleFilePath],
		});

		componentMap.set(storyModuleFilePath, components);
	}

	describe("devtools-view Screenshot Tests", () => {
		after(async () => {
			await browser.close();
			await workspace.dispose();
		});

		// Create sub-suite for each story module
		for (const [storyFilePath, components] of componentMap) {
			const storyFileName = Path.basename(storyFilePath);

			// eslint-disable-next-line jest/valid-title
			describe(storyFileName, () => {
				// Create sub-suite for each component
				for (const component of components) {
					const { componentId } = component;
					const { name: storyName } = decodeComponentId(componentId);

					// eslint-disable-next-line jest/valid-title
					describe(storyName, () => {
						// We expect this to succeed. If not, let the test blow up.
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const storyModuleName = storyFileName.match(/(.*)\.stories\.tsx/)![1];

						// Generate a separate screenshot for each of our supported themes
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

									// eslint-disable-next-line @typescript-eslint/no-unused-expressions
									expect(screenshotDiff).to.be.false;
								});
							}
						}
					});
				}
			});
		}
	});
}

generateTestSuite().then(
	() => {
		// Execute asynchronously generated test suite
		run();
	},
	(error: Error) => {
		console.error(chalk.red(`Test suite generation failed due to an error:`, error.message));
		throw error;
	},
);
