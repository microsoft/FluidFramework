import execa from "execa";
import { unlinkSync, writeFileSync } from "node:fs";

const cjsPackageJson = `{ "type": "commonjs" }`;
const esmPackageJson = `{ "type": "module" }`;
const modulePackageJsonPath = "./src/package.json";

export function createPackageJson(kind: "esm" | "cjs"): void {
	const content = kind === "cjs" ? cjsPackageJson : kind === "esm" ? esmPackageJson : "";
	writeFileSync(modulePackageJsonPath, content);
}

export function removePackageJson(): void {
	unlinkSync("./src/package.json");
}

export async function execTsc(...args: string[]) {
	const result = await execa("tsc", args, {
		stdio: "inherit",
		shell: true,
	});

	if (result.exitCode !== 0) {
		throw new Error(
			`tsc exited with a non-zero exit code: ${result.exitCode} -- ${result.all}`,
		);
	}
}
