const spawn = require("cross-spawn");
const path = require('path');
const merge = require('webpack-merge');
const CleanWebpackPlugin = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const ChromeExtensionReloader = require("webpack-chrome-extension-reloader");

module.exports = env => {

    const isProduction = env !== "dev";

    const prodOptions = {
        mode: "production",
        devtool: "source-map",
    };

    const devOptions = {
        mode: "development",
        devtool: "inline-source-map",
        devServer: {
            contentBase: "./dist"
        }
    };  

    const commonOptions = {
        module: {
            rules: [{
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                },
                {
                    test: /\.js$/,
                    use: ["source-map-loader"],
                    enforce: "pre"
                }
            ]
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js']
        }
    };

    const options = merge(commonOptions, isProduction ? prodOptions : devOptions);
    let extensionBundle = {
        entry: {
            background: './src/background.ts',
            content: './src/content.ts',
            contentOptional: './src/contentOptional.ts',
            popup: './src/popup.ts',
            pragueView: './src/pragueView.ts',
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist/extension')
        },
        plugins: [
            new CleanWebpackPlugin(["dist/extension"]),
            new CopyWebpackPlugin(["./src/manifest.json", "./src/view.html", "./src/popup.html", "./src/pragueView.html"])
        ]
    };

    if (!isProduction) {
        extensionBundle = merge(extensionBundle, {
            plugins: [
                new ChromeExtensionReloader({
                    port: 9090,
                    reloadPage: true,
                    entries: {
                        content: "content", // Use the entry names, not the file name or the path
                        contentOptional: "contentOptional",
                        background: "background",
                        popup: "popup",
                        pragueView: "pragueView"
                    }
                }),
            ],
        });
    }

    const componentBundle = {
        entry: {
            pragueViewComponent: './src/pragueViewComponent.ts',
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist/component'),
            library: "[name]",
            devtoolNamespace: "prague/flow/document",
            libraryTarget: "umd"
        },
        plugins: [
            new CleanWebpackPlugin(["dist/component"]),
            {
                apply: (compiler) => {
                    compiler.hooks.afterEmit.tapPromise("PublishChaincodePlugin",
                        (compilation) => {
                            if (compilation.errors.length > 0) {
                                console.warn(`Skipping @chaincode publication due to compilation errors.`);
                                console.warn(`${JSON.stringify(compilation.errors)}`);
                                return Promise.resolve();
                            }

                            return new Promise(resolve => {
                                const proc = spawn("npm", ["run", "publish-patch-local"], {
                                    stdio: [process.stdin, process.stdout, process.stderr]
                                });
                                proc.on('close', resolve);
                            });
                        }
                    );
                }
            }
        ]
    };

    const bundles = [extensionBundle, componentBundle];
    return bundles.map((bundle) => merge(options, bundle));
};