import * as os from "os";

export const standardEOL = `${os.EOL}`;
export const markdownEOL = `  ${os.EOL}`; // TODO: Markdown spec says to complete a paragraph with two spaces and a newline. Not sure how useful this is, though.

/**
 * Converts text into an escaped, html-nesting-friendly form
 *
 * @param text Text to escape
 * @returns Escaped text
 */
export function getEscapedText(text: string): string {
    const textWithBackslashes = text
        .replace(/\\/g, "\\\\") // first replace the escape character
        .replace(/[*#[\]_|`~]/g, (x) => "\\" + x) // then escape any special characters
        .replace(/---/g, "\\-\\-\\-") // hyphens only if it's 3 or more
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return textWithBackslashes;
}

/**
 * Escapes text in a way that makes it usable inside of table elements
 *
 * @param text Text to escape
 * @returns Escaped text
 */
export function getTableEscapedText(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\|/g, "&#124;");
}

/**
 * Helper function to encapsulate a common pattern in the node renderers, where we will add a newline if we don't have enough, but if there are already enough,
 * we'll no-op with an empty string. I extracted this into a named function since this operation appeared so frequently I thought it would be a little better than
 * having this same ternary pop up again and again.
 *
 * TODO: Evaluate if this function is worth keeping or if we should just dump the ternary directly into code
 *
 * @param shouldAddNewline True if we should add a newline, false if not
 * @returns A newline or an empty string
 */
export function addNewlineOrBlank(shouldAddNewline: boolean): string {
    return shouldAddNewline ? standardEOL : "";
}

/**
 * Counts the number of newlines at the end of the given string
 *
 * @param text Text to count newlines at the end of
 * @remarks Does not ignore whitespace (eg, \r\n\t\r\n would return 1, not 2)
 * @returns Number of newlines at the end of the string
 */
export function countTrailingNewlines(text: string): number {
    const matches = text.match(/(\r?\n)*$/); // TODO: Do we need to account for whitespace chars?
    const trailingNewlines = matches ? matches[0] : null;
    if (!trailingNewlines) {
        return 0;
    }
    let count = 0;
    for (let i = 0; i < trailingNewlines.length; i++) {
        if (trailingNewlines[i] === "\n") count++;
    }
    return count;
}
