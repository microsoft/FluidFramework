import { expect, test } from "@oclif/test";

describe("generate/bundleanalyses", () => {
    test.stdout()
        .command(["generate/bundleanalyses"])
        .it("runs hello", (ctx) => {
            expect(ctx.stdout).to.contain("hello world");
        });

    test.stdout()
        .command(["generate/bundleanalyses", "--name", "jeff"])
        .it("runs hello --name jeff", (ctx) => {
            expect(ctx.stdout).to.contain("hello jeff");
        });
});
