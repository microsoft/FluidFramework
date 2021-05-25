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
        "code-block-style": { // MD046
            "style": "fenced"
        },
        "code-fence-style": { // MD048
            "style": "",
        },
        "emphasis-style": { // custom
            style: "*",
        },
        "first-line-heading": { // MD041
            "level": 2,
        },
        "github-internal-links": { // custom
            "verbose": false,
        },
        "heading-style": { // MD003
            "style": "atx",
        },
        "line-length": { // MD013
            "code_blocks": true,
            "line_length": 120,
            "tables": false,
        },
        "no-empty-links": true, // MD042
        "no-inline-html": false, //MD033
        "no-multiple-blanks": { // MD012
            "maximum": 2,
        },
        "proper-names": { // MD044
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
