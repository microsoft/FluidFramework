/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// "jest-environment-puppeteer is not providing typing for its globals, but we can
// inject our own @types/jest-environment-puppeteer that re-exports
// jest-environment-puppeteer with the added globals.
// See https://github.com/argos-ci/jest-puppeteer/issues/568.

import type { Browser, BrowserContext, Page } from "puppeteer";
import type { JestPuppeteerGlobal } from "jest-environment-puppeteer";

declare global {
	const browser: Browser;
	const context: BrowserContext;
	const page: Page;
	const jestPuppeteer: JestPuppeteerGlobal["jestPuppeteer"];
}

export * as default from "jest-environment-puppeteer";
