const fluidRoute = require("@fluidframework/webpack-fluid-loader");
const path = require("path");

const pkg = require("./package.json");
const dataObjectName = pkg.name.slice(1);

module.exports = env => {
    return({
        entry: {
            main: "./src/index.ts",
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
        module: {
            rules: [{
                test: /\.tsx?$/,
                loader: require.resolve("ts-loader"),
            }]
        },
        output: {
            filename: "main.bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "main",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939
            devtoolNamespace: dataObjectName,
            libraryTarget: "umd",
        },
        devServer: {
            publicPath: '/dist',
            stats: "minimal",
            before: (app, server) => fluidRoute.before(app, server),
            after: (app, server) => fluidRoute.after(app, server, __dirname, env),
            watchOptions: {
                ignored: "**/node_modules/**",
            }
        },
        mode: "development",
        devtool: "source-map"
    });
};
