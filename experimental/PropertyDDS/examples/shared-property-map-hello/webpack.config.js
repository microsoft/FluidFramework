const path = require("path");
const webpack = require("webpack");

module.exports = {
    entry: "/src/index.js",
    mode: 'development',
    output: { path: path.resolve(__dirname, "dist") },
    target: "web",
    devServer: {
        port: "9500",
        static: ["./public"],
        open: true,
        hot: true,
        liveReload: true
    },
    module: {
        rules: [
            {
                test: /\.m?js/,
                resolve: {
                    fullySpecified: false,
                },
            },
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env", "@babel/preset-react"],
                    },
                },
                resolve: {
                    fallback: {
                        buffer: require.resolve('buffer/'),
                        url: require.resolve("url/"),
                        assert: require.resolve("assert/")
                    },
                },
            },
            {
                test: /\.css$/i,
                use: ["style-loader", "css-loader"],
            },
        ],
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_DEBUG': undefined,
            'process.env.FLUID_MODE': JSON.stringify(process.env.FLUID_MODE),
            'process.env.SECRET_FLUID_RELAY': JSON.stringify(process.env.SECRET_FLUID_RELAY),
            'process.env.SECRET_FLUID_TENANT':JSON.stringify(process.env.SECRET_FLUID_TENANT),
            'process.env.SECRET_FLUID_TOKEN': JSON.stringify(process.env.SECRET_FLUID_TOKEN)
        }),
    ],
    experiments: {
        asyncWebAssembly: true,
        syncWebAssembly: true
    },
};
