const spawn = require("cross-spawn");
const path = require('path');
const merge = require('webpack-merge');
const CleanWebpackPlugin = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const ChromeExtensionReloader = require("webpack-chrome-extension-reloader");

module.exports = env => {
    const isProduction = !env || env.target !== "development";
    const publish = env && env.publish;

    const prodOptions = {
        mode: "production",
        devtool: "source-map",
    };

    const devOptions = {
        mode: "development",
        devtool: "inline-source-map",
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
        name: "extension",
        entry: {
            background: './src/background.ts',
            content: './src/content.ts',
            contentOptional: './src/contentOptional.ts',
            popup: './src/popup.ts',
            pragueView: './src/pragueView.ts'
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist/extension')
        },
        plugins: [
            new CleanWebpackPlugin(["dist/extension"]),

            new CopyWebpackPlugin([{
                from: "./src/manifest.json",
                transform: function (content, path) {
                    // generates the manifest file using the package.json informations
                    return Buffer.from(JSON.stringify({
                        description: process.env.npm_package_description,
                        version: process.env.npm_package_version,
                        author: process.env.npm_package_author,
                        ...JSON.parse(content.toString())
                    }))
                }
            }]),
            new HtmlWebpackPlugin({
                template: path.join(__dirname, "src", "view.html"),
                filename: "view.html",
                minify: true,
                chunks: []
            }),
            new HtmlWebpackPlugin({
                template: path.join(__dirname, "src", "popup.html"),
                filename: "popup.html",
                chunks: ["popup"]
            }),
            new HtmlWebpackPlugin({
                template: path.join(__dirname, "src", "pragueView.html"),
                filename: "pragueView.html",
                chunks: ["pragueView"]
            }),
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

    let componentBundle = {
        name: "component",
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
        ]
    };

    if (publish) {
        componentBundle = merge(componentBundle, {
            plugins: [{
                apply: (compiler) => {
                    compiler.hooks.afterEmit.tapPromise("PublishChaincodePlugin",
                        (compilation) => {
                            if (compilation.errors.length > 0) {
                                console.warn(`Skipping @chaincode publication due to compilation errors.`);
                                console.warn(`${JSON.stringify(compilation.errors)}`);
                                return Promise.resolve();
                            }

                            return new Promise(resolve => {
                                const proc = spawn("npm", ["run", "publish-local"], {
                                    stdio: [process.stdin, process.stdout, process.stderr]
                                });
                                proc.on('close', resolve);
                            });
                        }
                    );
                }
            }]
        })
    }

    const bundles = [extensionBundle, componentBundle];
    return bundles.map((bundle) => merge(options, bundle));
};