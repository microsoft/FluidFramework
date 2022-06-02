/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Sequence generic
// TODO: These types can be used to traverse mutable types.
// The exact behavior of traversing while the sequence is mutated needs to be clarified.
// In some cases it will result in an error (ex: CommandInvalid), and it others it will traverse the new sequence.
// Users will sometimes want to rely on this, so it should not be left as undefined.

export interface Sequence<Element, Place = Element | undefined> {
	[Symbol.iterator](): SequenceIterator<Element, Place>;
	iteratorFromEnd(): SequenceIterator<Element, Place>;
	readonly length: number;
	indexOf(element: Element): number;
	at(index: number): Element;
}

export interface SequenceIterator<Element, Place = Element | undefined> extends IterableIterator<Element> {
	prev(): IteratorResult<Element>;
	current(): Place;
}
