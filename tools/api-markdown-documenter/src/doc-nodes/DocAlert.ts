/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocNode, IDocNodeParameters } from "@microsoft/tsdoc";

import { CustomDocNodeKind } from "./CustomDocNodeKind";

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

/**
 * Constructor parameters for {@link DocAlert}.
 */
export interface IDocAlertParameters extends IDocNodeParameters {
    /**
     * Optional type of the alert.
     */
    type?: DocAlertType;

    /**
     * Optional title for the alert.
     */
    title?: string;
}

/**
 * Represents a alert. Like a `NoteBox`, but with additional contextual information for styling.
 */
export class DocAlert extends DocNode {
    /**
     * {@inheritDoc IDocAlertParameters."type"}
     */
    public readonly type: DocAlertType | undefined;
    /**
     * {@inheritDoc IDocAlertParameters.title}
     */
    public readonly title: string | undefined;

    /**
     * Content to be rendered in the callout.
     */
    public readonly content: DocNode;

    constructor(parameters: IDocAlertParameters, content: DocNode) {
        super(parameters);

        this.type = parameters.type;
        this.title = parameters.title;

        this.content = content;
    }

    /**
     * @override
     */
    public get kind(): string {
        return CustomDocNodeKind.Alert;
    }
}
