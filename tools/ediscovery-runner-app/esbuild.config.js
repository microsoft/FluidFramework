const { resolve } = require("path");

module.exports = {
  absWorkingDir: __dirname,
  platform: "node",
  entryPoints: { eDiscoveryRunnerApp: "./lib/eDiscoveryRunnerApp.js" },
  outdir: resolve(__dirname, "dist"),
  bundle: true,
  minify: true,
  legalComments: "linked"
};
