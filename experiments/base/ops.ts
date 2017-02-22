export enum OpType {
    RemoveRange,
    Insert
}

export interface Op {
    transform(op: Op, opsOut: Op[]);
    opType: OpType;
    clientId?: number;
    seq?: number;
}

export class InsertTextOp implements Op {
    opType = OpType.Insert;
    constructor(public pos: number, public text: string) {

    }

    transform(op: Op, opsOut: Op[]) {
        let len = this.text.length;
        switch (op.opType) {
            case OpType.Insert: {
                let insertOp = <InsertTextOp>op;
                let pos2 = insertOp.pos;
                if (this.pos <= pos2) {
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

    transform(op: Op, opsOut: Op[], outIndex = 0) {
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
                opsOut[0] = new InsertTextOp(pos, insertOp.text);
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
                opsOut[0] = new RemoveRangeOp(start2, end2);
                break;
            }
        }
    }
}

const Nope = -1;
function editFlat(source: string, s: number, dl: number, nt = "") {
    return source.substring(0, s) + nt + source.substring(s + dl, source.length);
}

export class TestClient {
    snackOps = <Op[]>[];
    snackStart = 0;
    seq = Nope;
    clientId = Nope;
    constructor(public id: number, public text: string, public testService: TestService) {
        testService.registerClient(this);
    }

    insert(pos: number, s: string) {
        this.snackOps.push(new InsertTextOp(pos, s));
    }

    remove(start: number, end: number) {
        this.snackOps.push(new RemoveRangeOp(start, end));
    }

    flush() {

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
                    snackOp.transform(serverOp, xformServerOps);
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
                    priorOp.transform(clientOp, xformOps);
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



