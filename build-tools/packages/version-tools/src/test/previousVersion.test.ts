import { assert } from "chai";

import { previousVersion } from "../semver";

describe("previousVersion", () => {
    it("1.3.3", () => {
        const input = `1.3.3`;
        const [expected1, expected2] = [undefined, `1.2.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("2.0.0", () => {
        const input = `2.0.0`;
        const [expected1, expected2] = [`1.0.0`, `2.0.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("4.5.12", () => {
        const input = `4.5.12`;
        const [expected1, expected2] = [`3.0.0`, `4.4.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("0.4.1000", () => {
        const input = `0.4.1000`;
        const [expected1, expected2] = [`0.3.1000`, `0.4.1000`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("0.4.2000", () => {
        const input = `0.4.1000`;
        const [expected1, expected2] = [`0.3.1000`, `0.4.1000`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("0.59.3000", () => {
        const input = `0.59.3000`;
        const [expected1, expected2] = [`0.58.1000`, `0.59.2000`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("2.0.0-internal.1.0.0", () => {
        const input = `2.0.0-internal.1.0.0`;
        const [expected1, expected2] = [`1.0.0`, `2.0.0-internal.1.0.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("2.0.0-internal.1.1.0", () => {
        const input = `2.0.0-internal.1.1.0`;
        const [expected1, expected2] = [`1.0.0`, `2.0.0-internal.1.0.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("2.0.0-internal.1.3.0", () => {
        const input = `2.0.0-internal.1.3.0`;
        const [expected1, expected2] = [`1.0.0`, `2.0.0-internal.1.2.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("2.0.0-internal.2.0.0", () => {
        const input = `2.0.0-internal.2.0.0`;
        const [expected1, expected2] = [`2.0.0-internal.1.0.0`, `2.0.0-internal.2.0.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("2.0.0-internal.3.0.0", () => {
        const input = `2.0.0-internal.3.0.0`;
        const [expected1, expected2] = [`2.0.0-internal.2.0.0`, `2.0.0-internal.3.0.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("2.0.0-internal.3.2.0", () => {
        const input = `2.0.0-internal.3.2.0`;
        const [expected1, expected2] = [`2.0.0-internal.2.0.0`, `2.0.0-internal.3.1.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("2.0.0-internal.3.2.2", () => {
        const input = `2.0.0-internal.3.2.2`;
        const [expected1, expected2] = [`2.0.0-internal.2.0.0`, `2.0.0-internal.3.1.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });

    it("3.0.0-internal.3.2.2", () => {
        const input = `3.0.0-internal.3.2.2`;
        const [expected1, expected2] = [`3.0.0-internal.2.0.0`, `3.0.0-internal.3.1.0`];
        const [result1, result2] = previousVersion(input);
        assert.equal(result1, expected1, "previous major version mismatch");
        assert.equal(result2, expected2, "previous minor version mismatch");
    });
});
