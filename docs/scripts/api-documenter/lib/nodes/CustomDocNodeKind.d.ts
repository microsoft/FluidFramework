import { TSDocConfiguration } from '@microsoft/tsdoc';
/**
 * Identifies custom subclasses of {@link DocNode}.
 */
export declare const enum CustomDocNodeKind {
    EmphasisSpan = "EmphasisSpan",
    Heading = "Heading",
    NoteBox = "NoteBox",
    Table = "Table",
    TableCell = "TableCell",
    TableRow = "TableRow"
}
export declare class CustomDocNodes {
    private static _configuration;
    static readonly configuration: TSDocConfiguration;
}
//# sourceMappingURL=CustomDocNodeKind.d.ts.map