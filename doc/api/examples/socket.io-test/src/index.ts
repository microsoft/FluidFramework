import * as rs from "randomstring";
import * as io from "socket.io-client";

const routerlicious = "http://localhost:3030";

function send(socket: SocketIOClient.Socket, index: number, total: number, setLength: number) {
    const messages = [];
    for (let i = 0; i < setLength; i++) {
        const str = rs.generate(1024);
        const msg = { id: i + index * setLength, start: Date.now(), str };
        messages.push(msg);
    }
    socket.emit("relay", JSON.stringify(messages));

    if (index <= total) {
        // Starting with setTimeout - will upgrade to immediate
        setTimeout(
            () => {
                send(socket, index + 1, total, setLength);
            },
            0);
    }
}

async function runTest(socket: SocketIOClient.Socket, batches: number, batchSize: number): Promise<any> {
    return new Promise<any>((resolve) => {
        const start = Date.now();
        let latencySum = 0;
        const totalMessages = batches * batchSize;

        send(socket, 0, batches, batchSize);

        socket.on("relaypong", (msgsRaw) => {
            const msgs = JSON.parse(msgsRaw);
            for (const msg of msgs) {
                const latency = Date.now() - msg.start;
                latencySum += latency;

                if (msg.id === totalMessages - 1) {
                    const end = Date.now();
                    const totalTime = end - start;
                    socket.disconnect();

                    resolve({
                        end,
                        latency: latencySum / totalMessages,
                        mbpsBandwidth: 1000 * (totalMessages / 1024) / totalTime,
                        messageBandwidth: 1000 * totalMessages / totalTime,
                        start,
                        totalMessages,
                        totalTime,
                    });
                }
            }
        });
    });
}

function send2(socket: SocketIOClient.Socket, index: number, total: number, setLength: number) {
    const messages = [];
    for (let i = 0; i < setLength; i++) {
        const str = rs.generate(1024);
        const msg = JSON.stringify({ id: i + index * setLength, start: Date.now(), str });
        messages.push(msg);
    }
    socket.emit("relay2", ...messages);

    if (index <= total) {
        // Starting with setTimeout - will upgrade to immediate
        // setTimeout(
        //     () => {
                send2(socket, index + 1, total, setLength);
        // },
        // 0);
    }
}

async function runTest2(socket: SocketIOClient.Socket, batches: number, batchSize: number): Promise<any> {
    return new Promise<any>((resolve) => {
        const start = Date.now();
        let latencySum = 0;
        const totalMessages = batches * batchSize;

        send2(socket, 0, batches, batchSize);

        socket.on("relaypong2", (...msgs: any[]) => {
            for (const msgRaw of msgs) {
                const msg = JSON.parse(msgRaw);
                const latency = Date.now() - msg.start;
                latencySum += latency;

                if (msg.id === totalMessages - 1) {
                    const end = Date.now();
                    const totalTime = end - start;
                    socket.disconnect();

                    resolve({
                        end,
                        latency: latencySum / totalMessages,
                        mbpsBandwidth: 1000 * (totalMessages / 1024) / totalTime,
                        messageBandwidth: 1000 * totalMessages / totalTime,
                        start,
                        totalMessages,
                        totalTime,
                    });
                }
            }
        });
    });
}

const totalM = 10000;
const batch = 10;
const messagesPerBatch = totalM / batch;

document.getElementById("run").onclick = (ev) => {
    console.log(batch, messagesPerBatch);
    // const stats = Measured.createCollection();
    const socket = io(routerlicious, { transports: ["websocket"] });
    runTest(socket, batch, messagesPerBatch).then((stats) => {
        console.log(JSON.stringify(stats, null, 2));
    });
};

document.getElementById("run2").onclick = (ev) => {
    console.log(batch, messagesPerBatch);
    // const stats = Measured.createCollection();
    const socket = io(routerlicious, { transports: ["websocket"] });
    runTest2(socket, batch, messagesPerBatch).then((stats) => {
        console.log(JSON.stringify(stats, null, 2));
    });
};
