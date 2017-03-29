import * as amqp from "amqp10";

let client = new amqp.Client(amqp.Policy.EventHub);
let connectP = client.connect(
    `amqps://sender:OseppLfZtnn2VRo+0XWFgxmurMybiWBxoCnSQdVqut0=@delta-stream-dev.servicebus.windows.net`);

connectP.then(() => {
    client.createSender("deltas").then((sender) => {
        setInterval(() => {
            sender.send({ op: "insert", data: "TS" }, { messageAnnotations: { "x-opt-partition-key": "document"} });
        }, 1000);
    });
});
