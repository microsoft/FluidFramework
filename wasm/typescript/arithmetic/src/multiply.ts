import { import_wasm } from "./import";
const wasm = await import_wasm();

export function multiply(x: number, y: number) {
	let result = 0;

	for (let i = 0; i < y; i++) {
		result = wasm.add(result, x);
	}

	return result;
}
