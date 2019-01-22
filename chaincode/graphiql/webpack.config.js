const path = require("path");
const merge = require("webpack-merge");
const webpack = require("webpack");

module.exports = env => {
    const isProduction = env === "production";

    return merge({
        entry: {
            main: "./src/index.ts"
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js", ".webpack.js", ".web.js", ".mjs", ".json"],
        },
        module: {
            rules: [
                { 
                    test: /\.tsx?$/,
                    loader: "ts-loader"
                },
                {
                    test: /\.css$/,
                    use: [
                        "style-loader", // creates style nodes from JS strings
                        "css-loader", // translates CSS into CommonJS
                    ]
                },
                {
                    test: /\.mjs$/,
                    include: /node_modules/,
                    type: "javascript/auto",
                  }
            ]
        },
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939            
            devtoolNamespace: "chaincode/counter",
            libraryTarget: "umd"
        },
        devServer: {
            publicPath: '/dist'
        },
        plugins: [
            new webpack.ContextReplacementPlugin(
				/graphql-language-service-interface[\\/]dist$/,
				new RegExp(`^\\./.*\\.js$`)
			)
        ]
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};
