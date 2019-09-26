/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');

module.exports = {
    entry: {
        loader: path.resolve(__dirname, './index.ts')
    },
    mode: 'development',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            compilerOptions: {
                                declaration: false,
                                module: "esnext",
                            },
                        }
                    }
                ],
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    output: {
        filename: 'fluid-loader.bundle.js',
        path: path.resolve(__dirname, '../../client'),
        library: 'loader',
        libraryTarget: 'var'
    }
};
