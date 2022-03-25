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
            devMiddleware: {
                publicPath: '/dist',
                stats: "minimal",
            },
            onBeforeSetupMiddleware: (devServer) => fluidRoute.before(devServer.app, devServer),
            onAfterSetupMiddleware: (devServer) => fluidRoute.after(devServer.app, devServer, __dirname, env),
        },
        // This impacts which files are watched by the dev server (and likely by webpack if watch is true).
        // This should be configurable under devServer.static.watch
        // (see https://github.com/webpack/webpack-dev-server/blob/master/migration-v4.md) but that does not seem to work.
        // The CLI options for disabling watching don't seem to work either, so this may be a symptom of using webpack4 with the newer webpack-cli and webpack-dev-server.
        watchOptions: {
            ignored: "**/node_modules/**",
        },
        mode: "development",
        devtool: "source-map"
    });
};
