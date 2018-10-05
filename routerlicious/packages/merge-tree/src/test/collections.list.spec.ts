import * as assert from "assert";
import * as Collections from "../collections";

describe("Test List", () => {
    const listCount = 5;
    let list: Collections.List<number>;

    beforeEach(() => {
        list = Collections.ListMakeHead<number>();
        for (let i = 0; i < listCount; i++) {
            list.push(i);
        }
    });

    it("count", () => assert.equal(list.count(), listCount, "The list count doesn't match the expected count."));

    it("first", () => assert.equal(list.first(), listCount - 1, "first item not expected value"));

    it("last", () => assert.equal(list.last(), 0, "last item not expected value"));

    it("isHead", () => assert.equal(list.isHead, true, "expected head not head"));

    it("walk", () => {
        let i = listCount - 1;

        list.walk((data) => {
            assert.equal(data, i, "elemeted not expected value");
            i--;
        });
    });
});
