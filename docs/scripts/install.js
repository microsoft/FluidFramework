const { execSync } = require("child_process");
require("dotenv").config();

if (process.env.WCP_CONSENT) {
	console.log("Installing @wcp/wcp-consent...");
	// Run install command and print logs to console as if command was run directly
	execSync("pnpm install -w @wcp/wcp-consent@1.1.0", { stdio: "inherit" });
} else {
	console.log("@wcp/wcp-consent not installed (WCP_CONSENT not set to 'true').");
}
