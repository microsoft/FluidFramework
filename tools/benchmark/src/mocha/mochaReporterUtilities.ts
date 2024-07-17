/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Suite } from "mocha";

import {
	benchmarkTypes,
	performanceTestSuiteTag,
	testTypes,
	userCategoriesSplitter,
} from "../Configuration";

/**
 * This file contains generic utilities of use to a mocha reporter, especially for convenient formatting of textual
 * output to the command line.
 */

/**
 * Tags used to mark tests.
 */
const tags = [
	performanceTestSuiteTag,
	...benchmarkTypes.map((x) => `@${x}`),
	...testTypes.map((x) => `@${x}`),
];

/**
 * Strip tags and user-specified category from a test suite's name.
 */
export const getSuiteName = (suite: Suite): string => getName(suite.fullTitle());

/**
 * Strip tags and user-specified category from the specified test/suite name.
 */
export function getName(name: string): string {
	let s = name;
	for (const tag of tags) {
		s = s.replace(tag, "");
	}
	const indexOfSplitter = s.indexOf(userCategoriesSplitter);
	if (indexOfSplitter >= 0) {
		s = s.slice(0, indexOfSplitter);
	}
	return s.trim();
}
