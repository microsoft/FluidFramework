import * as io from "socket.io-client";
import * as socketStorage from "../socket-storage";

const socket = io("http://tmz:4000", { transports: ["websocket"] });

runTest();

async function runTest() {
    console.log(`Sleep for 10 seconds`);
    await sleep(10000);

    const message: socketStorage.IWork = {
        clientId: "Papa-1",
        type: "Papa",
    };

    socket.emit("workerObject", "Test-Client", message, (error) => {
        if (error) {
            console.log(`Error sending to socket: ${error}`);
        }
    });

    socket.on("TaskObject", (workerId: string, msg: string, response) => {
        console.log(`Reply from TMZ! Worker ${workerId}. Task: ${msg}`);
    });

}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
