const path = require("path");
const merge = require("webpack-merge");

module.exports = env => {
  const isProduction = env === "production";

  return merge(
    {
      entry: {
        main: "./src/index.tsx"
      },
      resolve: {
        extensions: [".ts", ".tsx", ".js"],
        alias: {
          "themes/default/assets": path.resolve(__dirname, "../../node_modules/semantic-ui-css/themes/default/assets")
        }
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
              "css-loader" // translates CSS into CommonJS
            ]
          },
          {
            test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
            loader: "url-loader",
            options: {
              limit: 8192
            }
          }
        ]
      },
      output: {
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, "dist"),
        library: "[name]",
        // https://github.com/webpack/webpack/issues/5767
        // https://github.com/webpack/webpack/issues/7939
        devtoolNamespace: "chaincode/chat",
        libraryTarget: "umd"
      },
      devServer: {
        publicPath: "/dist"
      }
    },
    isProduction ? require("./webpack.prod") : require("./webpack.dev")
  );
};
