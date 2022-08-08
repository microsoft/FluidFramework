import { DocHeading, IDocHeadingParameters } from "@microsoft/api-documenter/lib/nodes/DocHeading";

// TODO: file issue on Rushstack github to support IDs in headings.
// This type should be removed if such support is added natively.

/**
 * Constructor parameters for {@link DocIdentifiableHeading}.
 */
export interface IDocIdentifiableHeadingParameters extends IDocHeadingParameters {
    /**
     * Unique heading identifier. Can be used to uniquely identify a heading on a page for links, etc.
     * If not specified, no ID will associated with the heading.
     */
    id?: string;
}

/**
 * Represents a section header similar to an HTML `<h1>` or `<h2>` element.
 */
export class DocIdentifiableHeading extends DocHeading {
    /**
     * {@inheritDoc IDocIdentifiableHeadingParameters.id}
     */
    public readonly id?: string;

    /**
     * Don't call this directly. Instead use `TSDocParser`.
     * @internal
     */
    constructor(parameters: IDocIdentifiableHeadingParameters) {
        super(parameters);
        this.id = parameters.id;
    }
}
