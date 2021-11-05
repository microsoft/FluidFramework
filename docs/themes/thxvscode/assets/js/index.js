/**
 * Top level scripts
 * Immeditaely executed
 */

import 'bootstrap'

/**
 * Functionalities implemented in jQuery
 */

import { loadSkipToContentButton } from './jquery/accessibility'
import { loadDocsJavascript } from './jquery/docs'
import { loadNavSearch } from './jquery/search'
// import { loadUpdatesBanner } from './jquery/updates'

// Function to load after DOM Ready
$(function () {
  loadSkipToContentButton()
  loadDocsJavascript()
  loadNavSearch()
  // loadUpdatesBanner()
})
