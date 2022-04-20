/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        // "jest/globals": true,
        "node": true,
    },
    "extends": [
        // "eslint:recommended",
        "plugin:eslint-comments/recommended",
        // "plugin:@typescript-eslint/eslint-recommended",
        // "plugin:@typescript-eslint/recommended",
        // "plugin:@typescript-eslint/recommended-requiring-type-checking",
        // "plugin:unicorn/recommended",
        // "plugin:editorconfig/all",
        // "plugin:editorconfig/noconflict",
        // "plugin:import/errors",
        "plugin:import/warnings",
        "plugin:import/typescript",
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
        // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-react
        "react",
        // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-unicorn
        "unicorn",
        // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-editorconfig
        "editorconfig",
        // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-tsdoc
        "eslint-plugin-tsdoc",
    ],
    "reportUnusedDisableDirectives": true,
    "rules": {
        "@typescript-eslint/unbound-method": "off",
        "import/no-unresolved": "off",
        "no-void": "off",

        // Enforce consistent brace style for blocks.
        "@typescript-eslint/brace-style": [
            "warn",
            "1tbs",
            {
                "allowSingleLine": true,
            },
        ],

        // Use dangling commas where possible.
        "@typescript-eslint/comma-dangle": [
            "error",
            "always-multiline",
        ],

        // Enforces consistent spacing before and after commas.
        "@typescript-eslint/comma-spacing": "error",

        // Enforces no space between functions and their invocation.
        "@typescript-eslint/func-call-spacing": "error",

        // Superseded by @typescript-eslint/keyword-spacing.
        "@typescript-eslint/keyword-spacing": "error",

        // Standardize using semicolons to delimit members for interfaces and type literals.
        "@typescript-eslint/member-delimiter-style": "error",

        // Enforces spacing in curly brackets.
        "@typescript-eslint/object-curly-spacing": [
            "error",
            "always",
        ],

        // Enforce the consistent use of double quotes.
        "@typescript-eslint/quotes": [
            "error",
            "double",
            {
                "allowTemplateLiterals": true,
                "avoidEscape": true
            }
        ],

        // Enforces consistent use of semicolons after statements.
        "@typescript-eslint/semi": [
            "error",
            "always"
        ],

        // Enforces consistent spacing before function parentheses.
        "@typescript-eslint/space-before-function-paren": [
            "error",
            {
                "anonymous": "never",
                "asyncArrow": "always",
                "named": "never"
            }
        ],

        // This rule is aimed at ensuring there are spaces around infix operators.
        "@typescript-eslint/space-infix-ops": "error",

        // Require consistent spacing around type annotations.
        "@typescript-eslint/type-annotation-spacing": "error",

        // Require parens around arrow function arguments
        "arrow-parens": [
            "error",
            "always"
        ],

        // Superseded by @typescript-eslint/brace-style.
        "brace-style": "off",

        // Superseded by @typescript-eslint/comma-spacing.
        "comma-spacing": "off",

        // Requires following curly brace conventions.
        "curly": "error",

        // Disabled becuase it doesn't work well for all our files.
        "editorconfig/indent": "off",

        // Requires that eslint disable comments have a start and an end, rather than being open-ended. Encourages
        // minimal disabling of eslint rules, while still permitting whole-file exclusions.
        "eslint-comments/disable-enable-pair": [
            "error",
            {
                "allowWholeFile": true
            }
        ],

        // Superseded by @typescript-eslint/func-call-spacing.
        "func-call-spacing": "off",

        // Superseded by @typescript-eslint/keyword-spacing.
        "keyword-spacing": "off",

        // Requires parentheses when invoking a constructor with no arguments.
        "new-parens": "error",

        // Disallows multiple consecutive spaces.
        "no-multi-spaces": [
            "error",
            {
                "ignoreEOLComments": true
            }
        ],

        // Prevent multiple empty lines.
        "no-multiple-empty-lines": [
            "error",
            {
                "max": 1,
                "maxBOF": 0,
                "maxEOF": 0,
            }
        ],

        // Disallows whitespace before properties.
        "no-whitespace-before-property": "error",

        // Disallows use of the void operator.
        "no-void": "error",

        // Superseded by @typescript-eslint/object-curly-spacing.
        "object-curly-spacing": "off",

        // Disallows empty lines at the beginning and ending of block statements, function bodies, class static blocks,
        // classes, and switch statements.
        "padded-blocks": [
            "error",
            "never"
        ],

        // Require quotes around object literal property names.
        "quote-props": [
            "error",
            "consistent-as-needed"
        ],

        // Superseded by @typescript-eslint/quotes.
        "quotes": "off",

        // Superseded by @typescript-eslint/semi.
        "semi": "off",

        // Enforce spaces after, but not before, semicolons.
        "semi-spacing": "error",

        // Enforce consistent spacing before blocks.
        "space-before-blocks": "error",

        // Superseded by @typescript-eslint/space-before-function-paren.
        "space-before-function-paren": "off",

        // Superseded by @typescript-eslint/space-infix-ops.
        "space-infix-ops": "error",

        // Enforce consistent spacing inside parentheses.
        "space-in-parens": [
            "error",
            "never"
        ],

        // Enforces consistent spacing after the // or /* in a comment.
        "spaced-comment": [
            "error",
            "always",
            {
                "block": {
                    "markers": ["!"],
                    "balanced": true
                }
            }
        ],

    },
    "overrides": [
        {
            // Rules only for TypeScript files
            "files": ["*.ts", "*.tsx"],
            "rules": {}
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
        {
            // Rules only for test files
            "files": ["*.spec.ts", "src/test/**"],
            "extends": [
                // "plugin:jest/recommended",
                // "plugin:mocha/recommended",
            ],
            "rules": {
                // Tests use hardcoded magic numbers regularly.
                "@typescript-eslint/no-magic-numbers": "off",

                // Superseded by jest/unbound-method.
                "@typescript-eslint/unbound-method": "off",

                // Disabled for test projects since they often don't have exports.
                "import/no-unused-modules": "off",

                "jest/expect-expect": [
                    "warn",
                    {
                        "assertFunctionNames": [
                            "assert",
                            "assert.*",
                            "expect*",
                            "strict",
                            "strict.*",
                            "test*",
                        ]
                    }
                ],

                // Jest-specific version of @typescript-eslint/unbound-method.
                "jest/unbound-method": "off",

                // Disabled because we use arrow functions in our mocha tests often.
                "mocha/no-mocha-arrows": "off",

                // Disabled because it's noisy in test projects.
                "unicorn/consistent-function-scoping": "off",

            },
            "plugins": [
                // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-jest
                "jest",
                // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-mocha
                "mocha",
            ],
            "settings": {
                "jest": {
                    "version": "26.6.3",
                },
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
        },
    }
};
