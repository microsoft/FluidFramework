import { ChildProcess, fork } from "child_process";
import { EventEmitter } from "events";
import * as path from "path";
import { IHook } from "../github";

export class Appender extends EventEmitter {
    private childProcess: ChildProcess;

    constructor(id: string) {
        super();

        const workerPath = path.join(__dirname, "../worker");
        this.childProcess = fork(workerPath, [id]);

        this.childProcess.on(
            "exit",
            (code, signal) => {
                this.emit("exit", code, signal);
            });

        this.childProcess.on(
            "error",
            (error) => {
                this.emit("error", error);
            });

        this.childProcess.on(
            "message",
            (message, sendHandle) => {
                console.log("message", message);
            });
    }

    public append(event: string, hook: IHook) {
        // TODO - do we want to buffer messages and retry sends?
        this.childProcess.send(
            { event, hook },
            (error) => {
                if (error) {
                    console.log(error);
                }
            });
    }
}
