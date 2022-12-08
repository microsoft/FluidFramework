/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

 module.exports = {
  extends: [
      require.resolve("@fluidframework/eslint-config-fluid"),
      "prettier"
  ],
  "rules": {
    "@typescript-eslint/consistent-type-assertions": "off",
    "@typescript-eslint/no-dynamic-delete": "off",
    "@typescript-eslint/no-extraneous-class": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-shadow": "off",
    "@typescript-eslint/no-unnecessary-type-assertion": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/prefer-optional-chain": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    "@typescript-eslint/strict-boolean-expressions": "off",
    "import/no-internal-modules": "off",
    "no-bitwise": "off",
    "no-param-reassign": "off",
    "tsdoc/syntax": "off",
    "unicorn/filename-case": "off",
  }
}
