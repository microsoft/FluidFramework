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
        "@typescript-eslint/no-empty-function": "warn",
        "@typescript-eslint/no-namespace": "error",
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-call": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/prefer-includes": "error",
        "@typescript-eslint/prefer-nullish-coalescing": "error",
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/prefer-return-this-type": "error",
        "@typescript-eslint/prefer-string-starts-ends-with": "error",
        "@typescript-eslint/prefer-ts-expect-error": "error",
        "@typescript-eslint/switch-exhaustiveness-check": "error",
        "eqeqeq": [
            "error",
            "smart"
        ],
        "guard-for-in": "error",
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
        "no-trailing-spaces": "error",

        // Catches a common coding mistake where "resolve" and "reject" are confused.
        "promise/param-names": "warn",

        "unicode-bom": [
            "off"
        ],

        // Move function definitions to the highest possible scope.
        "unicorn/consistent-function-scoping": "warn",

        // Disabled because it's too nit-picky.
        "unicorn/empty-brace-spaces": "off",

        // This rule makes it possible to pass arguments to TODO and FIXME comments to trigger ESLint to report. Rule
        // documentation is at
        // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/v40.0.0/docs/rules/expiring-todo-comments.md
        "unicorn/expiring-todo-comments": "warn",

        // Enforces all linted files to have their names in a certain case style and lowercase file extension.
        "unicorn/filename-case": [
            "error",
            {
                "cases": {
                    "camelCase": true,
                    "pascalCase": true
                }
            }
        ],

        // Disallow potentially catastrophic exponential-time regular expressions.
        "unicorn/no-unsafe-regex": "error",

        // Disabled because it interferes with our automated assert tagging.
        "unicorn/numeric-separators-style": "off",

        // Prefer .at() method for index access and String#charAt().
        // Disabled because we need to upgrade TypeScript to 4.5+ to use the ES2022 stuff like .at().
        "unicorn/prefer-at": "off",

        // Disabled because the node protocol causes problems, especially for isomorphic packages.
        "unicorn/prefer-node-protocol": "off",

        // Top-level await is more readable and can prevent unhandled rejections.
        "unicorn/prefer-top-level-await": "warn",

        // Disabled because we don't care about using abbreviations.
        "unicorn/prevent-abbreviations": "off",

        // Enforces comparing typeof expressions against valid strings.
        "valid-typeof": "error",

        "@typescript-eslint/explicit-function-return-type": [
            "warn",
            {
                "allowConciseArrowFunctionExpressionsStartingWithVoid": true,
                "allowDirectConstAssertionInArrowFunctions": true,
                "allowExpressions": true,
                "allowHigherOrderFunctions": true,
                "allowTypedFunctionExpressions": true
            }
        ],
        "@typescript-eslint/explicit-member-accessibility": [
            "error",
            {
                "accessibility": "explicit"
            }
        ],
        "@typescript-eslint/explicit-module-boundary-types": "warn",

        // Disabled because we don't require that all variable declarations be explicitly typed.
        "@rushstack/typedef-var": "off",

        // Disabled because it's buggy
        "@typescript-eslint/indent": "off",

        "@typescript-eslint/member-ordering": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-invalid-this": "error",
        "@typescript-eslint/no-parameter-properties": "off",
        "@typescript-eslint/no-unused-vars": "error",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/typedef": "off",
        "func-call-spacing": "off", // Superseded by @typescript-eslint/func-call-spacing
        "no-empty": "off",
        "no-invalid-this": "off", // Superseded by @typescript-eslint/no-invalid-this
        "no-void": "error",
        "require-atomic-updates": "error",
        "dot-notation": "off", // Superseded by @typescript-eslint/dot-notation
        "no-debugger": "error",
        "no-empty": "error",
        "no-fallthrough": "error",
        "no-restricted-syntax": [
            "error",
            "ForInStatement"
        ],
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
        "@typescript-eslint/member-delimiter-style": "error",
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
        "linebreak-style": "error",
        "no-multiple-empty-lines": [
            "error",
            {
                "max": 1,
                "maxBOF": 0,
                "maxEOF": 1
            }
        ],
        "space-infix-ops": "off", // Superseded by @typescript-eslint/space-infix-ops
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
