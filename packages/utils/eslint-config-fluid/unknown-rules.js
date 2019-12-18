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
                    "chai-prefer-contains-to-index-of": true,
                    "chai-vague-errors": true,
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
                    "function-name": [
                        true,
                        {
                            "method-regex": "^[a-z][\\w\\d]+$",
                            "private-method-regex": "^[a-z][\\w\\d]+$",
                            "protected-method-regex": "^[a-z][\\w\\d]+$",
                            "static-method-regex": "^[a-z][\\w\\d]+$",
                            "function-regex": "^[a-z][\\w\\d]+$"
                        }
                    ],
                    "import-name": true,
                    "import-spacing": true,
                    "informative-docs": true,
                    "insecure-random": true,
                    "jquery-deferred-must-complete": true,
                    "jsdoc-format": true,
                    "match-default-export-name": true,
                    "max-func-body-length": [
                        true,
                        100,
                        {
                            "ignore-parameters-to-function-regex": "^describe$"
                        }
                    ],
                    "mocha-avoid-only": true,
                    "mocha-no-side-effect-code": true,
                    "mocha-unneeded-done": true,
                    "no-cookies": true,
                    "no-delete-expression": true,
                    "no-disable-auto-sanitization": true,
                    "no-document-domain": true,
                    "no-document-write": true,
                    "no-dynamic-delete": true,
                    "no-exec-script": true,
                    "no-function-expression": true,
                    "no-http-string": [
                        true,
                        "http://.*"
                    ],
                    "no-inner-html": true,
                    "no-jquery-raw-elements": true,
                    "no-redundant-jsdoc": true,
                    "no-reference-import": true,
                    "no-single-line-block-comment": true,
                    "no-string-based-set-immediate": true,
                    "no-string-based-set-interval": true,
                    "no-string-based-set-timeout": true,
                    "no-suspicious-comment": true,
                    "no-typeof-undefined": true,
                    "no-unnecessary-callback-wrapper": true,
                    "no-unnecessary-field-initialization": true,
                    "no-unnecessary-override": true,
                    "no-unsafe-any": true,
                    "no-unsupported-browser-code": true,
                    "no-useless-files": true,
                    "no-with-statement": true,
                    "non-literal-fs-path": true,
                    "non-literal-require": true,
                    "number-literal-format": true,
                    "one-line": [
                        true,
                        "check-catch",
                        "check-else",
                        "check-finally",
                        "check-open-brace",
                        "check-whitespace"
                    ],
                    "possible-timing-attack": true,
                    "prefer-method-signature": true,
                    "prefer-while": true,
                    "promise-must-complete": true,
                    "react-a11y-anchors": true,
                    "react-a11y-aria-unsupported-elements": true,
                    "react-a11y-event-has-role": true,
                    "react-a11y-image-button-has-alt": true,
                    "react-a11y-img-has-alt": true,
                    "react-a11y-input-elements": true,
                    "react-a11y-lang": true,
                    "react-a11y-meta": true,
                    "react-a11y-no-onchange": true,
                    "react-a11y-props": true,
                    "react-a11y-proptypes": true,
                    "react-a11y-required": true,
                    "react-a11y-role": true,
                    "react-a11y-role-has-required-aria-props": true,
                    "react-a11y-role-supports-aria-props": true,
                    "react-a11y-tabindex-no-positive": true,
                    "react-a11y-titles": true,
                    "react-anchor-blank-noopener": true,
                    "react-iframe-missing-sandbox": true,
                    "react-no-dangerous-html": true,
                    "react-this-binding-issue": true,
                    "react-unused-props-and-state": true,
                    "static-this": true,
                    "switch-final-break": true,
                    "underscore-consistent-invocation": true,
                    "use-named-parameter": true,
                    "use-simple-attributes": true,
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
