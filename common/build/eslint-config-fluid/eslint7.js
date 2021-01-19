/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This ESLint config is intended for use with ESLint v7 and compatible plugins. It's here so we can easily test the v7
 * config against our packages without upgrading the dependencies here in the common package.
 *
 * Once we have a PR with all the needed updates, we can switch the default export of this package to be this v7 config
 * and remove the old configs.
 *
 * Packages using the v7 config must use these dependency versions:
 *

  "dependencies": {
    "@typescript-eslint/eslint-plugin": "~4.8.1",
    "@typescript-eslint/parser": "~4.8.1",
    "eslint-plugin-eslint-comments": "~3.2.0",
    "eslint-plugin-import": "~2.22.1",
    "eslint-plugin-no-null": "~1.0.2",
    "eslint-plugin-optimize-regex": "~1.2.0",
    "eslint-plugin-prefer-arrow": "~1.2.2",
    "eslint-plugin-react": "~7.21.5",
    "eslint-plugin-unicorn": "~23.0.0"
  },
  "devDependencies": {
    "eslint": "~7.9.0"
  },
  "peerDependencies": {
    "eslint": ">=7.0.0"
  }
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
        "@typescript-eslint",
        "no-null",
        // "optimize-regex",
        "prefer-arrow",
        "react",
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
        // TODO - investigate turning this on once we have correct settings
        // "@typescript-eslint/naming-convention": [
        //     "error",
        //     {
        //         "selector": "default",
        //         "format": ["camelCase"]
        //     },
        //     {
        //         "selector": "variable",
        //         "format": ["camelCase"]
        //     },
        //     {
        //         "selector": "parameter",
        //         "format": ["camelCase"],
        //         "leadingUnderscore": "allow"
        //     },
        //     {
        //         "selector": "memberLike",
        //         "modifiers": ["private"],
        //         "format": ["camelCase"]
        //     },
        //     {
        //         "selector": "typeLike",
        //         "format": ["PascalCase"]
        //     }
        // ],
        "@typescript-eslint/consistent-type-assertions": [
            "error",
            {
                "assertionStyle": "as",
                "objectLiteralTypeAssertions": "never"
            }
        ],
        "@typescript-eslint/consistent-type-definitions": "error",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/interface-name-prefix": "off",
        "@typescript-eslint/member-delimiter-style": "off",
        "@typescript-eslint/no-dynamic-delete": "error",
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
        "@typescript-eslint/no-parameter-properties": "off",
        "@typescript-eslint/no-require-imports": "error",
        "@typescript-eslint/no-this-alias": "error",
        "@typescript-eslint/no-unused-expressions": "error",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-unnecessary-qualifier": "error",
        "@typescript-eslint/no-unnecessary-type-arguments": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "@typescript-eslint/no-use-before-declare": "off",
        "@typescript-eslint/no-var-requires": "error",
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
        "space-in-parens": [
            "error",
            "never"
        ],
        "@typescript-eslint/strict-boolean-expressions": "error",
        "@typescript-eslint/triple-slash-reference": "error",
        "@typescript-eslint/type-annotation-spacing": "error",
        "@typescript-eslint/unbound-method": [
            "error",
            {
                "ignoreStatic": true
            }
        ],
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
                "devDependencies": ["**/*.spec.ts"]
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

        // eslint-plugin-no-null
        "no-null/no-null": "error",

        // eslint-plugin-prefer-arrow
        "prefer-arrow/prefer-arrow-functions": [
            "error",
            {
                "disallowPrototype": false,
                "singleReturnOnly": true,
                "classPropertiesAllowed": false
            }
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

        // eslint
        "arrow-body-style": "off",
        "arrow-parens": [
            "error",
            "always"
        ],
        "camelcase": "off", // Superseded by @typescript-eslint/camelcase
        "capitalized-comments": "off",
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
        "func-call-spacing": "error",
        "guard-for-in": "error",
        "id-match": "error",
        "linebreak-style": "off",
        "keyword-spacing": "error",
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
        "no-unused-expressions": "off",
        "no-unused-labels": "error",
        "no-unused-vars": "off",
        "no-var": "error",
        "no-void": "off",
        "no-whitespace-before-property": "error",
        "object-curly-spacing": [
            "error",
            "always"
        ],
        "object-shorthand": "error",
        "one-var": [
            "error",
            "never"
        ],
        // "optimize-regex/optimize-regex": "error",
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
        "prefer-const": "error",
        "prefer-object-spread": "error",
        "prefer-promise-reject-errors": "error",
        "prefer-template": "error",
        "quote-props": [
            "error",
            "consistent-as-needed"
        ],
        "radix": "error",
        "semi-spacing": "error",
        "space-before-blocks": "error",
        "space-before-function-paren": [
            "error",
            {
                "anonymous": "never",
                "asyncArrow": "always",
                "named": "never"
            }
        ],
        "space-infix-ops": "error",
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
