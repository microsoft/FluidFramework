const CleanWebpackPlugin = require("clean-webpack-plugin");

module.exports = {
    entry: {
        app: "./src/index.ts"
    },
    resolve: {
        // Add `.ts` and `.tsx` as a resolvable extension.
        extensions: [".ts", ".tsx", ".js"],
    },
    module: {
        rules: [
            // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
            { test: /\.tsx?$/, loader: "ts-loader" },
        ]
    },
    plugins: [
        new CleanWebpackPlugin(["dist"]),
    ],
    output: { 
        filename: "index.js",
        library: "calc",
        libraryTarget: "umd",
        umdNamedDefine: true,
        // "globalObject" hack to work around WebPack 4 regression when emitting UMD:
        // https://github.com/webpack/webpack/issues/6522
        globalObject: "typeof self !== \"undefined\" ? self : this"
    },
    node: {
        async: "empty",
        fs: "empty",
        dgram: "empty",
        net: "empty",
        tls: "empty",
    },
};
