const spawn = require("child_process").spawn;

module.exports = {
    mode: "development",
    devtool: "inline-source-map",
    plugins: [
        {
            apply: (compiler) => {
                compiler.hooks.afterEmit.tapPromise("PublishChaincodePlugin",
                    (compilation) => {
                        if (compilation.errors.length > 0) {
                            console.warn(`Skipping @chaincode publication due to compilation errors.`);
                            return Promise.resolve();
                        }
                        
                        return new Promise(resolve => {
                            const proc = spawn("npm", ["run", "publish-patch-local"],
                                { stdio: [process.stdin, process.stdout, process.stderr] });
                            proc.on('close', resolve);
                        });
                    }
                );
            }
        }
    ]
};
