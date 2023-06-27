/**
 * Surrounds the given string with double quotes, and escapes double quotes in the original string with the specified
 * escapeChar.
 * Also escapes characters from the specified additionalCharsToEscape array with the same escapeChar.
 *
 * @param {string} str - The original string.
 * @param {string} escapeChar - The character to use for escaping. Defaults to backslash.
 * @param {string[]} additionalCharsToEscape - An array with the list of characters to escape besides double quotes.
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
export function quoteStringAndEscape(str, escapeChar = "\\", additionalCharsToEscape = []) {
	let escapedStr = str;
	const charsToEscape = additionalCharsToEscape.includes('"') ? additionalCharsToEscape : [...additionalCharsToEscape, '"'];
	for (const c of charsToEscape) {
		escapedStr = escapedStr.replace(new RegExp(c, "g"), `${escapeChar}${c}`);
	}
	return `"${escapedStr}"`;
}
