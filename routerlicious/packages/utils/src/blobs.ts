import * as sha1 from "sha.js/sha1";

/**
 * Create Hash (Github hashes the string with blob and size)
 * @param file The contents of the file in a buffer
 */
export function gitHashFile(file: Buffer): string {
    const size = file.byteLength;
    const filePrefix = "blob " + size + String.fromCharCode(0);
    const engine = new sha1();
    return engine.update(filePrefix).update(file).digest("hex");
}
