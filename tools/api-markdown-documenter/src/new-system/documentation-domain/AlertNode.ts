import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { compareNodeArrays } from "./Utilities";

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
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentationNodeType.Alert;

    public readonly alertKind: AlertKind;
    public readonly title?: string;

    public constructor(children: DocumentationNode[], alertKind: AlertKind, title?: string) {
        super(children);

        this.alertKind = alertKind;
        this.title = title;
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherAlert = other as AlertNode;

        if (this.alertKind !== otherAlert.alertKind) {
            return false;
        }

        if (this.title !== otherAlert.title) {
            return false;
        }

        return compareNodeArrays(this.children, otherAlert.children);
    }
}
