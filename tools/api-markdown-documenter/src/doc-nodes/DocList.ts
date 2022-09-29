/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocNode, DocNodeContainer, IDocNodeContainerParameters } from "@microsoft/tsdoc";

import { CustomDocNodeKind } from "./CustomDocNodeKind";

/**
 * Kind of list: `ordered` or `unordered`.
 */
export enum ListKind {
    Ordered = "ordered",
    Unordered = "unordered",
}

/**
 * Constructor parameters for {@link DocHeading}.
 */
export interface IDocListParameters extends IDocNodeContainerParameters {
    /**
     * Kind of list.
     *
     * @defaultValue {@link ListKind.Unordered}
     */
    listKind?: ListKind;
}

/**
 * Represents a list similar to an HTML `<ul>` element.
 */
export class DocList extends DocNodeContainer {
    /**
     * {@inheritDoc Heading.title}
     */
    public readonly listKind: ListKind;

    constructor(parameters: IDocListParameters, childNodes?: readonly DocNode[]) {
        super(parameters, childNodes);

        this.listKind = parameters.listKind ?? ListKind.Unordered;
    }

    /**
     * @override
     */
    public get kind(): string {
        return CustomDocNodeKind.List;
    }
}
