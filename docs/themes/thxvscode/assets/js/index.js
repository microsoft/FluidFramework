/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// JQuery and bootstrap 3.4 JS must be loaded on the page outside of this script.

import { loadSkipToContentButton } from './jquery/accessibility'
import { loadDocsJavascript } from './jquery/docs'
// import { loadNavSearch } from './jquery/search'
// import { loadUpdatesBanner } from './jquery/updates'

// Function to load after DOM Ready
window.onload = function () {
    loadSkipToContentButton()
    loadDocsJavascript()
    // loadNavSearch()
    // loadUpdatesBanner()
}
