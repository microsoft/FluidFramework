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
    public readonly title?: string;

    public constructor(children: DocumentationNode[], alertKind: DocAlertType, title?: string) {
        super(children);

        this.alertKind = alertKind;
        this.title = title;
    }
}
