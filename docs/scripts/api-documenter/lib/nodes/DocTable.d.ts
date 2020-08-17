import { IDocNodeParameters, DocNode } from '@microsoft/tsdoc';
import { DocTableRow } from './DocTableRow';
import { DocTableCell } from './DocTableCell';
/**
 * Constructor parameters for {@link DocTable}.
 */
export interface IDocTableParameters extends IDocNodeParameters {
    headerCells?: ReadonlyArray<DocTableCell>;
    headerTitles?: string[];
    cssClass?: string;
}
/**
 * Represents table, similar to an HTML `<table>` element.
 */
export declare class DocTable extends DocNode {
    readonly header: DocTableRow;
    cssClass?: string;
    private _rows;
    constructor(parameters: IDocTableParameters, rows?: ReadonlyArray<DocTableRow>);
    /** @override */
    readonly kind: string;
    readonly rows: ReadonlyArray<DocTableRow>;
    addRow(row: DocTableRow): void;
    createAndAddRow(): DocTableRow;
    /** @override */
    protected onGetChildNodes(): ReadonlyArray<DocNode | undefined>;
}
//# sourceMappingURL=DocTable.d.ts.map