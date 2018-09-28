import { Quorum } from "../quorum";

describe("Loader", () => {
    describe("Quorum", () => {
        let quorum: Quorum;

        beforeEach(() => {
            quorum = new Quorum(
                0,
                [],
                [],
                [],
                (key, value) => 0,
                (value) => { return; });
        });

        describe(".propose()", async () => {
            it("Should be able to propose a new value", () => {
                quorum.propose("hello", "world");
            });
        });
    });
});
