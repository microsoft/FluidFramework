import { NewlineKind } from "@rushstack/node-core-library";

import { PolicyOptions, defaultPolicyOptions } from "./Policies";

// TODOs:
// - Define "document" in terms of stream output, since we aren't necessarily writing files.

/**
 * Configuration options for the Markdown documenter.
 */
export interface MarkdownDocumenterConfig extends PolicyOptions {
    /**
     * Specifies what type of newlines API Documenter should use when writing output files.
     * By default, the output files will be written with Windows-style newlines.
     */
    readonly newlineKind: NewlineKind;

    /**
     * Default root uri used when generating content links.
     */
    readonly uriRoot: string;
}

export function markdownDocumenterConfigurationWithDefaults(
    partialConfig: MarkdownDocumenterConfig,
): Required<MarkdownDocumenterConfig> {
    return {
        ...defaultPolicyOptions,
        ...partialConfig,
    };
}
