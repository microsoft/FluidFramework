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
        "./eslint7",
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
        // Plugin documentation: https://www.npmjs.com/package/@rushstack/eslint-plugin
        "@rushstack/eslint-plugin",
        // Plugin documentation: https://www.npmjs.com/package/@rushstack/eslint-plugin-security
        "@rushstack/eslint-plugin-security",
        // Plugin documentation: https://www.npmjs.com/package/@typescript-eslint/eslint-plugin
        "@typescript-eslint/eslint-plugin",
        // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-promise
        "eslint-plugin-promise",
        // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-tsdoc
        "eslint-plugin-tsdoc",
        // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-react
        "react",
        // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-unicorn
        "unicorn",
    ],
    "reportUnusedDisableDirectives": true,
    "rules": {

        // The @rushstack rules are documented in the package README:
        // https://www.npmjs.com/package/@rushstack/eslint-plugin
        "@rushstack/no-new-null": "warn",

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
        "no-multi-spaces": [
            "error",
            {
                "ignoreEOLComments": true
            }
        ],

        // Catches a common coding mistake where "resolve" and "reject" are confused.
        "promise/param-names": "warn",

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
        // Disabled because we don't require that all variable declarations be explicitly typed.
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

        // FORMATTING RULES
        "@typescript-eslint/brace-style": [
            "error",
            "1tbs",
            {
                "allowSingleLine": true,
            },
        ],
        "@typescript-eslint/comma-spacing": "error",
        "@typescript-eslint/func-call-spacing": "error",
        "@typescript-eslint/keyword-spacing": "error",
        "@typescript-eslint/member-delimiter-style": [
            "error",
            {
                "multiline": {
                    "delimiter": "semi",
                    "requireLast": true
                },
                "singleline": {
                    "delimiter": "semi",
                    "requireLast": true
                },
                "multilineDetection": "brackets"
            },
        ],
        "@typescript-eslint/object-curly-spacing": [
            "error",
            "always",
        ],
        "@typescript-eslint/semi": [
            "error",
            "always"
        ],
        "@typescript-eslint/space-before-function-paren": [
            "error",
            {
                "anonymous": "never",
                "asyncArrow": "always",
                "named": "never"
            }
        ],
        "@typescript-eslint/space-infix-ops": "error",
        "@typescript-eslint/type-annotation-spacing": "error",
        "array-bracket-spacing": "error",
        "arrow-spacing": "error",
        "block-spacing": "error",
        "dot-location": [
            "error",
            "property",
        ],
        "jsx-quotes": "error",
        "key-spacing": "error",
        "space-unary-ops": "error",
        "switch-colon-spacing": "error",

        // This rule ensures that our Intellisense looks good by verifying the TSDoc syntax.
        "tsdoc/syntax": "error",
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
            "files": ["*.spec.ts", "src/test/**"],
            "rules": {
                "@typescript-eslint/unbound-method": "off", // This rule has false positives in many of our test projects.
            }
        },
        {
            // Rules only for type validation files
            "files": ["**/types/*validate*Previous.ts"],
            "rules": {
                "@typescript-eslint/comma-spacing": "off",
                "@typescript-eslint/consistent-type-imports": "off",
                "@typescript-eslint/no-explicit-any": "off",
                "@typescript-eslint/no-unsafe-argument": "off",
                "max-lines": "off",
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
