export function ensureRange(value: number, limit: number) {
    // eslint-disable-next-line no-param-reassign, no-bitwise
    value >>>= 0;

    if (value >= limit) {
        throw new RangeError("Invalid (row, col) coordinate.");
    }
}
