// Sequence generic
// TODO: are sequences mutable? Are locations usable across mutations? What about Iterators?

export interface Sequence<Element, Place = Element | undefined> {
	[Symbol.iterator](): SequenceIterator<Element, Place>;
	iteratorFromEnd(): SequenceIterator<Element, Place>;
	areInOrder(first: Element, second: Element): boolean;
	readonly length: number;
	indexOf(element: Element): number;
	elementAtIndex(index: number): Element;
}

export interface SequenceIterator<Element, Place = Element | undefined> extends IterableIterator<Element> {
	prev(): IteratorResult<Element>;
	current(): Place;
}
