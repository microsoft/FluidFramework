import { core, socketIoClient as io } from "../../client-api";

// new average = old average + (next data - old average) / next count
let messageCount = 0;
let averageLatency = 0.0;

const pingInterval = 20;

export function load() {
    const socket = io(document.location.origin, { transports: ["websocket"] });

    setInterval(() => {
        const pingMessage: core.IPingMessage = {
            acked: false,
            traces: [{
                action: "start",
                service: "ping",
                timestamp: Date.now(),
            }],
        };
        socket.emit("pingObject", pingMessage);
        socket.on("pingObject", (response: core.IPingMessage) => {
            if (response.traces.length === 1) {
                // Calculate and show running average latency.
                ++messageCount;
                const ts = Date.now();
                const pingLatency = ts - response.traces[0].timestamp;
                averageLatency += (pingLatency - averageLatency) / messageCount;
                document.getElementById("avg-latency").innerText =
                `Average ping latency: ${(averageLatency).toFixed(2)} ms`;
                // Push back to alfred for tracking purpose.
                response.acked = true;
                response.traces.push({
                    action: "end",
                    service: "ping",
                    timestamp: ts,
                });
                socket.emit("pingObject", response);
            }
        });

    }, pingInterval);
}
