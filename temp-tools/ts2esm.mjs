import { repoRoot } from "./git.mjs"
import { execSync } from "child_process";
import path from "path";

const ts2esmPath = path.join(repoRoot(), "temp-tools/node_modules/.bin/ts2esm");

export function ts2esm(tsconfigPaths) {
	return execSync(`${ts2esmPath} ${tsconfigPaths.join(" ")}`, { stdio: "inherit" });
}
