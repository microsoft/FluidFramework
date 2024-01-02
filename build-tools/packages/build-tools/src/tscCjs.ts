import { defaultLogger } from "./common/logging";
import { createPackageJson, execTsc, removePackageJson } from "./tscWrapper";

const { errorLog: error } = defaultLogger;

async function main() {
	await execTsc(...process.argv.slice(1));
}

// Create package.json for ESM build.
createPackageJson("cjs");

main()
	.catch((e) => {
		error(`Unexpected error. ${e.message}`);
		error(e.stack);
	})
	.finally(() => {
		removePackageJson();
	});
