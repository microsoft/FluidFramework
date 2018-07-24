import { IHook } from "../github";
import { Appender } from "./appender";

// just used to create unique ideas when testing
const rev = "";

export class AppendManager {
    private childProcesses = new Map<string, Appender>();

    public append(event: string, hook: IHook) {
        const [owner, repo] = hook.repository.full_name.split("/");
        const id = `${owner}-${repo}${rev}`;

        if (!this.childProcesses.has(id)) {
            console.log(`Creating new appender ${id}`);
            const appender = new Appender(id);
            appender.on("exit", (code, signal) => {
                console.log(`Appender exited`, code, signal);
                this.childProcesses.delete(id);
            });

            this.childProcesses.set(id, appender);
        }

        this.childProcesses.get(id).append(event, hook);
    }
}
