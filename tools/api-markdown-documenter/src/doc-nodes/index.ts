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

export { DocAlertType, IDocAlertParameters, DocAlert } from "./DocAlert";
export { IDocHeadingParameters, DocHeading } from "./DocHeading";
export { ListKind, IDocListParameters, DocList } from "./DocList";
export { CustomDocNodeKind, CustomDocNodes } from "./CustomDocNodeKind";

// #region Convenience re-exports of Doc builder types from api-documenter

export { IDocEmphasisSpanParameters, DocEmphasisSpan } from "@microsoft/api-documenter/lib/nodes/DocEmphasisSpan";
export { IDocNoteBoxParameters, DocNoteBox } from "@microsoft/api-documenter/lib/nodes/DocNoteBox";
export { IDocTableParameters, DocTable } from "@microsoft/api-documenter/lib/nodes/DocTable";
export { IDocTableCellParameters, DocTableCell } from "@microsoft/api-documenter/lib/nodes/DocTableCell";
export { IDocTableRowParameters, DocTableRow } from "@microsoft/api-documenter/lib/nodes/DocTableRow";

// #endregion
