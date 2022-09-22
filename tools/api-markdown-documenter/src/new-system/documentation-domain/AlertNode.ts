import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";

/**
 * Kind of alert.
 */
export enum AlertKind {
    Tip = "Tip",
    Note = "Note",
    Important = "Important",
    Warning = "Warning",
    Danger = "Danger",
}

export class AlertNode extends ParentNodeBase {
    public readonly type = DocumentNodeType.Alert;

    public readonly alertKind: AlertKind;
    public readonly title?: string;

    public constructor(children: DocumentationNode[], alertKind: AlertKind, title?: string) {
        super(children);

        this.alertKind = alertKind;
        this.title = title;
    }
}
