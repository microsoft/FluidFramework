/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

if (
  typeof window !== "undefined" &&
  window.trustedTypes &&
  typeof window.trustedTypes.createPolicy === "function"
) {
  if (
    typeof window.trustedTypes.getPolicy !== "function" ||
    !window.trustedTypes.getPolicy("default")
  ) {
    window.trustedTypes.createPolicy("default", {
      createHTML: (input) => input,
      createScript: (input) => input,
      createScriptURL: (input) => input,
    });
  }
}
