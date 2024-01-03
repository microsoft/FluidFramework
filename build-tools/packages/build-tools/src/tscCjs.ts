import { defaultLogger } from "./common/logging";
import { createPackageJson, execTsc, removePackageJson } from "./tscWrapper";

const { errorLog: error } = defaultLogger;

async function main() {
	const args = process.argv.slice(2);
	await execTsc(...args);
}

// Create package.json for CJS build.
createPackageJson("cjs");

main()
	.catch((e) => {
		error(`Unexpected error. ${e.message}`);
		error(e.stack);
	})
	.finally(() => {
		removePackageJson();
	});
