/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid/rushstack"
    ],
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
    },
    "rules": {
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-null/no-null": "off",
        // RATIONALE:         Code is more readable when the type of every variable is immediately obvious.
          //                    Even if the compiler may be able to infer a type, this inference will be unavailable
          //                    to a person who is reviewing a GitHub diff.  This rule makes writing code harder,
          //                    but writing code is a much less important activity than reading it.
          //
          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/explicit-function-return-type': [
            'error',
            {
              allowExpressions: true,
              allowTypedFunctionExpressions: true,
              allowHigherOrderFunctions: false
            }
          ],
    }
}
