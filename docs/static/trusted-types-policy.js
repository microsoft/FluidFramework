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
	  console.log("Creating default Trusted Types policy");
	  const createHTML = (input) => {
		try {
		  if (typeof DOMPurify !== "undefined") {
			return DOMPurify.sanitize(input, { RETURN_TRUSTED_TYPE: false });
		  } else {
			console.warn("DOMPurify is not available. Returning unsanitized HTML.");
			return input;
		  }
		} catch (e) {
		  console.error("DOMPurify sanitization error:", e);
		  return "";
		}
	  };

	  window.trustedTypes.createPolicy("default", {
		createHTML,
		createScript: (input) => input,
		createScriptURL: (input) => input,
	  });
	}
  }
