/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const secretPatterns = [
	[/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-jwt]"],
	[/\b(Bearer|Basic|SharedKey|SharedAccessSignature)\s+\S+/gi, "$1 [redacted]"],
	[/(AccountKey|SharedAccessKey)=([^;"'\s]+)/gi, "$1=[redacted]"],
];

/** Redact common credentials from displayable text. */
export function redact(value) {
	let text = typeof value === "string" ? value : String(value ?? "");
	for (const [pattern, replacement] of secretPatterns) text = text.replace(pattern, replacement);
	return text;
}
