import { defaultLogger } from "./common/logging";
import { createPackageJson, execTsc, removePackageJson } from "./tscWrapper";

const { errorLog: error } = defaultLogger;

async function main() {
	// Create package.json for ESM build.
	createPackageJson("esm");
	await execTsc(...process.argv.slice(1));
}

main()
	.catch((e) => {
		error(`Unexpected error. ${e.message}`);
		error(e.stack);
	})
	.finally(() => {
		removePackageJson();
	});
