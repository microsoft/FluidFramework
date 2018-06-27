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
export function gitHashFile(file?: Buffer): string {
    if (file === undefined || file === null) {
        console.log(file);
        return "success";
    }
    const size = file.byteLength;

    const filePrefix = "blob " + size + "\0";

    const hash = crypto.createHash("sha1").update(filePrefix + file.toString("utf-8")).digest("hex");
    return hash;
}
