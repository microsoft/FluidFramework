/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as rs from "randomstring";
import * as sio from "./siotest";
import * as ws from "./wstest";

function generateRandomBatchMessages(length: number): string[] {
    const messages = new Array<string>();

    for (let i = 0; i < length; i++) {
        const str = rs.generate(1024);
        messages.push(str);
    }

    return messages;
}

document.getElementById("run").onclick = async (ev) => {
    const batches = Number.parseInt((document.getElementById("batches") as HTMLInputElement).value, 10);
    const messagesPerBatch = Number.parseInt((document.getElementById("batchSize") as HTMLInputElement).value, 10);
    console.log(batches, messagesPerBatch);

    const newElement = document.createElement("tr");
    const th = document.createElement("th");
    th.innerText = `${batches} batches @ ${messagesPerBatch} messages per batch`;
    th.scope = "row";
    const sioTd = document.createElement("td");
    const sioIterTd = document.createElement("td");
    const sioRedisTd = document.createElement("td");
    const sioRedisIterTd = document.createElement("td");
    const wsTd = document.createElement("td");
    const wsIterTd = document.createElement("td");
    newElement.appendChild(th);
    newElement.appendChild(sioTd);
    newElement.appendChild(sioRedisTd);
    newElement.appendChild(sioIterTd);
    newElement.appendChild(sioRedisIterTd);
    newElement.appendChild(wsTd);
    newElement.appendChild(wsIterTd);

    document.getElementById("output").appendChild(newElement);

    const messages = generateRandomBatchMessages(messagesPerBatch);

    const wsresults = await ws.runTest(batches, messages, false);
    wsTd.innerText = "WS" + JSON.stringify(wsresults, null, 2);

    const sioresults = await sio.runTest(batches, messages, false, false);
    sioTd.innerText = "SIO" + JSON.stringify(sioresults, null, 2);

    const wsresultsIter = await ws.runTest(batches, messages, true);
    wsIterTd.innerText = "WS Iter" + JSON.stringify(wsresultsIter, null, 2);

    const sioresultsIter = await sio.runTest(batches, messages, true, false);
    sioIterTd.innerText = "SIO Iter" + JSON.stringify(sioresultsIter, null, 2);

    const sioRedisResults = await sio.runTest(batches, messages, false, true);
    sioRedisTd.innerText = "SIO+Redis" + JSON.stringify(sioRedisResults, null, 2);

    const sioRedisIterResults = await sio.runTest(batches, messages, true, true);
    sioRedisIterTd.innerText = "SIO+Redis Iter" + JSON.stringify(sioRedisIterResults, null, 2);
};
