/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const pathLib = require("path");
const mdMagic = require("./md-magic");

mdMagic(pathLib.resolve(__dirname, ".."), ["**/*.md", "!docs"]);
