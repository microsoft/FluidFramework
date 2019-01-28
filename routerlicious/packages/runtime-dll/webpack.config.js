const path = require("path");
const webpack = require("webpack");

const outputPath = path.resolve(__dirname, "dist");

module.exports = { 
    context: process.cwd(),
    entry: {
        PragueRuntime:[
            "@prague/app-component",
            "@prague/app-datastore",
            "@prague/flow-util",
            "@prague/map",
            "@prague/merge-tree",
            "@prague/runtime-definitions",
            "@prague/sequence",
            "@prague/utils",
        ]
    },    
    output: { 
        filename: '[name].dll.js', 
        path: outputPath, 
        library: '[name]', 
    }, 
    node: {
        fs: "empty",
        dgram: "empty",
        net: "empty",
        tls: "empty"
    },    
    plugins: [ 
        new webpack.DllPlugin({ 
            name: '[name]', 
            path: path.join(outputPath, '[name].json')
        })
    ]
};