/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/prefer-for-of */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function dumpCSSText(element) {
    let s = "";
    const o = getComputedStyle(element);

    for (let i = 0; i < o.length; i++) {
        s += `${o[i]  }:${  o.getPropertyValue(o[i])  };`;
    }
    return s;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getAllCSS() {
    let css = ""; // Variable to hold all the css that we extract
    const styletags = document.getElementsByTagName("style");

    // Loop over all the style tags
    for (let i = 0; i < styletags.length; i++) {
        css += styletags[i].innerHTML; // Extract the css in the current style tag
    }

    // Loop over all the external stylesheets
    for (let i = 0; i < document.styleSheets.length; i++) {
        const currentsheet = document.styleSheets[i];
        // Loop over all the styling rules in this external stylesheet
        for (let e = 0; e < currentsheet.cssRules.length; e++) {
            css += currentsheet.cssRules[e].cssText; //Extract all the styling rules
        }
    }

    return css;
}
