import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";

/**
 * Kind of alert.
 */
export enum DocAlertType {
    Tip = "Tip",
    Note = "Note",
    Important = "Important",
    Warning = "Warning",
    Danger = "Danger",
}

export class AlertNode extends ParentNodeBase {
    public readonly type = DocumentNodeType.Alert;
    public readonly alertKind: DocAlertType;

    public constructor(children: DocumentationNode[], alertKind: DocAlertType) {
        super(children);
        this.alertKind = alertKind;
    }
}
