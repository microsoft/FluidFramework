import type { WorkerMessage, WorkerExecResult } from "./worker";

const eslint = require("eslint/lib/cli");
export async function lint(message: WorkerMessage): Promise<WorkerExecResult> {
    process.chdir(message.cwd);

    // TODO: better parsing, assume split delimited for now.
    const argv = message.command.split(" ");

    // Some rules look at process.argv directly and change behaviors
    // (e.g. eslint-plugin-react log some error to console only if format is not set)
    // So just overwrite our argv
    process.argv = argv

    const oldLog = console.log;
    const oldError = console.error;
    let stdoutLines: string[] = [];
    let stderrLines: string[] = [];
    console.log = (...args: any[]) => {
        stdoutLines.push(args.join(" "));
    };
    console.error = (...args: any[]) => {
        stderrLines.push(args.join(" "));
    };

    try {
        const code = await eslint.execute(argv.slice(1));
        return {
            code,
            stdout: stdoutLines.join("\n"),
            stderr: stderrLines.join("\n"),
        };
    } finally {
        console.log = oldLog;
        console.error = oldError;
    }
}
