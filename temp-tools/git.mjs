import { execSync } from "child_process";

export function repoRoot() {
	return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
}
