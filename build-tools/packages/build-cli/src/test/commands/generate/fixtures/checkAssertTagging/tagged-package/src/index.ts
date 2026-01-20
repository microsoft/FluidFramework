function assert(condition: boolean, message: number): asserts condition {
	if (!condition) throw new Error(String(message));
}

export function example(): void {
	assert(true, 0x001 /* This is a tagged assert message */);
}
