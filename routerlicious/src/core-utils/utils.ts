import * as crypto from "crypto";

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
    const hashEngine = crypto.createHash("sha1");
    hashEngine.update(filePrefix);
    hashEngine.update(file);
    return hashEngine.digest("hex");
}
