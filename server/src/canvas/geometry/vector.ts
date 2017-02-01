export interface IVector {
    x: number;
    y: number;
}

export class Vector implements IVector {
    // Constructor
    constructor(public x: number, public y: number) {
    }
}
