/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Defines a position and side relative to a character in a sequence.
 *
 * For this purpose, sequences look like:
 *
 * `{start} - {character 0} - {character 1} - ... - {character N} - {end}`
 *
 * Each `{value}` in the diagram is a character within a sequence.
 * Each `-` in the above diagram is a position where text could be inserted.
 * Each position between a `{value}` and a `-` is a `SequencePlace`.
 *
 * The special endpoints `{start}` and `{end}` refer to positions outside the
 * contents of the string.
 *
 * This gives us 2N + 2 possible positions to refer to within a string, where N
 * is the number of characters.
 *
 * If the position is specified with a bare number, the side defaults to
 * `Side.Before`.
 *
 * If a SequencePlace is the endpoint of a range (e.g. start/end of an interval or search range),
 * the Side value means it is exclusive if it is nearer to the other position and inclusive if it is farther.
 * E.g. the start of a range with Side.After is exclusive of the character at the position.
 * @legacy
 * @alpha
 */
export type SequencePlace = number | "start" | "end" | InteriorSequencePlace;

/**
 * A sequence place that does not refer to the special endpoint segments.
 *
 * See {@link SequencePlace} for additional context.
 * @legacy
 * @alpha
 */
export interface InteriorSequencePlace {
	pos: number;
	side: Side;
}

/**
 * Defines a side relative to a character in a sequence.
 *
 * @remarks See {@link SequencePlace} for additional context on usage.
 * @legacy
 * @alpha
 */
export enum Side {
	Before = 0,
	After = 1,
}

/**
 * Returns the position and side of the start and end of a sequence.
 *
 * @legacy
 * @alpha
 */
export function endpointPosAndSide(
	start: SequencePlace | undefined,
	end: SequencePlace | undefined,
): {
	startSide: Side | undefined;
	endSide: Side | undefined;
	startPos: number | "start" | "end" | undefined;
	endPos: number | "start" | "end" | undefined;
} {
	const startIsPlainEndpoint =
		typeof start === "number" || start === "start" || start === "end";
	const endIsPlainEndpoint = typeof end === "number" || end === "start" || end === "end";

	const startSide = startIsPlainEndpoint ? Side.Before : start?.side;
	const endSide = endIsPlainEndpoint ? Side.Before : end?.side;

	const startPos = startIsPlainEndpoint ? start : start?.pos;
	const endPos = endIsPlainEndpoint ? end : end?.pos;

	return {
		startSide,
		endSide,
		startPos,
		endPos,
	};
}

/**
 * Returns the given place in InteriorSequencePlace form.
 */
export function normalizePlace(place: SequencePlace): InteriorSequencePlace {
	if (typeof place === "number") {
		return { pos: place, side: Side.Before };
	}
	if (place === "start") {
		return { pos: -1, side: Side.After };
	}
	if (place === "end") {
		return { pos: -1, side: Side.Before };
	}
	return place;
}
