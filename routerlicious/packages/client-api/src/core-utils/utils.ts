/**
 * Returns the value of an object or sets to default if undefined.
 */
export function getOrDefault<T>(value: T, def: T): T {
    return (value === undefined) ? def : value;
}
