/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": ["./no-tslint"],
    "plugins": [
        "react",
        "@typescript-eslint",
        "@typescript-eslint/tslint"
    ],
    "rules": {
        "@typescript-eslint/tslint/config": [
            "error",
            {
                "rules": {
                    "completed-docs": [
                        true,
                        "classes"
                    ],
                    "encoding": true,
                    "file-header": [
                        true,
                        {
                            "match": "Copyright \\(c\\) Microsoft Corporation\\. All rights reserved\\.[\\*\\s\\/]*Licensed under the MIT License\\.",
                            "allow-single-line-comments": true,
                            "default": "Copyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the MIT License.",
                            "enforce-trailing-newline": false
                        }
                    ],
                    "import-spacing": true,
                    "jsdoc-format": true,
                    "match-default-export-name": true,
                    "no-dynamic-delete": true,
                    "no-redundant-jsdoc": true,
                    "no-reference-import": true,
                    "no-unnecessary-callback-wrapper": true,
                    "no-unsafe-any": true,
                    "number-literal-format": true,
                    "one-line": [
                        true,
                        "check-catch",
                        "check-else",
                        "check-finally",
                        "check-open-brace",
                        "check-whitespace"
                    ],
                    "prefer-method-signature": true,
                    "prefer-while": true,
                    "static-this": true,
                    "switch-final-break": true,
                    "whitespace": [
                        true,
                        "check-branch",
                        "check-decl",
                        "check-operator",
                        "check-separator",
                        "check-type",
                        "check-typecast"
                    ]
                }
            }
        ]
    }
};
