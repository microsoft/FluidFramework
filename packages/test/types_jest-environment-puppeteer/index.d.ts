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
	// `browser`, `context`, and `page` are Puppeteer objects. Type them directly from `puppeteer`
	// (this package's own dependency) rather than via `JestPuppeteerGlobal`. jest-environment-puppeteer
	// resolves its own `puppeteer` copy, which can land on a different peer-dependency variant than the
	// one a consuming test package uses (e.g. differing transitive `supports-color`), and Puppeteer's
	// `Page`/`Browser` types are nominally incompatible across copies (they contain `#private` members).
	// Referencing `puppeteer` here keeps these globals aligned with the consumer's `puppeteer`.
	const browser: Browser;
	const context: BrowserContext;
	const page: Page;
	const jestPuppeteer: JestPuppeteerGlobal["jestPuppeteer"];
}

export * as default from "jest-environment-puppeteer";
