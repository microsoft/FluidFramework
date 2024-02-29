import path from "path";
import fs from "fs";

export function needsMochaTestSetup(pkgRoot) {
	const mochaRcPath = path.join(pkgRoot, ".mocharc.cjs");
	try {
		const mochaRcText = fs.readFileSync(mochaRcPath, "utf8");

		// If the mochaRcText contains the require statement, then there is no need to
		// add the require statement to the mocha command line.
		return mochaRcText.indexOf(`require("@fluid-internal/mocha-test-setup`) === -1;
	} catch {
		return false;
	}
}
