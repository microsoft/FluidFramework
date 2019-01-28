const path = require("path");
const webpack = require("webpack");

const outputPath = path.resolve(__dirname, "dist");

module.exports = { 
    context: process.cwd(),
    entry: {
        External:[
            "angular",
            "angular-route",
            "bootstrap",
            "debug",
            "file-loader",
            "google-maps",
            "jquery",
            "leaflet",
            "@uifabric/icons",
            "office-ui-fabric-react",
            "react",
            "react-dom"
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