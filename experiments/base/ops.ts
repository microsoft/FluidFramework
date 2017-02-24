export enum OpType {
    RemoveRange,
    Insert
}

export interface Op {
    transform(op: Op, opsOut: Op[], prior: boolean);
    opType: OpType;
    clientId?: number;
    seq?: number;
}

export class InsertTextOp implements Op {
    opType = OpType.Insert;
    constructor(public pos: number, public text: string) {

    }

    transform(op: Op, opsOut: Op[], prior: boolean) {
        let len = this.text.length;
        switch (op.opType) {
            case OpType.Insert: {
                let insertOp = <InsertTextOp>op;
                let pos2 = insertOp.pos;
                if ((this.pos < pos2) || (this.pos == pos2) && prior) {
                    pos2 += len;
                }
                opsOut.push(new InsertTextOp(pos2, insertOp.text));
                break;
            }
            case OpType.RemoveRange: {
                let removeOp = <RemoveRangeOp>op;
                let start = removeOp.start;
                let end = removeOp.end;
                let start2 = -1;
                let end2 = -1;
                if (this.pos <= start) {
                    start += len;
                    end += len;
                }
                else if (this.pos < end) {
                    end2 = end + len;
                    end = this.pos;
                    start2 = this.pos + len;
                }
                opsOut.push(new RemoveRangeOp(start, end));
                if (start2 >= 0) {
                    opsOut.push(new RemoveRangeOp(start2, end2));
                }
                break;
            }
        }
    }

}

export class RemoveRangeOp implements Op {
    opType = OpType.RemoveRange;
    constructor(public start: number, public end: number) {

    }

    transform(op: Op, opsOut: Op[], prior = true) {
        let len = this.end - this.start;
        switch (op.opType) {
            case OpType.Insert: {
                let insertOp = <InsertTextOp>op;
                let pos = insertOp.pos;
                if (this.end <= pos) {
                    pos -= len;
                }
                else if (this.start < pos) {
                    pos = this.start;
                }
                opsOut.push(new InsertTextOp(pos, insertOp.text));
                break;
            }
            case OpType.RemoveRange: {
                let removeOp = <RemoveRangeOp>op;
                let start2 = removeOp.start;
                let end2 = removeOp.end;
                if (this.end <= start2) {
                    start2 -= len;
                    end2 -= len;
                }
                else if (end2 > this.start) {
                    if (this.end <= end2) {
                        end2 -= len;
                        if (this.start < start2) {
                            start2 = this.start;
                        }
                    }
                    else {
                        end2 = this.start;
                    }
                }
                opsOut.push(new RemoveRangeOp(start2, end2));
                break;
            }
        }
    }
}

const Nope = -1;
function editFlat(source: string, s: number, dl: number, nt = "") {
    console.log(`EDIT pos: ${s} dlen ${dl} nt ${nt}`);
    let post = source.substring(0, s) + nt + source.substring(s + dl, source.length);
    return post;
}

function multiTransform(localOps: Op[], localOpsOut:Op[], serverOp: Op, opsOut: Op[],prior: boolean) {
    let outputOps = [serverOp]
    let inputOps = <Op[]>[];
    for (let i = 0, len = localOps.length; i < len; i++) {
        let temp = outputOps;
        outputOps = inputOps;
        outputOps.length = 0;
        inputOps = temp;
        for (let inputOp of inputOps) {
            localOps[i].transform(inputOp, outputOps, prior);
        }
    }
    for (let outputOp of outputOps) {
        opsOut.push(outputOp);
    }
}

export function diamondTest() {
    // for now two clients
    let reftexts = ["", ""];

    function rand(imin: number, imax: number) {
        return Math.floor(Math.random() * (imax - imin + 1)) + imin;
    }

    function randInsert(reftextIndex: number) {
        let textLength = rand(1, 6);
        let text = "abcdef".substring(0, textLength);
        let textPos = rand(0, reftexts[reftextIndex].length - 1);
        return new InsertTextOp(textPos, text);
    }

    const insertCount1 = 2;
    for (let i = 0; i < insertCount1; i++) {
        //let opCount = rand(1, 4);
        let opCount = 2;
        let ops0 = <InsertTextOp[]>[];
        let ops1 = <InsertTextOp[]>[];
        console.log("Before Edits");
        console.log(reftexts[0]);
        console.log(reftexts[1]);
        for (let j = 0; j < opCount; j++) {
            ops0[j] = randInsert(0);
            ops1[j] = randInsert(1);
            reftexts[0] = editFlat(reftexts[0], ops0[j].pos, 0, ops0[j].text);
            reftexts[1] = editFlat(reftexts[1], ops1[j].pos, 0, ops1[j].text);
        }
        console.log("After Edits");
        console.log(reftexts[0]);
        console.log(reftexts[1]);

        let xformOps0 = <InsertTextOp[]>[];
        let xformOps1 = <InsertTextOp[]>[];

        // assume client 0 first 
        for (let k = 0; k < opCount; k++) {
            multiTransform(ops0, ops1[k], xformOps0, true);
            multiTransform(ops1, ops0[k], xformOps1, false);
        }

        console.log("Edits on client 0 from client 1")
        for (let k = 0; k < xformOps0.length; k++) {
            reftexts[0] = editFlat(reftexts[0], xformOps0[k].pos, 0, xformOps0[k].text);
        }
        console.log(reftexts[0]);

        console.log("Edits on client 1 from client 0")
        for (let k = 0; k < xformOps0.length; k++) {
            reftexts[1] = editFlat(reftexts[1], xformOps1[k].pos, 0, xformOps1[k].text);
        }
        console.log(reftexts[1]);

        if (reftexts[0] != reftexts[1]) {
            console.log(
                `mismatch at iteration ${i}`
            );
            break;
        }
    }
}

export class TestClient {
    snackOps = <Op[]>[];
    snackStart = 0;
    seq = Nope;
    clientId = Nope;
    constructor(public id: number, public text: string, public testService: TestService) {
        testService.registerClient(this);
    }

    buffer(op: Op) {
        op.clientId = this.clientId;
        op.seq = this.seq;
        this.snackOps.push(op);
    }

    insert(pos: number, s: string) {
        this.buffer(new InsertTextOp(pos, s));
    }

    remove(start: number, end: number) {
        this.buffer(new RemoveRangeOp(start, end));
    }

    flush() {
        if (this.snackOps.length > 0) {
            let msg = JSON.stringify(this.snackOps);
            this.testService.rawmsg(msg);
        }
    }

    apply(op: Op) {
        switch (op.opType) {
            case OpType.Insert: {
                let insertOp = <InsertTextOp>op;
                editFlat(this.text, insertOp.pos, 0, insertOp.text);
                break;
            }
            case OpType.RemoveRange: {
                let removeOp = <RemoveRangeOp>op;
                editFlat(this.text, removeOp.start, removeOp.end - removeOp.start);
                break;
            }
        }
    }
    setClientId(id: number) {
        this.clientId = id;
    }

    msg(serverOps: Op[]) {
        let xformServerOps = <Op[]>[];
        // transform each server op by any ops sent but not acknowledged
        for (let serverOp of serverOps) {
            if (serverOp.clientId != this.clientId) {
                for (let snackIndex = this.snackStart, snackLen = this.snackOps.length; snackIndex < snackLen; snackIndex++) {
                    let snackOp = this.snackOps[snackIndex];
                    snackOp.transform(serverOp, xformServerOps, false);
                }
            }
            else {
                // assumes snacks acknowledged in order
                this.snackStart++;
            }
            this.seq = serverOp.seq;
        }
        // apply transformed server ops
        for (let xformOp of xformServerOps) {
            this.apply(xformOp);
        }
        // copy down remaining sent not acknowledged ops
        if (this.snackStart > 0) {
            let remainingCount = this.snackOps.length - this.snackStart;
            for (let i = 0; i < remainingCount; i++) {
                this.snackOps[i] = this.snackOps[i + this.snackStart];
            }
            this.snackStart = 0;
            this.snackOps.length = remainingCount;
        }
    }
}

export class TestService {
    revisionHistory = <Op[]>[];
    clients = <TestClient[]>[];
    constructor(public text: string) {
    }
    registerClient(cli: TestClient) {
        cli.setClientId(this.clients.length);
        this.clients.push(cli);
    }
    apply(op: Op) {
        switch (op.opType) {
            case OpType.Insert: {
                let insertOp = <InsertTextOp>op;
                editFlat(this.text, insertOp.pos, 0, insertOp.text);
                break;
            }
            case OpType.RemoveRange: {
                let removeOp = <RemoveRangeOp>op;
                editFlat(this.text, removeOp.start, removeOp.end - removeOp.start);
                break;
            }
        }
    }
    check() {
        for (let client of this.clients) {
            if (client.text != this.text) {
                console.log(`mismatch with client ${client.clientId}`);
            }
        }
    }

    rawmsg(msgText: string) {
        let ops = <Op[]>JSON.parse(msgText);
        this.msg(ops);
    }

    msg(ops: Op[]) {
        for (let op of ops) {
            let clientSeq = op.seq;
            let clientOps = <Op[]>[];
            let xformOps = [op];
            // apply to client op any ops client has not seen
            for (let i = clientSeq + 1, len = this.revisionHistory.length; i < len; i++) {
                let temp = clientOps;
                clientOps = xformOps;
                xformOps = temp;
                let priorOp = this.revisionHistory[i];
                for (let clientOp of clientOps) {
                    priorOp.transform(clientOp, xformOps, true);
                }
            }
            for (let xformOp of xformOps) {
                this.apply(xformOp);
                this.revisionHistory.push(xformOp);
            }
            for (let client of this.clients) {
                client.msg(xformOps);
            }
            this.check();
        }
    }

}



