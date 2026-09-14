import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rustServiceDirectory = path.resolve(packageDirectory, "../..");
const targetDirectory = path.join(rustServiceDirectory, "target");
const releaseDirectory = path.join(targetDirectory, "wasm32-unknown-unknown", "release");

function run(command, args, options = {}) {
	execFileSync(command, args, {
		cwd: rustServiceDirectory,
		stdio: "inherit",
		...options,
	});
}

run(
	"cargo",
	[
		"build",
		"--quiet",
		"--locked",
		"-p",
		"fluid-webtransport-browser",
		"-p",
		"fluid-native-service-browser",
		"--target",
		"wasm32-unknown-unknown",
		"--release",
	],
	{
		env: {
			...process.env,
			RUSTFLAGS: "--cfg=web_sys_unstable_apis",
		},
	},
);

run("wasm-bindgen", [
	path.join(releaseDirectory, "fluid_webtransport_browser.wasm"),
	"--target",
	"web",
	"--out-name",
	"fluid_webtransport_browser",
	"--out-dir",
	path.join(packageDirectory, "pkg"),
]);
run("wasm-bindgen", [
	path.join(releaseDirectory, "fluid_webtransport_browser.wasm"),
	"--target",
	"nodejs",
	"--out-name",
	"fluid_webtransport_browser",
	"--out-dir",
	path.join(rustServiceDirectory, "tests/wasm-client/pkg"),
]);
run("wasm-bindgen", [
	path.join(releaseDirectory, "fluid_native_service_browser.wasm"),
	"--target",
	"web",
	"--out-name",
	"fluid_native_service_browser",
	"--out-dir",
	path.join(packageDirectory, "pkg-local"),
]);
