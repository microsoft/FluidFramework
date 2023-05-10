import { add } from "@fluidframework/client-wasm";

export function multiply(x: number, y: number) {
	let result = 0;

	for (let i = 0; i < y; i++) {
		result = add(result, x);
	}

	return result;
}
