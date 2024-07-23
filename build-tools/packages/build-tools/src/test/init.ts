import path from "node:path";

/**
 * Path to the test data. It's rooted two directories up because the tests get executed from dist/.
 */
export const testDataPath = path.resolve(__dirname, "../../src/test/data");
