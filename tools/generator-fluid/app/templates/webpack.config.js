const fluidRoute = require("@microsoft/fluid-webpack-component-loader");
const path = require("path");

const pkg = require("./package.json");
const componentName = pkg.name.slice(1);

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
                loader: "ts-loader",
            }]
        },
        output: {
            filename: "main.bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "main",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939
            devtoolNamespace: componentName,
            libraryTarget: "umd",
        },
        devServer: {
            publicPath: '/dist',
            stats: "minimal",
            open: true, // Opens the browser after running `start`
            before: (app, server) => fluidRoute.before(app, server),
            after: (app, server) => fluidRoute.after(app, server, __dirname, env),
        },
        mode: "development",
        devtool: "source-map"
    });
};
