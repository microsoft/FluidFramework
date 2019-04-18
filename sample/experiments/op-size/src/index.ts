import * as proto from "./proto";

const contents = "{\"address\":\"root\",\"contents\":{\"content\":{\"address\":\"160c115d-26dc-4163-980a-16419672a3f3\",\"contents\":{\"clientSequenceNumber\":30,\"contents\":{\"pos1\":27,\"text\":\"e\",\"type\":0},\"referenceSequenceNumber\":29,\"type\":\"op\"}},\"type\":\"objOp\"}}";
console.log(`Content size: ${contents.length}`);

const op = {
    clientId: "itchy-steel",
    clientSequenceNumber: 20,
    contents: null,
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
    contents: null,
    msn: 63,
    rsn: 63,
    sn: 256,
    ts: 1549777589968,
    tr: [],
    type: "objOp",
};

const oldOp = JSON.stringify(op);
const newOp = JSON.stringify(op2);

console.log(`Old op length: ${oldOp.length}`);
console.log(`Old op length in byte(s): ${getByteLength(oldOp)}`);

console.log(`New op length: ${newOp.length}`);
console.log(`New op length in byte(s): ${getByteLength(newOp)}`);

console.log(`Proto size in byte(s): ${proto.getProtoSize(op)}`);

const inputProto = proto.convertToProto(op);
const outputJSON = proto.convertFromProto(inputProto);
const outputObj = proto.convertToObject(inputProto);

console.log(JSON.stringify(outputJSON));
console.log(JSON.stringify(outputObj));

function getByteLength(input: string) {
    return (Buffer.byteLength(input, 'utf8'));
}