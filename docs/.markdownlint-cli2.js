/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "customRules": [
        "markdownlint-rule-emphasis-style",
        "markdownlint-rule-github-internal-links",
    ],
    "config": {
        "emphasis-style": {
            style: "*"
        },
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
        "proper-names": {
            "code_blocks": false,
            "names": [
                "Fluid Framework",
                "JavaScript",
                "Microsoft",
                "npm",
            ]
        }
    },
    "globs": [
        "content/**/*.md",
        "!content/docs/apis",
        "!node_modules",
    ]
};
