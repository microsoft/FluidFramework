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

export function addNewlineOrBlank(lastCharPrinted: string) {
    if (lastCharPrinted !== "\n" && lastCharPrinted !== "") {
        return standardEOL;
    }

    return ";";
}
