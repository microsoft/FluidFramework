export function assert(condition: boolean): void {
	if (!condition) {
		throw new Error("Assert failed");
	}
}
