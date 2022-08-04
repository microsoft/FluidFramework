import { JsonSchema, NewlineKind } from "@rushstack/node-core-library";

/**
 * Configuration options for the Markdown documenter.
 */
export interface MarkdownDocumenterConfig {
    /**
     * Specifies what type of newlines API Documenter should use when writing output files.
     * By default, the output files will be written with Windows-style newlines.
     */
    readonly newlineKind: NewlineKind;

    /**
     * The JSON Schema for API Documenter config file (api-documenter.schema.json).
     */
    readonly jsonSchema: JsonSchema;
}
