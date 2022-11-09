/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Runs `markdown-magic` on documentation outside of the website (i.e. "/docs").
 * This includes package READMEs, etc.
 */

const pathLib = require("path");
const mdMagic = require("./markdown-magic");

mdMagic(pathLib.resolve(__dirname, ".."), ["**/*.md", "!docs"]);
