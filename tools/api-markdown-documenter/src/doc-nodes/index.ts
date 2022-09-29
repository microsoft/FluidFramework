/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * `DocNode` types and utilities.
 *
 * @privateRemarks
 * TODO: Once this library has been updated to use AST transformations, all custom DocNode types and corresponding
 * logic should be removed. This is here as a stopgap solution to Markdown rendering based on the current API-Documenter
 * implementation, but is not the desired long-term solution of this library.
 */

export * from "./DocAlert";
export * from "./DocHeading";
export * from "./DocList";
export * from "./CustomDocNodeKind";

// #region Convenience re-exports of Doc builder types from api-documenter

export * from "@microsoft/api-documenter/lib/nodes/DocEmphasisSpan";
export * from "@microsoft/api-documenter/lib/nodes/DocNoteBox";
export * from "@microsoft/api-documenter/lib/nodes/DocTable";
export * from "@microsoft/api-documenter/lib/nodes/DocTableCell";
export * from "@microsoft/api-documenter/lib/nodes/DocTableRow";

// #endregion
