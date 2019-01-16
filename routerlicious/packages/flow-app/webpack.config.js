const path = require("path");
const merge = require("webpack-merge");
const CleanWebpackPlugin = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = env => {
    const isProduction = env === "production";
    const tsconfig = isProduction
        ? "tsconfig.dev.json" // TODO: "tsconfig.prod.json"
        : "tsconfig.dev.json";
    const styleLocalIdentName = isProduction
        ? "[hash:base64:5]"
        : "[path][name]-[local]-[hash:base64:5]"

    return merge({
        entry: {
            main: "./src/index.tsx"
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
                    options: { configFile: tsconfig },
                },
                {
                    test: /\.css$/,
                    include: path.join(__dirname, 'src'),
                    use: [
                        'style-loader', {
                            loader: 'typings-for-css-modules-loader',
                            options: {
                                modules: true,
                                namedExport: true,
                                localIdentName: styleLocalIdentName
                            }
                        }
                    ]
                }]
        },
        plugins: [
            new CleanWebpackPlugin(["dist"]),
            new HtmlWebpackPlugin({ title: "Production" }),
        ],
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939            
            devtoolNamespace: "flow-app",
            libraryTarget: "umd"
        },
        node: {
            fs: "empty",
            dgram: "empty",
            net: "empty",
            tls: "empty"
        },
        devServer: {
            contentBase: [path.resolve(__dirname, 'assets')],
        }
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};
