/** Parses an Excel-like column name to the corresponding 0-based index (e.g., 'A' -> 0) */
export function colNameToIndex(colName: string) {
    return [...colName]
        .map((letter) => letter.toUpperCase().charCodeAt(0) - 64)                   // 64 -> A=1, B=2, etc.
        .reduce((accumulator, value) => (accumulator * 26) + value, 0) - 1;         // 1-indexed -> 0-indexed
}
