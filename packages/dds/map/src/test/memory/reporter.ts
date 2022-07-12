import { Runner, reporters } from "mocha";

// this reporter outputs test results, indenting two spaces per suite
class MyReporter extends reporters.Base {
    private _indents = 0;
    private readonly consoleLog = console.log;
    constructor(runner: Runner) {
        super(runner);
        const stats = runner.stats;

        runner
            .once(Runner.constants.EVENT_RUN_BEGIN, () => {
                this.consoleLog("start");
            })
            .on(Runner.constants.EVENT_SUITE_BEGIN, (suite) => {
                this.consoleLog(`${this.indent()}${suite.title}`);
                this.increaseIndent();
            })
            .on(Runner.constants.EVENT_SUITE_END, () => {
                this.decreaseIndent();
            })
            .on(Runner.constants.EVENT_TEST_BEGIN, (test) => {
                this.consoleLog(this.indent(), test.title);
                this.consoleLog(this.indent(), `Before: ${JSON.stringify(process.memoryUsage())}`);
            })
            // .on(Runner.constants.EVENT_TEST_END, (test) => {
            //     this.consoleLog(`${this.indent()}After : ${JSON.stringify(process.memoryUsage())}\n`);
            //     if (err === undefined) {

            //     } else {
            //         this.consoleLog(`${this.indent()}ERROR After : ${JSON.stringify(process.memoryUsage())}\n`);
            //     }
            // })
            .on(Runner.constants.EVENT_TEST_PASS, (test) => {
                this.consoleLog(this.indent(), `After : ${JSON.stringify(process.memoryUsage())}\n`);
            })
            .on(Runner.constants.EVENT_TEST_FAIL, (test, err) => {
                this.consoleLog(this.indent(), `After: ${JSON.stringify(process.memoryUsage())}`);
                this.consoleLog(this.indent(), `Error: ${err.message}`);
            })
            .once(Runner.constants.EVENT_RUN_END, () => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.consoleLog(`end: ${stats!.passes}/${stats!.passes + stats!.failures} ok`);
            });
    }

    indent() {
        return Array(this._indents).join("  ");
    }

    increaseIndent() {
        this._indents++;
    }

    decreaseIndent() {
        this._indents--;
    }
}

module.exports = MyReporter;
