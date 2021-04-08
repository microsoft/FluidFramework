const HtmlWebpackPlugin = require("html-webpack-plugin");
const Dotenv = require('dotenv-webpack');
const path = require('path');

module.exports = env => {
    const htmlTemplate = "./src/index.html";
    return {
        devtool: "inline-source-map",
        entry: "./src/app.tsx",
        mode: "development",
        devServer: {
            port: 9000
        },
        module: {
            rules: [{
                    test: /\.s?css$/,
                    use: ['style-loader', 'css-loader', 'sass-loader']
                },
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader"
                },
                {
                    test: /\.js$/,
                    use: ["source-map-loader"],
                }
            ]
        },
        output: {
            filename: "[name].[contenthash].js",
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: htmlTemplate
            }),
            new Dotenv()
        ],
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
            alias: {
                "@fluid-experimental/property-inspector-table": path.resolve(__dirname, '../../packages/property-inspector-table/dist/lib/@adsk/forge-appfw-hfdm-inspector-table.js')
            }
        },
    }
}
