/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { formatDistanceToNow, formatISO9075 } from "date-fns";

/**
 * Formats a date for display in the terminal.
 */
export function getDisplayDate(date?: Date): string {
	return date === undefined ? "--no date--" : formatISO9075(date, { representation: "date" });
}

/**
 * Formats a date relative to the current time for display in the terminal.
 */
export function getDisplayDateRelative(date?: Date): string {
	return date === undefined ? "" : `${formatDistanceToNow(date)} ago`;
}
