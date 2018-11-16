import { run } from "../../utils/mercator";
import { getRandomName } from "./../../utils/dockerNames";

export function initialize() {
    document.getElementById("run").onclick = async (ev) => {
        const batches = Number.parseInt((document.getElementById("batches") as HTMLInputElement).value, 10);
        const messagesPerBatch = Number.parseInt((document.getElementById("batchSize") as HTMLInputElement).value, 10);
        const payloadSize = Number.parseInt((document.getElementById("payload") as HTMLInputElement).value, 10);
        console.log(batches, messagesPerBatch, payloadSize);

        const newElement = document.createElement("tr");
        const th = document.createElement("th");
        th.innerText = `${batches} batches @ ${messagesPerBatch} ${payloadSize} byte messages per batch`;
        th.scope = "row";
        const sioTd = document.createElement("td");
        const sioLocalTd = document.createElement("td");
        const wsTd = document.createElement("td");
        const wsLocalTd = document.createElement("td");
        newElement.appendChild(th);
        newElement.appendChild(sioTd);
        newElement.appendChild(sioLocalTd);
        newElement.appendChild(wsTd);
        newElement.appendChild(wsLocalTd);

        document.getElementById("output").appendChild(newElement);

        const sioresults = await run(
            getRandomName(),
            "prague",
            "43cfc3fbf04a97c0921fd23ff10f9e4b",
            "http://localhost:3000",
            "http://localhost:3001",
            batches,
            messagesPerBatch,
            payloadSize);
        sioTd.innerText = "SIO" + JSON.stringify(sioresults, null, 2);

        // const sioLocalResults = await run(
        //     getRandomName(),
        //     "local",
        //     "43cfc3fbf04a97c0921fd23ff10f9e4b",
        //     "http://localhost:3000",
        //     "http://localhost:3001",
        //     batches,
        //     messagesPerBatch,
        //     payloadSize);
        // sioLocalTd.innerText = "SIO Local" + JSON.stringify(sioLocalResults, null, 2);

        // const wsresults = await run(
        //     getRandomName(),
        //     "prague",
        //     "43cfc3fbf04a97c0921fd23ff10f9e4b",
        //     "http://localhost:3030",
        //     "http://localhost:3001",
        //     batches,
        //     messagesPerBatch,
        //     payloadSize);
        // wsTd.innerText = "WS" + JSON.stringify(wsresults, null, 2);

        // const wsLocalResults = await run(
        //     getRandomName(),
        //     "local",
        //     "43cfc3fbf04a97c0921fd23ff10f9e4b",
        //     "http://localhost:3030",
        //     "http://localhost:3001",
        //     batches,
        //     messagesPerBatch,
        //     payloadSize);
        // wsLocalTd.innerText = "WS Local" + JSON.stringify(wsLocalResults, null, 2);
    };
}
