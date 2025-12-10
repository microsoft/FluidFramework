/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CharCode } from "./charcode.js";

export function findToken(tokenList: string, token: string) {
	if (tokenList) {
		for (let start = 0; start >= 0; start = tokenList.indexOf(" ", start + 1)) {
			start = tokenList.indexOf(token, start);
			if (start < 0) {
				return undefined;
			}

			if (start === 0 || tokenList.charCodeAt(start - 1) === CharCode.space) {
				const end = start + token.length;
				if (
					end === tokenList.length ||
					(end < tokenList.length && tokenList.charCodeAt(end) === CharCode.space)
				) {
					return { start, end };
				}
			}
		}
	}

	return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace TokenList {
	export function set(tokenList: string | undefined, token: string | undefined) {
		return !tokenList // If the list is empty
			? token // ...the token becomes the new list.
			: !token || findToken(tokenList, token)
				? tokenList // If the token is empty or already in the list, return the list as-is
				: `${tokenList} ${token}`; // ...otherwise append the token to the list.
	}

	export function unset(tokenList: string, token: string) {
		const span = findToken(tokenList, token);
		if (!span) {
			return tokenList;
		}

		const { start, end } = span;

		return end < tokenList.length
			? `${tokenList.slice(0, start)}${tokenList.slice(end + 1)}`
			: tokenList.slice(0, start > 0 ? start - 1 : 0);
	}

	export function computeToggle(
		tokenList: string | undefined,
		toAdd: string[],
		toRemove: Set<string>,
	) {
		if (!tokenList) {
			// If the token list is empty, the 'toAdd' and 'toRemove'
			return; // lists remain unchanged.
		}

		for (let i = toAdd.length - 1; i >= 0; i--) {
			const token = toAdd[i];
			if (findToken(tokenList, token)) {
				toRemove.add(token);
				toAdd.splice(i, 1);
			}
		}
	}
}
