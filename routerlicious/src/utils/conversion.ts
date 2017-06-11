/**
 * Parses the given value into a boolean
 */
export function parseBoolean(value: any): boolean {
    return typeof value === "boolean" ? value : value === "true";
}
