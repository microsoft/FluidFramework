/**
 * Escapes all the characters in the given string that match the list of characters to escape, by prepeding the escapeChar
 * to them, and returns the resulting string wrapped in double quotes.
 *
 * @param {string} str - The original string.
 * @param {string[]} charsToEscape - An array with the list of characters to escape.
 * @param {string} escapeChar - The character to use for escaping. Defaults to backslash.
 *
 * @remarks
 * For the logic we use in Windows environments (setx to set the user's environment variables), we only need to escape
 * double quotes.
 * For writing to ~/.bashrc and ~/.zshrc, we need to escape double quotes and backticks.
 * For fish we currently don't escape anything; it could be that we do need to escape backticks (or both?).
 *
 * @returns
 * The given string with the specified characters escaped appropriately.
 */
export function escapeString(str, charsToEscape, escapeChar = "\\") {
	let escapedStr = str;
	for (const c of charsToEscape) {
		escapedStr = escapedStr.replace(new RegExp(c, "g"), `${escapeChar}${c}`);
	}
	return `"${escapedStr}"`;
}
