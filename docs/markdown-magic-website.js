/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Runs `markdown-magic` on the documentation contents of the website.
 * Does not run elsewhere in the repo.
 */

const pathLib = require("path");
const mdMagic = require("./markdown-magic");

mdMagic(pathLib.resolve(__dirname), "**/*.md");
