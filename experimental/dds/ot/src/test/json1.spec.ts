import { moveOp, Doc, type } from "ot-json1";

// import { strict as assert } from "assert";

describe("ot-json1", () => {
    it("works", () => {
        let doc: Doc = {a: {x: 5}};
        const op1 = moveOp(["a", "x"], ["a", "y"]);
        doc = type.apply(doc, op1) as Doc;
    });
});
