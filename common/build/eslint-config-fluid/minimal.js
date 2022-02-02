/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "node": true
    },
    "extends": [
        "@rushstack/eslint-config/profile/web-app",
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
    },
    "plugins": [
        "react",
        "unicorn",
    ],
    "reportUnusedDisableDirectives": true,
    "rules": {
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

        // Encourages minimal disabling of eslint rules, while still permitting whole-file exclusions.
        "eslint-comments/disable-enable-pair": [
            "error", {
                "allowWholeFile": true
            }
        ],

        // ENABLED INTENTIONALLY
        "@typescript-eslint/ban-types": "error",
        "@typescript-eslint/dot-notation": "error",
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "eqeqeq": [
            "error",
            "smart"
        ],
        "max-len": [
            "error",
            {
                "ignoreRegExpLiterals": false,
                "ignoreStrings": false,
                "code": 120
            }
        ],
        "no-multi-spaces": ["error", {"ignoreEOLComments": true}],
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

        // DISABLED INTENTIONALLY
        "@rushstack/typedef-var": "off",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/explicit-member-accessibility": "off",
        "@typescript-eslint/indent": "off", // Off because it conflicts with typescript-formatter
        "@typescript-eslint/member-ordering": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-parameter-properties": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/typedef": "off",
        "func-call-spacing": "off", // Off because it conflicts with typescript-formatter
        "no-empty": "off",
        "no-void": "off",
        "require-atomic-updates": "off",
        "dot-notation": "off", // Superseded by @typescript-eslint/dot-notation
        "no-unused-expressions": "off", // Superseded by @typescript-eslint/no-unused-expressions
    },
    "overrides": [
        {
            // Rules only for TypeScript files
            "files": ["*.ts", "*.tsx"],
            "rules": {
                "dot-notation": "off", // Superseded by @typescript-eslint/dot-notation
                "no-unused-expressions": "off", // Superseded by @typescript-eslint/no-unused-expressions
            }
        },
        {
            // Rules only for test files
            "files": ["src/test/**"],
            "rules": {
                "@typescript-eslint/unbound-method": "off", // This rule has false positives in many of our test projects.
            }
        },
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
