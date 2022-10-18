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

export { DocAlert, DocAlertType, IDocAlertParameters } from "./DocAlert";
export { DocHeading, IDocHeadingParameters } from "./DocHeading";
export { DocList, IDocListParameters, ListKind } from "./DocList";
export { CustomDocNodeKind, CustomDocNodes } from "./CustomDocNodeKind";

// #region Convenience re-exports of Doc builder types from api-documenter

export {
    DocEmphasisSpan,
    IDocEmphasisSpanParameters,
} from "@microsoft/api-documenter/lib/nodes/DocEmphasisSpan";
export { DocNoteBox, IDocNoteBoxParameters } from "@microsoft/api-documenter/lib/nodes/DocNoteBox";
export { DocTable, IDocTableParameters } from "@microsoft/api-documenter/lib/nodes/DocTable";
export {
    DocTableCell,
    IDocTableCellParameters,
} from "@microsoft/api-documenter/lib/nodes/DocTableCell";
export {
    DocTableRow,
    IDocTableRowParameters,
} from "@microsoft/api-documenter/lib/nodes/DocTableRow";

// #endregion
