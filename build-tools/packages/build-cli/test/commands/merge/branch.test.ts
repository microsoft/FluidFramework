import { expect, test } from "@oclif/test";

describe("merge/branch", () => {
    test.stdout()
        .command(["merge/branch"])
        .it("runs hello", (ctx) => {
            expect(ctx.stdout).to.contain("hello world");
        });

    test.stdout()
        .command(["merge/branch", "--name", "jeff"])
        .it("runs hello --name jeff", (ctx) => {
            expect(ctx.stdout).to.contain("hello jeff");
        });
});
