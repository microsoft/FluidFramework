const op = {
    clientId: "itchy-steel",
    clientSequenceNumber: 20,
    contents: "{\"address\":\"root\",\"contents\":{\"content\":{\"address\":\"160c115d-26dc-4163-980a-16419672a3f3\",\"contents\":{\"clientSequenceNumber\":30,\"contents\":{\"pos1\":27,\"text\":\"e\",\"type\":0},\"referenceSequenceNumber\":29,\"type\":\"op\"}},\"type\":\"objOp\"}}",
    minimumSequenceNumber: 63,
    referenceSequenceNumber: 63,
    sequenceNumber: 64,
    timestamp: 1549777589968,
    traces: [],
    type: "objOp",
};

const op2 = {
    cId: 123,
    csn: 20,
    contents: "{\"address\":\"root\",\"contents\":{\"content\":{\"address\":\"160c115d-26dc-4163-980a-16419672a3f3\",\"contents\":{\"clientSequenceNumber\":30,\"contents\":{\"pos1\":27,\"text\":\"e\",\"type\":0},\"referenceSequenceNumber\":29,\"type\":\"op\"}},\"type\":\"objOp\"}}",
    msn: 63,
    rsn: 63,
    sn: 256,
    ts: 1549777589968,
    tr: [],
    type: "objOp",
};

console.log(`Old op size: ${JSON.stringify(op).length}`);
console.log(`New op size: ${JSON.stringify(op2).length}`);