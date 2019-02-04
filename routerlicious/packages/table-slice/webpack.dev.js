const spawn = require("child_process").spawn;
const webpack = require("webpack");

const runCmd = (cmd, args) => new Promise(resolve => {
    spawn(cmd, args, { stdio: [process.stdin, process.stdout, process.stderr] }).on('close', resolve);
});

module.exports = {
    mode: "development",
    devtool: "inline-source-map",
    plugins: [
        {
            apply: (compiler) => {
                compiler.hooks.watchRun.tapPromise("VersionChaincodePlugin", () => runCmd("npm", ["version", "patch"])),
                compiler.hooks.afterEmit.tapPromise("PublishChaincodePlugin",
                    (compilation) => {
                        if (compilation.errors.length > 0) {
                            console.warn(`Skipping @chaincode publication due to compilation errors.`);
                            return Promise.resolve();
                        }
                        
                        return runCmd("npm", ["run", "publish-local"]);
                    }
                );
            }
        },
        // Ensure that automatically versioning package.json (above) does not cause '--watch' to build
        // in an infinite loop.
        new webpack.WatchIgnorePlugin([/\bpackage.json\b/])
    ]
};
