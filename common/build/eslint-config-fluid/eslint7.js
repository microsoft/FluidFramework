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
        "eslint:recommended",
        "plugin:eslint-comments/recommended",
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
        "unicorn",
    ],
    "reportUnusedDisableDirectives": true,
    "rules": {
        // Please keep entries alphabetized within a group

        // @typescript-eslint
        "@typescript-eslint/adjacent-overload-signatures": "error",
        "@typescript-eslint/array-type": "error",
        "@typescript-eslint/await-thenable": "error",
        "@typescript-eslint/ban-types": "error",
        "@typescript-eslint/brace-style": "off",
        "@typescript-eslint/comma-dangle": [
            "error",
            {
                "arrays": "always-multiline",
                "enums": "always-multiline",
                "exports": "always-multiline",
                "functions": "always-multiline",
                "generics": "never",
                "imports": "always-multiline",
                "objects": "always-multiline",
                "tuples": "always-multiline",
            }
        ],
        "@typescript-eslint/comma-spacing": "off",
        "@typescript-eslint/consistent-type-assertions": [
            "error",
            {
                "assertionStyle": "as",
                "objectLiteralTypeAssertions": "never"
            }
        ],
        "@typescript-eslint/consistent-type-definitions": "error",
        "@typescript-eslint/dot-notation": "error",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/func-call-spacing": "off",
        "@typescript-eslint/interface-name-prefix": "off",
        "@typescript-eslint/keyword-spacing": "off",
        "@typescript-eslint/member-delimiter-style": "off",
        "@typescript-eslint/no-duplicate-imports": "error",
        "@typescript-eslint/no-dynamic-delete": "error",
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/no-empty-interface": "error",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-extra-semi": "error",
        "@typescript-eslint/no-extraneous-class": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-for-in-array": "error",
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/no-invalid-this": "off",
        "@typescript-eslint/no-magic-numbers": "off",
        "@typescript-eslint/no-misused-new": "error",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/no-parameter-properties": "off",
        "@typescript-eslint/no-require-imports": "error",
        "@typescript-eslint/no-shadow": [
            "error",
            {
                "hoist": "all",
                "ignoreTypeValueShadow": true,
            }
        ],
        "@typescript-eslint/no-this-alias": "error",
        "@typescript-eslint/no-throw-literal": "error",
        "@typescript-eslint/no-unused-expressions": "error",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-unnecessary-qualifier": "error",
        "@typescript-eslint/no-unnecessary-type-arguments": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "@typescript-eslint/no-use-before-declare": "off",
        "@typescript-eslint/no-var-requires": "error",
        "@typescript-eslint/object-curly-spacing": "off",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/prefer-function-type": "error",
        "@typescript-eslint/prefer-namespace-keyword": "error",
        "@typescript-eslint/prefer-readonly": "error",
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
        "@typescript-eslint/restrict-template-expressions": "off",
        "@typescript-eslint/require-await": "off",
        "@typescript-eslint/semi": [
            "error",
            "always"
        ],
        "@typescript-eslint/space-infix-ops": "error",
        "@typescript-eslint/space-before-function-paren": [
            "error",
            {
                "anonymous": "never",
                "asyncArrow": "always",
                "named": "never"
            }
        ],
        "@typescript-eslint/strict-boolean-expressions": "error",
        "@typescript-eslint/triple-slash-reference": "error",
        "@typescript-eslint/type-annotation-spacing": "error",
        "@typescript-eslint/unbound-method": "off",
        "@typescript-eslint/unified-signatures": "error",

        // eslint-plugin-eslint-comments
        "eslint-comments/disable-enable-pair": [
            "error",
            {
                "allowWholeFile": true
            }
        ],

        // eslint-plugin-import
        "import/no-default-export": "error",
        "import/no-deprecated": "off",
        "import/no-extraneous-dependencies": [
            "error",
            {
                "devDependencies": ["**/*.spec.ts", "src/test/**"]
            }
        ],
        "import/no-internal-modules": "error",
        "import/no-unassigned-import": "error",
        "import/no-unresolved": [
            "error",
            {
                "caseSensitive": true
            }
        ],
        "import/no-unused-modules": "error",
        "import/order": "error",

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

        // eslint
        "arrow-body-style": "off",
        "arrow-parens": [
            "error",
            "always"
        ],
        "camelcase": "off", // Superseded by @typescript-eslint/camelcase
        "brace-style": "off", // Superseded by @typescript-eslint/brace-style
        "capitalized-comments": "off",
        "comma-dangle": "off", // Superseded by @typescript-eslint/comma-dangle
        "comma-spacing": "off", // Superseded by @typescript-eslint/comma-spacing
        "complexity": "off",
        "constructor-super": "error",
        "curly": "error",
        "default-case": "error",
        "dot-notation": "off", // Superseded by @typescript-eslint/dot-notation
        "eol-last": "error",
        "eqeqeq": [
            "error",
            "smart"
        ],
        "func-call-spacing": "off", // Superseded by @typescript-eslint/func-call-spacing
        "guard-for-in": "error",
        "id-match": "error",
        "linebreak-style": "off",
        "keyword-spacing": "off", // Superseded by @typescript-eslint/keyword-spacing
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
        "no-constant-condition": "error",
        "no-control-regex": "error",
        "no-debugger": "off",
        "no-duplicate-case": "error",
        "no-duplicate-imports": "off", // Superseded by @typescript-eslint/no-duplicate-imports
        "no-empty": "off",
        "no-eval": "error",
        "no-extra-semi": "off", // Superseded by @typescript-eslint/no-extra-semi
        "no-fallthrough": "off",
        "no-invalid-regexp": "error",
        "no-invalid-this": "off", // Superseded by @typescript-eslint/no-invalid-this
        "no-irregular-whitespace": "error",
        "no-magic-numbers": "off", // Superseded by @typescript-eslint/no-magic-numbers
        "no-multi-str": "off",
        "no-multiple-empty-lines": [
            "error",
            {
                "max": 1,
                "maxBOF": 0,
                "maxEOF": 0,
            }
        ],
        "no-nested-ternary": "off", // Superseded by unicorn/no-nested-ternary
        "no-new-func": "error",
        "no-new-wrappers": "error",
        "no-octal": "error",
        "no-octal-escape": "error",
        "no-param-reassign": "error",
        "no-redeclare": "off", // Superseded by @typescript-eslint/no-redeclare
        "no-regex-spaces": "error",
        "no-restricted-syntax": [
            "error",
            "ForInStatement"
        ],
        "no-return-await": "error",
        "no-sequences": "error",
        "no-shadow": "off", // Superseded by @typescript-eslint/no-shadow
        "no-sparse-arrays": "error",
        "no-template-curly-in-string": "error",
        "no-throw-literal": "off", // Superseded by @typescript-eslint/no-throw-literal
        "no-trailing-spaces": "error",
        "no-undef-init": "error",
        "no-underscore-dangle": "off",
        "no-unsafe-finally": "error",
        "no-unused-expressions": "off", // Superseded by @typescript-eslint/no-unused-expressions
        "no-unused-labels": "error",
        "no-unused-vars": "off",
        "no-var": "error",
        "no-void": "off",
        "no-whitespace-before-property": "error",
        "object-curly-spacing": "off", // Superseded by @typescript-eslint/no-unused-expressions
        "object-shorthand": "error",
        "one-var": [
            "error",
            "never"
        ],
        "padded-blocks": [
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
        "prefer-arrow-callback": "error",
        "prefer-const": "error",
        "prefer-object-spread": "error",
        "prefer-promise-reject-errors": "error",
        "prefer-template": "error",
        "quote-props": [
            "error",
            "consistent-as-needed"
        ],
        "quotes": "off", // Superseded by @typescript-eslint/quotes
        "radix": "error",
        "require-await": "off", // Superseded by @typescript-eslint/require-await
        "semi": "off", // Superseded by @typescript-eslint/semi
        "semi-spacing": "error",
        "space-before-blocks": "error",
        "space-before-function-paren": "off", // Superseded by @typescript-eslint/space-before-function-paren
        "space-infix-ops": "off", // Superseded by @typescript-eslint/space-infix-ops
        "space-in-parens": [
            "error",
            "never"
        ],
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
        "use-isnan": "error",
        "valid-typeof": "off",
        "yoda": "off",
    },
    "overrides": [
        {
            // Rules only for TypeScript files
            "files": ["*.ts", "*.tsx"],
            "rules": {
                "@typescript-eslint/indent": "off", // Off because it conflicts with typescript-formatter
                "func-call-spacing": "off", // Off because it conflicts with typescript-formatter

                // TODO: Enable these ASAP
                "@typescript-eslint/explicit-module-boundary-types": "off",
                "@typescript-eslint/no-unsafe-argument": "off",
                "@typescript-eslint/no-unsafe-assignment": "off",
                "@typescript-eslint/no-unsafe-call": "off",
                "@typescript-eslint/no-unsafe-member-access": "off",
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
