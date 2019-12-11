/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "node": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:react/recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
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
        "project": "./tsconfig.json"
    },
    "plugins": [
        "react",
        "unicorn",
        "no-null",
        "prefer-arrow",
        "@typescript-eslint",
    ],
    "reportUnusedDisableDirectives": true,
    "rules": {
        "@typescript-eslint/adjacent-overload-signatures": "error",
        "@typescript-eslint/array-type": "error",
        "@typescript-eslint/await-thenable": "error",
        "@typescript-eslint/ban-types": "error",
        "@typescript-eslint/class-name-casing": "error",
        "@typescript-eslint/consistent-type-assertions": "error",
        "@typescript-eslint/consistent-type-definitions": "error",
        "@typescript-eslint/explicit-function-return-type": "off",
        // "@typescript-eslint/explicit-member-accessibility": [
        //     "error",
        //     {
        //         "accessibility": "explicit"
        //     }
        // ],
        "@typescript-eslint/indent": [
            "error",
            4,
            {
                "FunctionDeclaration": {
                    "parameters": "first"
                },
                "FunctionExpression": {
                    "parameters": "first"
                }
            }
        ],
        "@typescript-eslint/interface-name-prefix": "off",
        "@typescript-eslint/member-delimiter-style": "off",
        // "@typescript-eslint/member-ordering": "error",
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/no-empty-interface": "error",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-extraneous-class": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-for-in-array": "error",
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/no-misused-new": "error",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-non-null-assertion": "error",
        "no-param-reassign": "error",
        "@typescript-eslint/no-parameter-properties": "off",
        "@typescript-eslint/no-require-imports": "error",
        "@typescript-eslint/no-this-alias": "error",
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": [
            "error",
            {
                "args": "none"
            }
        ],
        "@typescript-eslint/no-unnecessary-qualifier": "error",
        "@typescript-eslint/no-unnecessary-type-arguments": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "@typescript-eslint/no-use-before-declare": "off",
        "@typescript-eslint/no-var-requires": "error",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/prefer-function-type": "error",
        "@typescript-eslint/prefer-namespace-keyword": "error",
        "@typescript-eslint/promise-function-async": "error",
        "@typescript-eslint/quotes": [
            "error",
            "double",
            {
                "allowTemplateLiterals": true,
                "avoidEscape": true
            }
        ],
        "@typescript-eslint/restrict-plus-operands": "error",
        "@typescript-eslint/require-await": "off",
        "@typescript-eslint/semi": [
            "error",
            "always"
        ],
        "space-in-parens": [
            "error",
            "never"
        ],
        "@typescript-eslint/strict-boolean-expressions": [
            "warn",
            {
                "allowNullable": true
            }
        ],
        "@typescript-eslint/triple-slash-reference": "error",
        "@typescript-eslint/type-annotation-spacing": "error",
        "@typescript-eslint/unified-signatures": "error",
        "arrow-body-style": "error",
        "arrow-parens": [
            "error",
            "always"
        ],
        "camelcase": "off",
        "@typescript-eslint/camelcase": "off",
        "capitalized-comments": [
            "warn",
            "always",
            {
                "ignoreConsecutiveComments": true,
                "ignoreInlineComments": true,
                "ignorePattern": "tslint:| start | end "
            }
        ],
        "comma-dangle": [
            "error",
            "always-multiline"
        ],
        "complexity": "off",
        "constructor-super": "error",
        "curly": "error",
        "default-case": "error",
        "dot-notation": "error",
        "eol-last": "error",
        "eqeqeq": [
            "error",
            "smart"
        ],
        "guard-for-in": "error",
        // "id-blacklist": [
        //     "error",
        //     "any",
        //     "Number",
        //     "number",
        //     "String",
        //     "string",
        //     "Boolean",
        //     "boolean",
        //     "Undefined",
        //     "undefined"
        // ],
        "id-match": "error",
        "import/no-default-export": "error",
        "import/no-deprecated": "off",
        "import/no-extraneous-dependencies": [
            "error",
            {
                "devDependencies": false
            }
        ],
        "import/no-internal-modules": "error",
        "import/no-unassigned-import": "error",
        "import/order": "error",
        "linebreak-style": "off",
        "max-classes-per-file": "off",
        "max-len": [
            "error",
            {
                "ignoreRegExpLiterals": false,
                "ignoreStrings": false,
                "code": 120
            }
        ],
        "max-lines": "off",
        "new-parens": "error",
        "newline-per-chained-call": "off",
        "no-bitwise": "error",
        "no-caller": "error",
        "no-cond-assign": "error",
        // "no-console": [
        //     "error",
        //     {
        //         "allow": [
        //             "debug",
        //             "info",
        //             "dirxml",
        //             "dir",
        //             "time",
        //             "timeEnd",
        //             "timeLog",
        //             "trace",
        //             "assert",
        //             "clear",
        //             "count",
        //             "countReset",
        //             "group",
        //             "groupCollapsed",
        //             "groupEnd",
        //             "table",
        //             "Console",
        //             "markTimeline",
        //             "profile",
        //             "profileEnd",
        //             "timeline",
        //             "timelineEnd",
        //             "timeStamp",
        //             "context"
        //         ]
        //     }
        // ],
        "no-constant-condition": "error",
        "no-control-regex": "error",
        "no-debugger": "off",
        "no-duplicate-case": "error",
        "no-duplicate-imports": "error",
        "no-empty": "off",
        "no-eval": "error",
        "no-extra-semi": "error",
        "no-fallthrough": "off",
        "no-invalid-regexp": "error",
        "no-invalid-this": "off",
        "no-irregular-whitespace": "error",
        "no-magic-numbers": "off",
        "no-multi-str": "off",
        "no-multiple-empty-lines": "error",
        "no-new-func": "error",
        "no-new-wrappers": "error",
        "no-null/no-null": "error",
        "no-octal": "error",
        "no-octal-escape": "error",
        "no-redeclare": "error",
        "no-regex-spaces": "error",
        "no-restricted-syntax": [
            "error",
            "ForInStatement"
        ],
        "no-return-await": "error",
        "no-sequences": "error",
        "no-shadow": [
            "error",
            {
                "hoist": "all"
            }
        ],
        "no-sparse-arrays": "error",
        "no-template-curly-in-string": "error",
        "no-throw-literal": "error",
        "no-trailing-spaces": "error",
        "no-undef-init": "error",
        "no-underscore-dangle": "off",
        "no-unsafe-finally": "error",
        "no-unused-expressions": "error",
        "no-unused-labels": "error",
        "no-var": "error",
        "no-void": "off",
        "object-shorthand": "error",
        "one-var": [
            "error",
            "never"
        ],
        "padding-line-between-statements": [
            "off",
            "error",
            {
                "blankLine": "always",
                "prev": "*",
                "next": "return"
            }
        ],
        "prefer-arrow/prefer-arrow-functions": [
            "warn",
            {
                "disallowPrototype": false,
                "singleReturnOnly": true,
                "classPropertiesAllowed": false
            }
        ],
        "prefer-const": "error",
        "prefer-object-spread": "error",
        "@typescript-eslint/prefer-readonly": "error",
        "prefer-template": "error",
        "quote-props": [
            "error",
            "consistent-as-needed"
        ],
        "radix": "error",
        "space-before-function-paren": [
            "error",
            {
                "anonymous": "never",
                "asyncArrow": "always",
                // "constructor": "never",
                // "method": "never",
                "named": "never"
            }
        ],
        // "spaced-comment": "error",
        "unicorn/filename-case": [
            "error",
            {
                "cases": {
                    "camelCase": true,
                    "pascalCase": true
                }
            }
        ],
        "use-isnan": "error",
        "valid-typeof": "off",
        "yoda": "off",
    },
    "overrides": [
        {
            // enable the rule specifically for TypeScript files
            "files": ["*.ts", "*.tsx"],
            "rules": {
                // "@typescript-eslint/explicit-function-return-type": [
                //     "error",
                //     {
                //         "allowExpressions": true
                //     }
                // ]
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
