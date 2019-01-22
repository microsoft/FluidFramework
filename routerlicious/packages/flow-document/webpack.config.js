const path = require("path");
const merge = require("webpack-merge");

module.exports = env => {
    const isProduction = env === "production";
    const tsconfig = isProduction
        ? "tsconfig.prod.json"
        : "tsconfig.dev.json";

    return merge({
        entry: {
            main: "./src/index.ts"
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    use: ["source-map-loader"],
                    exclude: /node_modules/,
                    enforce: "pre"
                },
                { 
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    options: { 
                        configFile: tsconfig,
                        // ts-loader v4.4.2 resolves the 'declarationDir' for .d.ts files relative to 'outDir'.
                        // This is different than 'tsc', which resolves 'declarationDir' relative to the location
                        // of the tsconfig. 
                        compilerOptions: {
                            declarationDir: ".",
                        }
                    },
                }
            ]
        },
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939            
            devtoolNamespace: "flow-document",
            libraryTarget: "umd"
        },
        node: {
            fs: "empty",
            dgram: "empty",
            net: "empty",
            tls: "empty"
        }
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};