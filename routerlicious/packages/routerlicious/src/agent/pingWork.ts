import { EventEmitter } from "events";
import { core, socketIoClient as io } from "../client-api";
import { IWork} from "./definitions";

/**
 * This uses socketio to track ping latencies.
 */
export class PingWork implements IWork {

    private socket: any;
    private pingTimer: any;
    private pingInterval: number = 500;
    private events = new EventEmitter();

    constructor(private pingUrl: string) {
        this.socket = io(this.pingUrl, { transports: ["websocket"] });
    }

    public start(): Promise<void> {
        this.pingTimer = setInterval(() => {
            const pingMessage: core.IPingMessage = {
                acked: false,
                traces: [{
                    action: "start",
                    service: "ping",
                    timestamp: Date.now(),
                }],
            };
            this.socket.emit(
                "pingObject",
                pingMessage,
                (error, response: core.IPingMessage) => {
                    if (!error && response.traces.length > 0) {
                        response.acked = true;
                        response.traces.push({
                            action: "end",
                            service: "ping",
                            timestamp: Date.now(),
                        });
                        this.socket.emit("pingObject", response);
                    }
                });
        }, this.pingInterval);
        return Promise.resolve();
    }

    public stop(): Promise<void> {
        clearInterval(this.pingTimer);
        return Promise.resolve();
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListeners() {
        // Not implemented.
    }
}
