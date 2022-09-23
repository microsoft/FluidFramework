import * as os from "os";

export const standardEOL = `${os.EOL}`;
export const markdownEOL = `  ${os.EOL}`;

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

export function getTableEscapedText(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\|/g, "&#124;");
}

export function addNewlineOrBlank(predicate: boolean): string {
    return predicate ? standardEOL : "";
}

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
