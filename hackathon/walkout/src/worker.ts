import * as process from "process";

process.on("message", (message) => {
    console.log(message.event);
    console.log(message.hook.pusher);
});
