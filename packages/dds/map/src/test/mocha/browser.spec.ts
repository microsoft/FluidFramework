/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Extend window interface to include testsLoaded property
declare global {
	interface Window {
		testsLoaded?: boolean;
	}
}

// This export makes this file a module, which is required for global augmentations
export {};

console.log("Starting browser test loader...");

// Auto-discover all test files using webpack's require.context at build time
function getTestFiles(): (() => Promise<unknown>)[] {
	/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore - webpack specific API not in TypeScript types
	const testContext = require.context("./", false, /\.spec\.ts$/);
	return testContext
		.keys()
		.filter(
			(file: string) =>
				file !== "./browser.spec.ts" && // Exclude self
				!file.includes("Utils") && // Exclude utility files
				!file.includes("dirname"), // Exclude helper files
		)
		.map((file: string) => async () => testContext(file));
	/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
}

async function loadAllTests(): Promise<void> {
	console.log("Loading all test files...");

	try {
		const testLoaders = getTestFiles();
		console.log(`Auto-discovered ${testLoaders.length} test files`);

		// Load all discovered test files
		await Promise.all(testLoaders.map(async (loader) => loader()));

		console.log("All test files loaded successfully");
		// Signal that loading is complete
		window.testsLoaded = true;
		window.dispatchEvent(new CustomEvent("testsLoaded"));
	} catch (error) {
		// ignore error that has node:fs
		if (error instanceof Error && error.message.includes("node:fs")) {
			console.log("Ignored node environment specific API node:fs error");
			// Signal that loading is complete even with ignored errors
			window.testsLoaded = true;
			window.dispatchEvent(new CustomEvent("testsLoaded"));
		} else {
			console.error("Error loading tests:", error);
			throw error;
		}
	}
}

// Start loading tests when DOM is ready (only in browser environment)
if (typeof document === "undefined") {
	console.log("Browser test loader: Skipping in Node.js environment");
} else if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", () => {
		loadAllTests().catch((error) => {
			console.error("Failed to load tests:", error);
		});
	});
} else {
	// eslint-disable-next-line unicorn/prefer-top-level-await
	loadAllTests().catch((error) => {
		console.error("Failed to load tests:", error);
	});
}
