/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// #region Invalid cases

// TSDoc comment with a Markdown link should be flagged.
/**
 * TSDoc comment with link using Markdown syntax: [bing](https://bing.com).
 */
const tsdocCommentWithMarkdownLink = "invalid";

// #endregion

// #region Valid cases

// TSDoc comment with no links should not be flagged.
/**
 * TSDoc comment with no links.
 */
const tsdocCommentWithNoLinks = "valid";

// TSDoc comment with a TSDoc link should be allowed.
/**
 * TSDoc comment with link using TSDoc syntax: {@link https://bing.com|bing.com}.
 */
const tsdocCommentWithValidDocsLink = "valid";

// Block comment should not be flagged.
/*
 * Block comment with link using Markdown syntax: [bing](https://bing.com).
 */
const blockCommentWithMarkdownLink = "valid";

// Line comment should not be flagged.
// Line comment with link using Markdown syntax: [bing](https://bing.com).
const lineCommentWithMarkdownLink = "valid";

// #endregion
