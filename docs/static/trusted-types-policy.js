/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

if (
  typeof window !== "undefined" &&
  window.trustedTypes &&
  typeof window.trustedTypes.createPolicy === "function"
) {
	console.log("Trusted Types policy already exists");
  if (
    typeof window.trustedTypes.getPolicy !== "function" ||
    !window.trustedTypes.getPolicy("default")
  ) {
	console.log("Creating default Trusted Types policy");
    window.trustedTypes.createPolicy("default", {
      createHTML: (input) => input,
      createScript: (input) => input,
      createScriptURL: (input) => input,
    });
  }
} else {
	console.log("Trusted Types not supported");
  // Fallback for browsers that do not support Trusted Types
  window.trustedTypes = {
	createPolicy: () => ({
	  createHTML: (input) => input,
	  createScript: (input) => input,
	  createScriptURL: (input) => input,
	}),
	getPolicy: () => null,
  };
}
