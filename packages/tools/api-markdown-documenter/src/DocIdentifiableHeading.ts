// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { DocHeading, IDocHeadingParameters } from "@microsoft/api-documenter/lib/nodes/DocHeading";

/**
 * Constructor parameters for {@link DocHeading}.
 */
export interface IDocIdentifiableHeadingParameters extends IDocHeadingParameters {
    id?: string;
}

/**
 * Represents a section header similar to an HTML `<h1>` or `<h2>` element.
 */
export class DocIdentifiableHeading extends DocHeading {
    public readonly id: string;

    /**
     * Don't call this directly.  Instead use {@link TSDocParser}
     * @internal
     */
    constructor(parameters: IDocIdentifiableHeadingParameters) {
        super(parameters);
        this.id = parameters.id !== undefined ? parameters.id : "";
    }
}
