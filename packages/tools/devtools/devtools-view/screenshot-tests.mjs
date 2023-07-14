/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import reactPlugin from "@previewjs/plugin-react";
import { generateScreenshots } from "@previewjs/screenshot";
import chalk from "chalk";
import { chromium } from "playwright";

async function runScreenshotTests() {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await generateScreenshots({
		page,
		frameworkPlugins: [reactPlugin],
		filePathPattern: "src/test/screenshot-tests/*.stories.{ts,tsx}",
		generateScreenshotPath({ filePath, name }) {
			console.log(`Generating screenshot for "${name}" under "${filePath}"...`);
			return `${filePath}-${name}.png`;
		},
		onScreenshotGenerated({ filePath, name }) {
			console.log(`${filePath} 📸 ${name}`);
		},
	});
	await browser.close();
}

runScreenshotTests().then(
	() => {
		console.log(chalk.green("SUCCESS: Story screenshots generated!"));
		process.exit(0);
	},
	(error) => {
		console.error(
			chalk.red("FAILURE: Story screenshot generation failed due to an error: "),
			error,
		);
		process.exit(1);
	},
);
