import { NewlineKind } from "@rushstack/node-core-library";

import { PolicyOptions, defaultPolicyOptions } from "./Policies";
import { RenderingPolicies, defaultRenderingPolicies } from "./rendering/RenderingPolicy";

// TODOs:
// - Define "document" in terms of stream output, since we aren't necessarily writing files.

/**
 * Configuration options for the Markdown documenter.
 */
export interface MarkdownDocumenterConfiguration extends PolicyOptions, RenderingPolicies {
    /**
     * Specifies what type of newlines API Documenter should use when writing output files.
     * By default, the output files will be written with Windows-style newlines.
     */
    readonly newlineKind?: NewlineKind;

    /**
     * Default root uri used when generating content links.
     */
    readonly uriRoot: string;

    /**
     * Whether or not verbose logging is enabled.
     *
     * @defaultValue false.
     */
    readonly verbose?: boolean;
}

export function markdownDocumenterConfigurationWithDefaults(
    partialConfig: MarkdownDocumenterConfiguration,
): Required<MarkdownDocumenterConfiguration> {
    return {
        newlineKind: NewlineKind.OsDefault,
        verbose: false,
        ...defaultPolicyOptions,
        ...defaultRenderingPolicies,
        ...partialConfig,
    };
}
