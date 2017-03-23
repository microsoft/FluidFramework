import * as $ from "jquery";
import * as io from "socket.io-client";

$(document).ready(() => {
    const socket = io();
    socket.emit("join", "room", (response) => {
        console.log(`Connected to ${response}`);
    });
});
