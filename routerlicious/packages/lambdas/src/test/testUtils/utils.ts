import * as assert from "assert";

export function assertThrows(fn: () => void) {
    try {
        fn();
        assert.ok(false);
    } catch {
        assert.ok(true);
    }
}
