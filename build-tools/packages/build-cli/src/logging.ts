import { Logger } from "@fluidframework/build-tools";

export interface CommandLogger extends Logger {
    logHr(): void;
    logIndent(input: string, indent: number): void;

    /** Indent text by prepending spaces. */
    indent(indent: number): string;
}
