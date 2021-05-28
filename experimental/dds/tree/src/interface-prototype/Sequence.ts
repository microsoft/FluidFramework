// Sequence generic
// TODO: are sequences mutable? Are locations usable across mutations? What about Iterators?

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
