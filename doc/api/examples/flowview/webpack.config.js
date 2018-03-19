const path = require('path');

module.exports = {
    entry: './dist/index.js',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                include: [
                    path.resolve(__dirname, "node_modules/@prague/routerlicious"),
                    path.resolve(__dirname, "node_modules/telegrafjs"),
                ],
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['env']
                    }
                }
            }
        ],
    },
    node: {
        fs: 'empty',
        dgram: 'empty',
        net: 'empty',
    }
};
