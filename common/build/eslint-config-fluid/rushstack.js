/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This is a workaround for https://github.com/eslint/eslint/issues/3458
require("@rushstack/eslint-config/patch/modern-module-resolution");

module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "node": true
    },
    "extends": [
        "@rushstack/eslint-config/profile/web-app",
        "@rushstack/eslint-config/mixins/tsdoc",
        // "@rushstack/eslint-config/mixins/packlets",
        "plugin:eslint-comments/recommended",
        "plugin:import/errors",
        "plugin:import/warnings",
        "plugin:import/typescript"
    ],
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly"
    },
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaFeatures": {
            "jsx": true
        },
        "ecmaVersion": 2018,
        "sourceType": "module",
        "project": "./tsconfig.json",
        // "tsconfigRootDir": __dirname
    },
    "plugins": [
        // "@typescript-eslint",
        "no-null",
        // "optimize-regex",
        "prefer-arrow",
        "react",
        "unicorn",
    ],
    "reportUnusedDisableDirectives": true,
    "overrides": [
        {
            // Rules only for TypeScript files
            "files": ["*.ts", "*.tsx"],
            "rules": {
                "@typescript-eslint/indent": "off", // Off because it conflicts with typescript-formatter
                "func-call-spacing": "off", // Off because it conflicts with typescript-formatter

                // RATIONALE: Harmless.  Our guideline is to only use leading underscores on private members
                //            when required to avoid a conflict between private fields and a public property.
                // Docs: https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/naming-convention.md
                "@typescript-eslint/naming-convention": [
                    "error",
                    {
                        selector: "accessor",
                        modifiers: ["private"],
                        format: ["camelCase"],
                        "leadingUnderscore": "allow"
                    },
                ],

                // eslint-plugin-unicorn
                "unicorn/better-regex": "error",
                "unicorn/filename-case": [
                    "error",
                    {
                        "cases": {
                            "camelCase": true,
                            "pascalCase": true
                        }
                    }
                ],
                "unicorn/no-new-buffer": "error",
                "unicorn/no-unsafe-regex": "error",

                // ENABLED INTENTIONALLY
                "@typescript-eslint/ban-types": "error",
                "@typescript-eslint/no-non-null-assertion": "error",
                "@typescript-eslint/no-unnecessary-type-assertion": "error",
                "max-len": [
                    "error",
                    {
                        "ignoreRegExpLiterals": false,
                        "ignoreStrings": false,
                        "code": 120
                    }
                ],

                // DISABLED INTENTIONALLY
                "@rushstack/typedef-var": "off",
                "@typescript-eslint/explicit-function-return-type": "off",
                "@typescript-eslint/no-explicit-any": "off",
                "@typescript-eslint/member-ordering": "off",
                // "@typescript-eslint/explicit-member-accessibility": [
                //     "error",
                //     {
                //         "accessibility": "no-public",
                //     },
                // ]
                "@typescript-eslint/typedef": "off",
                "@typescript-eslint/no-parameter-properties": [
                    "error",
                    {
                        "allows": [
                            "private",
                            "private readonly",
                            "public readonly",
                            "readonly",
                        ]
                    },
                ],


                // TODO: Enable these ASAP
                // "@typescript-eslint/explicit-module-boundary-types": "off",
                // "@typescript-eslint/no-unsafe-assignment": "off",
                // "@typescript-eslint/no-unsafe-call": "off",
                // "@typescript-eslint/no-unsafe-member-access": "off",
            }
        }
    ],
    "settings": {
        "import/extensions": [
            ".ts",
            ".tsx",
            ".d.ts",
            ".js",
            ".jsx"
        ],
        "import/parsers": {
            "@typescript-eslint/parser": [
                ".ts",
                ".tsx",
                ".d.ts"
            ]
        },
        "import/resolver": {
            "node": {
                "extensions": [
                    ".ts",
                    ".tsx",
                    ".d.ts",
                    ".js",
                    ".jsx"
                ]
            }
        }
    }
};
