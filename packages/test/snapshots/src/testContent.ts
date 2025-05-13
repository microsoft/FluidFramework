/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import nodePath from "path";

import * as Mocha from "mocha";

import { _dirname } from "./dirname.cjs";

export interface TestContent {
	exists: boolean;
	path: string;
}

// Determine relative file locations
export function getTestContent(subPath?: string): TestContent {
	let path = nodePath.join("content", subPath);
	if (fs.existsSync(path)) {
		return {
			exists: true,
			path,
		};
	}
	// Relative to this generated js file being executed
	path = nodePath.join(_dirname, "..", path);
	if (fs.existsSync(path)) {
		return {
			exists: true,
			path,
		};
	}
	return {
		exists: false,
		path,
	};
}

export function skipOrFailIfTestContentMissing(
	test: Mocha.Context,
	content: TestContent,
): void {
	if (!content.exists) {
		// environment variable details here: https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml
		if (process.env.TF_BUILD === "true") {
			throw new Error(
				`Running in automation and test content does not exist: ${content.path}`,
			);
		}
		test.skip();
	}
}
