/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { BlockContent, PhrasingContent } from "mdast";

import type { HeadingNode } from "./HeadingNode.js";
import type { SectionNode } from "./SectionNode.js";

/**
 * A node in the documentation domain.
 * @public
 */
export type DocumentationNode = SectionNode | HeadingNode | PhrasingContent | BlockContent;
