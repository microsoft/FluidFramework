/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// #region Invalid cases

// TSDoc comment with a relative path link should be flagged.
/**
 * TSDoc comment with link using a relative file path: {@link	./relative/path|text}.
 * And another: {@link ../relative-path}.
 */
const tsdocCommentWithRelativePathLinks = "invalid";

/**
 * TSDoc comment with link using an absolute file path: {@link /absolute/path|text}.
 * And another: {@link  /absolute-path}.
 */
const tsdocCommentWithAbsolutePathLinks = "invalid";

// #endregion

// #region Valid cases

// TSDoc comment with no links should not be flagged.
/**
 * TSDoc comment with no links.
 */
const tsdocCommentWithNoLinks = "valid";

// TSDoc comment with a URL link should be allowed.
/**
 * TSDoc comment with link with URL target: {@link https://bing.com|bing.com}.
 * And another: {@link https://fluidframework.com}.
 */
const tsdocCommentWithValidDocsLink = "valid";

// Block comment should not be flagged.
/*
 * Block comment with link using a file path: {@link ./relative/path|text}.
 */
const blockCommentWithRelativePathLink = "valid";

// Line comment should not be flagged.
// Line comment with link using a file path: {@link /absolute-path}.
const lineCommentWithFilePathLink = "valid";

// #endregion
