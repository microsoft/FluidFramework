import { execSync } from "child_process";

export function format() {
	return execSync(`npm run format`, { stdio: "inherit" });
}
