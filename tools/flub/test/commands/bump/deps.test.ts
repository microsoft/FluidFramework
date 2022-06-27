import { expect, test } from "@oclif/test";

describe("deps", () => {
    test.stdout()
        .command(["bump:deps"])
        .exit(100)
        // .it("exits with code 100");
        .it("runs bump:deps", (ctx) => {
            expect(ctx.stdout).to.contain("hello from deps");
        });

    // test.stdout()
    //     .command(["bump", "deps", "--help"])
    //     .it("runs hello --name jeff", (ctx) => {
    //         expect(ctx.stdout).to.contain("hello jeff");
    //     });
});
