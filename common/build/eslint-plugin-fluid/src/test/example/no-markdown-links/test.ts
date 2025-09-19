/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * TSDoc comment with link using TSDoc syntax: {@link https://bing.com|bing.com}.
 */
const tsdocCommentWithValidDocsLink = "valid";

/**
 * TSDoc comment with link using Markdown syntax: [bing](https://bing.com).
 */
const tsdocCommentWithMarkdownLink = "invalid";

/*
 * Block comment with link using Markdown syntax: [bing](https://bing.com).
 */
const blockCommentWithMarkdownLink = "valid";

// Line comment with link using Markdown syntax: [bing](https://bing.com).
const lineCommentWithMarkdownLink = "valid";
