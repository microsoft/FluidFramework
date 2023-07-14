/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { decodeComponentId } from "@previewjs/api";
import { createChromelessWorkspace } from "@previewjs/chromeless";
import reactPlugin from "@previewjs/plugin-react";
import chalk from "chalk";
import { globby } from "globby";
import { chromium } from "playwright";

// The below implementation is derived from @previewjs/screenshot, but updated to allow parametric testing
// of test "stories" in different theme contexts.
// https://github.com/fwouts/previewjs/blob/main/screenshot/src/index.ts

const storyFilePathPattern = "src/test/screenshot-tests/**/*.stories.tsx";

/**
 * The supported themes in which each test "story" will be rendered.
 * A separate screenshot will be generated for each of these.
 */
const themes = ["dark", "light", "high-contrast"];

async function generateScreenshots() {
	const cwd = process.cwd();
	const browser = await chromium.launch();

	const workspace = await createChromelessWorkspace({
		frameworkPlugins: [reactPlugin],
		rootDirPath: cwd,
	});

	const filePaths = await globby(storyFilePathPattern, {
		gitignore: true,
		ignore: ["**/node_modules/**"],
		cwd,
		followSymbolicLinks: false,
	});

	const { components } = await workspace.detectComponents({
		filePaths,
	});

	// Run screenshot generation on each detected component
	// TODO: aggregate errors and list at the end.
	for (const component of components) {
		const { filePath: storyFilePath, name: storyName } = decodeComponentId(
			component.componentId,
		);

		const storyModuleName = storyFilePath.match(/(.*?)\.stories\.tsx/)[1];

		// Generate a separate screenshot for each of our supported themes
		for (const theme of themes) {
			const testName = `${storyModuleName}-${storyName} (${theme})`;
			const screenshotFilePath = `${testName}.png`;

			const page = await browser.newPage({
				colorScheme: colorSchemeFromTheme(theme), // Dark mode vs light mode setting
				forcedColors: forcedColorsFromTheme(theme), // High contrast setting
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

			// await preview.stop();

			console.log(chalk.green(`${testName} screenshot generated successfully!`));
			console.group();
			console.debug(`Saved to "${screenshotFilePath}".`);
			console.groupEnd();
		}
	}

	await workspace.dispose();
	await browser.close();
}

/**
 * Gets the desired "color-scheme" setting (which is used for specifying dark vs light mode)
 * for the browser page, based on the provided theme selection.
 */
function colorSchemeFromTheme(theme) {
	switch (theme) {
		case "dark":
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
function forcedColorsFromTheme(theme) {
	switch (theme) {
		case "high-contrast":
			return "active";
		default:
			return "none";
	}
}

generateScreenshots().then(
	() => {
		console.log(chalk.green("SUCCESS: Story screenshots generated!"));
		console.info(
			chalk.blue(
				"If any screenshots were added or changed, verify that the changes are expected and check them in alongside your code changes.",
			),
		);
		// eslint-disable-next-line unicorn/no-process-exit
		process.exit(0);
	},
	(error) => {
		console.error(
			chalk.red("FAILURE: Story screenshot generation failed due to an error: "),
			error,
		);
		// eslint-disable-next-line unicorn/no-process-exit
		process.exit(1);
	},
);
