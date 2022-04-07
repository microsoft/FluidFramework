/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "jest/globals": true,
        "node": true,
    },
    "extends": [
        "eslint:recommended",
        "plugin:eslint-comments/recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "plugin:unicorn/recommended",
        "plugin:editorconfig/all",
        "plugin:editorconfig/noconflict",
        "plugin:import/errors",
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
        // Prevent usage of the JavaScript null value, while allowing code to access existing APIs that may require
        // null.
        "@rushstack/no-new-null": "error",

        // Disabled because we don't require that all variable declarations be explicitly typed.
        "@rushstack/typedef-var": "off",

        // Use default array type (e.g. MyArray: int[]) consistently.
        "@typescript-eslint/array-type": "error",

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
            {
                "arrays": "always-multiline",
                "enums": "always-multiline",
                "exports": "always-multiline",
                "functions": "always-multiline",
                "generics": "always-multiline",
                "imports": "always-multiline",
                "objects": "always-multiline",
                "tuples": "always-multiline",
            }
        ],

        // Enforces consistent spacing before and after commas.
        "@typescript-eslint/comma-spacing": "error",

        // Enforces consistent usage of type assertions.
        "@typescript-eslint/consistent-type-assertions": [
            "error",
            {
                "assertionStyle": "as",
                "objectLiteralTypeAssertions": "never"
            }
        ],

        // Prefer `interface` over `type` when defining types.
        "@typescript-eslint/consistent-type-definitions": ["error", "interface"],

        // Prefer type-only imports where possible,
        "@typescript-eslint/consistent-type-imports": [
            "warn",
            {
                prefer: "type-imports"
            }
        ],

        // Enforce dot notation whenever possible.
        "@typescript-eslint/dot-notation": "error",

        // Require all members have explicit private/public/etc.
        "@typescript-eslint/explicit-member-accessibility": [
            "error",
            {
                accessibility: "explicit",
                overrides: {
                    accessors: "explicit",
                    constructors: "explicit",
                    methods: "explicit",
                    properties: "explicit",
                    parameterProperties: "explicit"
                }
            },
        ],

        // Requires explicit typing for anything exported from a module. Explicit types for function return values and
        // arguments makes it clear to any calling code what is the module boundary's input and output.
        "@typescript-eslint/explicit-module-boundary-types": "error",

        // Standardize using semicolons to delimit members for interfaces and type literals.
        "@typescript-eslint/member-delimiter-style": "warn",

        // Our guideline is to only use leading underscores on private members when required to avoid a conflict between
        // private fields and a public property.
        "@typescript-eslint/naming-convention": [
            "error",
            {
                selector: "accessor",
                modifiers: ["private"],
                format: ["camelCase"],
                "leadingUnderscore": "allow"
            },
        ],

        // Disallow duplicate imports.
        "@typescript-eslint/no-duplicate-imports": "error",

        // Disallow the delete operator with computed key expressions. Deleting dynamically computed keys can be
        // dangerous and in some cases not well optimized.
        "@typescript-eslint/no-dynamic-delete": "error",

        // Disallow empty functions.
        "@typescript-eslint/no-empty-function": "error",

        // Disallow the declaration of empty interfaces. An empty interface is equivalent to its supertype. If the
        // interface does not implement a supertype, then the interface is equivalent to an empty object ({}). In both
        // cases it can be omitted.
        "@typescript-eslint/no-empty-interface": "error",

        // In some cases, type inference can be wrong, and this can cause a "flip-flop" of type changes in our
        // API documentation. For example, type inference might decide a function returns a concrete type
        // instead of an interface. This has no runtime impact, but would cause compilation problems.
        "@typescript-eslint/explicit-function-return-type": [
            "warn",
            {
                "allowExpressions": true,
                "allowTypedFunctionExpressions": true,
                "allowHigherOrderFunctions": true,
                "allowDirectConstAssertionInArrowFunctions": true,
                "allowConciseArrowFunctionExpressionsStartingWithVoid": false,
            }
        ],

        // Forbids the use of classes as namespaces.
        "@typescript-eslint/no-extraneous-class": "error",

        // This rule disallows explicit type declarations for inferrable types. Disabled because sometimes explicit type
        // declarations help readability.
        "@typescript-eslint/no-inferrable-types": "off",

        // Disallow this keywords outside of classes or class-like objects.
        "@typescript-eslint/no-invalid-this": "error",

        // Disallow magic numbers. Disabled because our automatic assert tagging spits out magic numbers.
        "@typescript-eslint/no-magic-numbers": [
            "off",
            {
                // 0, 1, and -1 are ok
                "ignore": [0, 1, -1],
                "ignoreArrayIndexes": true,
                "ignoreDefaultValues": true,
            }
        ],

        // Disallows non-null assertions using the `!` postfix operator.
        "@typescript-eslint/no-non-null-assertion": "error",

        // Parameter properties can be confusing to those new to TypeScript as they are less explicit than other
        // ways of declaring and initializing class members.
        "@typescript-eslint/no-parameter-properties": "warn",

        // Prefer ES6-style imports over require().
        "@typescript-eslint/no-require-imports": "error",

        // Disallow variable declarations from shadowing variables declared in the outer scope.
        "@typescript-eslint/no-shadow": [
            "error",
            {
                "hoist": "all",
                "ignoreTypeValueShadow": true,
            }
        ],

        // Disallow throwing literals as exceptions. It is considered good practice to only throw the Error object
        // itself or an object using the Error object as base objects for user-defined exceptions. The fundamental
        // benefit of Error objects is that they automatically keep track of where they were built and originated.
        "@typescript-eslint/no-throw-literal": "error",

        // Disallows non-null assertions using the `!` postfix operator.
        "@typescript-eslint/no-unnecessary-qualifier": "error",

        // Enforces that type arguments will not be used if not required.
        "@typescript-eslint/no-unnecessary-type-arguments": "error",

        // Prohibits using a type assertion that does not change the type of an expression.
        "@typescript-eslint/no-unnecessary-type-assertion": "error",

        // Disallows assigning any to a variable, and assigning any[] to an array destructuring. Assigning an
        // any typed value to a variable can be hard to pick up on, particularly if it leaks in from an external
        // library.
        "@typescript-eslint/no-unsafe-assignment": "error",

        // Disallows calling any variable that is typed as any. The arguments to, and return value of calling an
        // any typed variable are not checked at all by TypeScript.
        "@typescript-eslint/no-unsafe-call": "error",

        // Disallows member access on any variable that is typed as any. The arguments to, and return value of
        // calling an any typed variable are not checked at all by TypeScript.
        "@typescript-eslint/no-unsafe-member-access": "error",

        // Disallow unused expressions.
        "@typescript-eslint/no-unused-expressions": "error",

        // Prefer a `for-of` loop over a standard `for` loop if the index is only used to access the array being
        // iterated.
        "@typescript-eslint/prefer-for-of": "error",

        // Use function types instead of interfaces with call signatures.
        "@typescript-eslint/prefer-function-type": "error",

        // Enforce includes method over indexOf method.
        "@typescript-eslint/prefer-includes": "error",

        // Require the use of the namespace keyword instead of the module keyword to declare custom TypeScript modules.
        "@typescript-eslint/prefer-namespace-keyword": "error",

        // Enforce the usage of the nullish coalescing operator instead of logical chaining.
        "@typescript-eslint/prefer-nullish-coalescing": "error",

        // Prefer using concise optional chain expressions instead of chained logical ands.
        "@typescript-eslint/prefer-optional-chain": "error",

        // Requires that private members are marked as readonly if they're never modified outside of the constructor.
        "@typescript-eslint/prefer-readonly": "error",

        // Enforce that `this` is used when only `this` type is returned. Method chaining is a common pattern in OOP
        // languages and TypeScript provides a special polymorphic `this` type. If any type other than `this` is
        // specified as the return type of these chaining methods, TypeScript will fail to cast it when invoking in
        // subclass.
        "@typescript-eslint/prefer-return-this-type": "error",

        // Enforce the use of String#startsWith and String#endsWith instead of other equivalent methods of checking
        // substrings.
        "@typescript-eslint/prefer-string-starts-ends-with": "error",

        // Recommends using @ts-expect-error over @ts-ignore.
        "@typescript-eslint/prefer-ts-expect-error": "error",

        // Requires any function or method that returns a Promise to be marked async.
        "@typescript-eslint/promise-function-async": "error",

        // Enforce the consistent use of double quotes.
        "@typescript-eslint/quotes": [
            "error",
            "double",
            {
                "allowTemplateLiterals": true,
                "avoidEscape": true
            }
        ],

        // Disallow `async` functions which have no await expression.
        "@typescript-eslint/require-await": "error",

        // When adding two variables, operands must both be of type number or of type string.
        "@typescript-eslint/restrict-plus-operands": "error",

        // Enforce template literal expressions to be of string type.
        "@typescript-eslint/restrict-template-expressions": "error",

        "@typescript-eslint/semi": [
            "error",
            "always"
        ],

        // Enforces that members of a type union/intersection are sorted alphabetically.
        "@typescript-eslint/sort-type-union-intersection-members": "warn",

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

        // Exhaustiveness checking in switch with union type.
        "@typescript-eslint/switch-exhaustiveness-check": "error",

        // Enforces unbound methods are called with their expected scope. Warns when a method is used outside of a
        // method call. Class functions don't preserve the class scope when passed as standalone variables.
        "@typescript-eslint/unbound-method": [
            "error",
            {
                "ignoreStatic": true
            }
        ],

        // Warns for any two overloads that could be unified into one by using a union or an optional/rest parameter.
        "@typescript-eslint/unified-signatures": "error",

        "arrow-parens": [
            "error",
            "always"
        ],

        // Superseded by @typescript-eslint/brace-style.
        "brace-style": "off",

        // Superseded by @typescript-eslint/comma-dangle.
        "comma-dangle": "off",

        // Superseded by @typescript-eslint/comma-spacing.
        "comma-spacing": "off",

        // Constructors must call super().
        "constructor-super": "error",

        // Requires following curly brace conventions.
        "curly": "error",

        // Requires a default case in switch statements.
        "default-case": "error",

        // Superseded by @typescript-eslint/dot-notation.
        "dot-notation": "off",

        // Disabled becuase it doesn't work well for all our files.
        "editorconfig/indent": "off",

        // Requires the use of === and !==.
        "eqeqeq": [
            "error",
            "smart"
        ],

        // Requires that eslint disable comments have a start and an end, rather than being open-ended. Encourages
        // minimal disabling of eslint rules, while still permitting whole-file exclusions.
        "eslint-comments/disable-enable-pair": [
            "error", {
                "allowWholeFile": true
            }
        ],

        // Superseded by @typescript-eslint/func-call-spacing.
        "func-call-spacing": "off",

        // Enforces that a return statement is present in property getters.
        "getter-return": "error",

        // Requires for in loops to include an if statement.
        "guard-for-in": "error",

        // Disabled because TypeScript already checks this. https://typescript-eslint.io/docs/linting/troubleshooting/#eslint-plugin-import
        "import/default": "off",

        // Disabled because TypeScript already checks this. https://typescript-eslint.io/docs/linting/troubleshooting/#eslint-plugin-import
        "import/namespace": "off",

        // Prohibit default exports.
        "import/no-default-export": "error",

        // Reports use of a deprecated name.
        "import/no-deprecated": "warn",

        // Forbid the import of external modules that are not declared in package.json.
        "import/no-extraneous-dependencies": [
            "error",
            {
                "devDependencies": ["**/*.spec.ts", "src/test/**"]
            }
        ],

        // Prevent importing the submodules of other modules.
        "import/no-internal-modules": "error",

        // Disabled because TypeScript already checks this. https://typescript-eslint.io/docs/linting/troubleshooting/#eslint-plugin-import
        "import/no-named-as-default-member": "off",

        // Forbid nodejs modules;
        "import/no-nodejs-modules": "warn",

        // Forbid unassigned imports.
        "import/no-unassigned-import": "error",

        // Ensures an imported module can be resolved to a module on the local filesystem.
        "import/no-unresolved": [
            "error",
            {
                "caseSensitive": true
            }
        ],

        // Requires that modules have a export.
        "import/no-unused-modules": [
            "warn",
            {
                "missingExports": true
            }
        ],

        // Enforce a convention in the order of require() / import statements.
        "import/order": "error",

        // Enforces a maximum line length.
        "max-len": [
            "error",
            {
                "ignoreRegExpLiterals": false,
                "ignoreStrings": false,
                "code": 120
            }
        ],

        // Disallows bitwise operators. The use of bitwise operators in JavaScript is very rare and often & or | is
        // simply a mistyped && or ||, which will lead to unexpected behavior.
        "no-bitwise": "error",

        // Disallows use of caller/callee. The use of arguments.caller and arguments.callee make several code
        // optimizations impossible. They have been deprecated in future versions of JavaScript and their use is
        // forbidden in ES5 while in strict mode.
        "no-caller": "error",

        // Superseded by @typescript-eslint/no-empty-function.
        "no-empty-function": "off",

        // Superseded by @typescript-eslint/no-duplicate-imports.
        "no-duplicate-imports": "off",

        // Disallows eval(). JavaScript's eval() function is potentially dangerous and is often misused. Using eval() on
        // untrusted code can open a program up to several different injection attacks. The use of eval() in most
        // contexts can be substituted for a better, alternative approach to a problem.
        "no-eval": "error",

        // Disallows case statement fallthroughs.
        "no-fallthrough": "error",

        // Disallows use of this in contexts where the value of this is undefined. Under the strict mode, this keywords
        // outside of classes or class-like objects might be undefined and raise a TypeError.
        "no-invalid-this": "error",

        // Superseded by @typescript-eslint/no-magic-numbers.
        "no-magic-numbers": "off",

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

        // Disallows new operators with the Function object.
        "no-new-func": "error",

        // Disallows new operators with the String, Number, and Boolean objects.
        "no-new-wrappers": "error",

        // Disallows octal escape sequences in string literals.
        "no-octal-escape": "error",

        // Disallows reassignment of function parameters.
        "no-param-reassign": "error",

        // Superseded by @typescript-eslint/no-redeclare.
        "no-redeclare": "off",

        // Disallows unnecessary return await. Using return await inside an async function keeps the current function in
        // the call stack until the Promise that is being awaited has resolved, at the cost of an extra microtask before
        // resolving the outer Promise. return await can also be used in a try/catch statement to catch errors from
        // another function that returns a Promise.
        "no-return-await": "error",

        // Disallows use of the comma operator.
        "no-sequences": "error",

        // Superseded by @typescript-eslint/no-shadow.
        "no-shadow": "off",

        // Disallows template literal placeholder syntax in regular strings.
        "no-template-curly-in-string": "error",

        // Superseded by @typescript-eslint/no-throw-literal.
        "no-throw-literal": "off",

        // Disallows initializing variables to undefined.
        "no-undef-init": "error",

        // Superseded by @typescript-eslint/no-unused-expressions.
        "no-unused-expressions": "off",

        // Disallows use of the void operator.
        "no-void": "error",

        // Enforces the use of the shorthand syntax.
        "object-shorthand": "error",

        // Require variables to be declared either together or separately in functions.
        "one-var": [
            "error",
            "never"
        ],

        // Disallows empty lines at the beginning and ending of block statements, function bodies, class static blocks,
        // classes, and switch statements.
        "padded-blocks": [
            "error",
            "never"
        ],

        // Require using arrow functions for callbacks.
        "prefer-arrow-callback": "error",

        // Disallow using Object.assign with an object literal as the first argument and prefer the use of object spread
        // instead.
        "prefer-object-spread": "error",

        // Requires using Error objects as Promise rejection reasons.
        "prefer-promise-reject-errors": "error",

        // Require template literals instead of string concatenation.
        "prefer-template": "error",

        // Catches a common coding mistake where "resolve" and "reject" are confused.
        "promise/param-names": "warn",

        // Require quotes around object literal property names.
        "quote-props": [
            "error",
            "consistent-as-needed"
        ],

        // Superseded by @typescript-eslint/quotes.
        "quotes": "off",

        // Enforces the consistent use of the radix argument when using parseInt().
        "radix": "error",

        // Disallow assignments that can lead to race conditions due to usage of `await` or `yield`.
        "require-atomic-updates": "error",

        // Superseded by @typescript-eslint/require-await.
        "require-await": "off",

        // Superseded by @typescript-eslint/semi.
        "semi": "off",

        // Enforce consistent spacing before blocks.
        "space-before-blocks": "error",

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

        // Move function definitions to the highest possible scope.
        "unicorn/consistent-function-scoping": "error",

        // Disabled because it's too nit-picky.
        "unicorn/empty-brace-spaces": "off",

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

        // Disabled because we don't care about using abbreviations.
        "unicorn/prevent-abbreviations": "off",
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
            }
        },
        {
            // Rules only for test files
            "files": ["*.spec.ts", "src/test/**"],
            "extends": [
                "plugin:jest/recommended",
                "plugin:mocha/recommended",
            ],
            "rules": {
                // Tests use hardcoded magic numbers regularly.
                "@typescript-eslint/no-magic-numbers": "off",

                // Superseded by jest/unbound-method.
                "@typescript-eslint/unbound-method": "off",

                // Disabled for test projects since they often don't have exports.
                "import/no-unused-modules": "off",

                "jest/expect-expect": [
                    "error",
                    {
                        "assertFunctionNames": [
                            "assert",
                            "assert.*",
                            "expect",
                            "strict",
                            "strict.*",
                            "test*",
                        ]
                    }
                ],

                // Jest-specific version of @typescript-eslint/unbound-method.
                "jest/unbound-method": "error",

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
