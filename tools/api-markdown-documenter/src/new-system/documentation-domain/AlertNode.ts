import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { compareNodeArrays, createNodesFromPlainText } from "./Utilities";

// TODOs:
// - Document each alert kind

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

	/**
	 * See {@link AlertKind}.
	 */
	public readonly alertKind: AlertKind;
	public readonly title?: string;

	public constructor(children: DocumentationNode[], alertKind: AlertKind, title?: string) {
		super(children);

		this.alertKind = alertKind;
		this.title = title;
	}

	/**
	 * Generates an `AlertNode` from the provided string.
	 * @param text - The node contents.
	 * @param alertKind - See {@link AlertKind}.
	 */
	public static createFromPlainText(
		text: string,
		alertKind: AlertKind,
		title?: string,
	): AlertNode {
		return new AlertNode(createNodesFromPlainText(text), alertKind, title);
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
