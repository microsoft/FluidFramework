export enum OpType {
    RemoveRange,
    Insert
}

export interface Op {
    transform(op: Op, opsOut: Op[], outIndex?: number);
    opType: OpType;
    clientId?: number;
}

export class InsertTextOp implements Op {
    opType = OpType.Insert;
    constructor(public pos: number, public text: string) {

    }

    transform(op: Op, opsOut: Op[], outIndex = 0) {
        let len = this.text.length;
        switch (op.opType) {
            case OpType.Insert: {
                let insertOp = <InsertTextOp>op;
                let pos2 = insertOp.pos;
                if (this.pos <= pos2) {
                    pos2 += len;
                }
                opsOut[outIndex] = new InsertTextOp(pos2, insertOp.text);
                break;
            }
            case OpType.RemoveRange: {
                let removeOp = <RemoveRangeOp>op;
                let start = removeOp.start;
                let end = removeOp.end;
                let start2: number, end2: number;
                if (this.pos <= start) {
                    start += len;
                    end += len;
                }
                else if (this.pos < end) {
                    end2 = end + len;
                    end = this.pos;
                    start2 = this.pos + len;
                    opsOut[outIndex + 1] = new RemoveRangeOp(start2, end2);
                }
                opsOut[outIndex] = new RemoveRangeOp(start, end);
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

