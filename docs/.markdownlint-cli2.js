/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "customRules": [
        "markdownlint-rule-github-internal-links"
    ],
    "config": {
        "first-line-heading": { // MD041
            "level": 2,
        },
        "github-internal-links": {
            "verbose": false
          },
        "line_length": { // MD013
            "code_blocks": true,
            "line_length": 120,
            "tables": false,
        },
        "no-inline-html": false, //MD033
        "no-multiple-blanks": { // MD012
            "maximum": 2,
        },
        "ul-style": { // MD004
            "style": "consistent",
        }
        // "MD010": false,
        // "MD025": false,
        // "MD026": false,
        // "MD028": false
    },
    "globs": [
        "content/**/*.md",
        "!content/docs/apis",
        "!node_modules",
    ]
};
