const fs = require("fs");
const toml = require("toml");
const child_process = require("child_process");

try {
	const data = fs.readFileSync("./Cargo.toml", "utf-8");
	const parsed = toml.parse(data);
	parsed.workspace.metadata["fluid-wasm-output-bundles"].forEach((packageName) => {
		child_process.execSync(`node wasm-pack-crate.js ${packageName} ${process.argv[2]}`);
	});
} catch (err) {
	console.error(err.message);
}
