import { IDocNodeParameters, DocNode } from '@microsoft/tsdoc';
import { DocTableCell } from './DocTableCell';
/**
 * Constructor parameters for {@link DocTableRow}.
 */
export interface IDocTableRowParameters extends IDocNodeParameters {
}
/**
 * Represents table row, similar to an HTML `<tr>` element.
 */
export declare class DocTableRow extends DocNode {
    private readonly _cells;
    constructor(parameters: IDocTableRowParameters, cells?: ReadonlyArray<DocTableCell>);
    /** @override */
    readonly kind: string;
    readonly cells: ReadonlyArray<DocTableCell>;
    addCell(cell: DocTableCell): void;
    createAndAddCell(): DocTableCell;
    addPlainTextCell(cellContent: string): DocTableCell;
    /** @override */
    protected onGetChildNodes(): ReadonlyArray<DocNode | undefined>;
}
//# sourceMappingURL=DocTableRow.d.ts.map