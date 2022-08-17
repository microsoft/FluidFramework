/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocNode, IDocNodeParameters } from "@microsoft/tsdoc";

import { Heading } from "../Heading";
import { CustomDocNodeKind } from "./CustomDocNodeKind";

// TODO: file issue on Rushstack github to support IDs in headings.
// This type should be removed if such support is added natively.

/**
 * Constructor parameters for {@link DocHeading}.
 */
export type IDocHeadingParameters = IDocNodeParameters & Heading;

/**
 * Represents a section header similar to an HTML `<h1>` or `<h2>` element.
 */
export class DocHeading extends DocNode {
    /**
     * {@inheritDoc Heading.title}
     */
    public readonly title: string;

    /**
     * {@inheritDoc Heading.level}
     */
    public readonly level?: number;

    /**
     * {@inheritDoc Heading.id}
     */
    public readonly id?: string;

    constructor(parameters: IDocHeadingParameters) {
        super(parameters);

        this.title = parameters.title;
        this.level = parameters.level;
        this.id = parameters.id;
    }

    /**
     * @override
     */
    public get kind(): string {
        return CustomDocNodeKind.Heading;
    }
}
