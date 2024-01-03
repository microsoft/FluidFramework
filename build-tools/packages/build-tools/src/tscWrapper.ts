import execa from "execa";
import { outputFileSync } from "fs-extra";
import { unlinkSync } from "node:fs";
import * as path from "node:path";

const cjsPackageJson = `{ "type": "commonjs" }`;
const esmPackageJson = `{ "type": "module" }`;
const modulePackageJsonPath = "./src/package.json";
const cjsOutputDir = "./dist/";
const esmOutputDir = "./lib/";

export function createPackageJson(kind: "esm" | "cjs"): void {
	const content = kind === "cjs" ? cjsPackageJson : kind === "esm" ? esmPackageJson : undefined;
	const pathToCreate = kind === "cjs" ? cjsOutputDir : kind === "esm" ? esmOutputDir : undefined;

	if (content === undefined || pathToCreate === undefined) {
		throw new Error(`"kind" value is unknown: ${kind} (expected "esm" or "cjs")`);
	}

	if (pathToCreate === undefined) {
		outputFileSync(modulePackageJsonPath, content);
	} else {
		outputFileSync(path.join(pathToCreate, "package.json"), content);
	}
}

export function removePackageJson(): void {
	try {
		unlinkSync("./src/package.json");
	} catch {
		// Do nothing; ignore failures here.
	}
}

export async function execTsc(...args: string[]) {
	console.log(`cwd: ${process.cwd()}`);
	console.log(args);
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
