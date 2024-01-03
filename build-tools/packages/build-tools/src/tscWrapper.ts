/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import execa from "execa";
import { outputFileSync } from "fs-extra";
import { unlinkSync } from "node:fs";
import * as path from "node:path";
import { defaultLogger } from "./common/logging";

const { log } = defaultLogger;

const cjsPackageJson = `{ "type": "commonjs" }`;
const esmPackageJson = `{ "type": "module" }`;
const modulePackageJsonPath = "./src/package.json";
const cjsOutputDir = "./dist/";
const esmOutputDir = "./lib/";

/**
 * Creates a package.json file that sets `type` to either `commonjs` or `module` depending on the parameters provided.
 * The file is created in either the `src` directory or the `dist`/`lib` folders depending on the build type.
 *
 * @param kind - what module kind is being created, "esm" or "cjs".
 * @param location - whether to output to the `src` folder or to one of the ourput folders.
 */
export function createPackageJson(kind: "esm" | "cjs", location: "src" | "output"): void {
	const content = kind === "cjs" ? cjsPackageJson : kind === "esm" ? esmPackageJson : undefined;
	const pathToCreate = kind === "cjs" ? cjsOutputDir : kind === "esm" ? esmOutputDir : undefined;

	if (content === undefined || pathToCreate === undefined) {
		throw new Error(`"kind" value is unknown: ${kind} (expected "esm" or "cjs")`);
	}

	if (location === "src") {
		outputFileSync(modulePackageJsonPath, content);
	} else {
		const outputPath = path.join(pathToCreate, "package.json");
		log(`Creating: ${outputPath}`);
		outputFileSync(outputPath, content);
	}
}

export function removePackageJson(): void {
	try {
		unlinkSync(modulePackageJsonPath);
	} catch {
		// Do nothing; ignore failures here.
	}
}

export async function execTsc(...args: string[]) {
	log(`tsc ${args.join(" ")}`);
	const result = await execa("tsc", args, {
		cwd: process.cwd(),
		stdio: "inherit",
		shell: true,
	});

	if (result.exitCode !== 0) {
		throw new Error(
			`tsc exited with a non-zero exit code: ${result.exitCode} -- ${result.all}`,
		);
	}
}

export async function tscWrapper(kind: "esm" | "cjs") {
	createPackageJson(kind, "src");

	const args = process.argv.slice(2);
	await execTsc(...args);

	createPackageJson(kind, "output");
}
