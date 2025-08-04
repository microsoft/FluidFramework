/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * {@link https://en.wikipedia.org/wiki/Abstract_syntax_tree | AST} domain describing documentation content.
 *
 * @remarks
 *
 * Implemented using {@link https://github.com/syntax-tree/unist | unist}.
 *
 * Can be rendered to the documentation language of your choice by using one of this library's render
 * transformations, or by writing your own!
 */

export { type DocumentationNode } from "./DocumentationNode.js";
export { HeadingNode } from "./HeadingNode.js";
export { type SectionContent, SectionNode } from "./SectionNode.js";
