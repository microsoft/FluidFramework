import * as sha1 from "sha.js/sha1";

/**
 * Returns the value of an object or sets to default if undefined.
 */
export function getOrDefault<T>(value: T, def: T): T {
    return (value === undefined) ? def : value;
}

/**
 * Create Hash (Github hashes the string with blob and size)
 * @param file The contents of the file in a buffer
 */
export function gitHashFile(file: Buffer): string {
    const size = file.byteLength;
    const filePrefix = "blob " + size + "\0";
    const engine = new sha1();
    return engine.update(filePrefix).update(file).digest("hex");
}
