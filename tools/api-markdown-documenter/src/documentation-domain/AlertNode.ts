/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNode, DocumentationParentNodeBase } from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { createNodesFromPlainText } from "./Utilities";

// TODO: This type really doesn't belong here. It isn't a core Documentation concept.
// The FluidFramework website's build should define this as a custom transformation override for `beta` and `deprecation` notices instead.

/**
 * Kind of alert.
 *
 * @public
 */
export enum AlertKind {
	/**
	 * A suggestion or useful tip for the reader.
	 */
	Tip = "Tip",

	/**
	 * A general note for the user.
	 */
	Note = "Note",

	/**
	 * An important note for the user.
	 */
	Important = "Important",

	/**
	 * A precautionary warning for the user.
	 */
	Warning = "Warning",

	/**
	 * A serious precautionary warning for the user.
	 */
	Danger = "Danger",
}

/**
 * An highlighted notice about nearby content for the user.
 *
 * @remarks See {@link AlertKind} for a list of supported alert kinds.
 *
 * @example Markdown
 *
 * ```md
 * > [TIP]: Unit tests are super useful!
 * >
 * > More details about unit tests...
 * ```
 *
 * @example HTML
 *
 * ```html
 * <blockquote>
 * 	<b>[TIP]: Unit tests are super useful!</b>
 * 	<br>
 * 	<br>
 * 	More details about unit tests...
 * </blockquote>
 * ```
 *
 * @public
 */
export class AlertNode extends DocumentationParentNodeBase {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Alert;

	/**
	 * See {@link AlertKind}.
	 */
	public readonly alertKind: AlertKind;

	/**
	 * Optional alert title text, to be rendered alongside the {@link AlertNode.alertKind} label.
	 */
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
}
