import { IHook } from "../github";
import { Appender } from "./appender";

export class AppendManager {
    private childProcesses = new Map<string, Appender>();

    public append(event: string, hook: IHook) {
        if (!this.childProcesses.has(event)) {
            const appender = new Appender();
            appender.on("exit", (code, signal) => {
                console.log(`Appender exited`, code, signal);
                this.childProcesses.delete(hook.repository.full_name);
            });

            this.childProcesses.set(hook.repository.full_name, appender);
        }

        this.childProcesses.get(hook.repository.full_name).append(event, hook);
    }
}
