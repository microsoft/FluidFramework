// tslint:disable:no-bitwise

export interface IComparer<T> {
    min: T;

    compare(a: T, b: T): number;
}

export const NumberComparer: IComparer<number> = {
    compare: (a, b) => a - b,
    min: Number.MIN_VALUE,
};

export interface IHeapNode<T> {
    value: T;
    position: number;
}

export class Heap<T> {
    // TODO temporarily public while validating bug fix. Make private once fixed.
    public L: Array<IHeapNode<T>>;

    constructor(public comp: IComparer<T>) {
        this.L = [{ value: comp.min, position: 0}];
    }

    public peek(): IHeapNode<T> {
        return this.L[1];
    }

    public get(): T {
        this.swap(1, this.count());
        const x = this.L.pop();
        this.fixdown(1);
        return x.value;
    }

    public add(x: T): IHeapNode<T> {
        const node = { value: x, position: this.L.length };
        this.L.push(node);
        this.fixup(this.count());

        return node;
    }

    /**
     * Allows for heap to be updated after a node's value changes
     */
    public update(node: IHeapNode<T>) {
        const k = node.position;
        if (this.isGreaterThanParent(k)) {
            this.fixup(k);
        } else {
            this.fixdown(k);
        }
    }

    public count() {
        return this.L.length - 1;
    }

    private fixup(k: number) {
        while (this.isGreaterThanParent(k)) {
            const parent = k >> 1;
            this.swap(k, parent);
            k = parent;
        }
    }

    private isGreaterThanParent(k: number): boolean {
        return k > 1 && (this.comp.compare(this.L[k >> 1].value, this.L[k].value) > 0);
    }

    private fixdown(k: number) {
        while ((k << 1) <= this.count()) {
            let j = k << 1;
            if ((j < this.count()) && (this.comp.compare(this.L[j].value, this.L[j + 1].value) > 0)) {
                j++;
            }
            if (this.comp.compare(this.L[k].value, this.L[j].value) <= 0) {
                break;
            }
            this.swap(k, j);
            k = j;
        }
    }

    private swap(k: number, j: number) {
        const tmp = this.L[k];
        this.L[k] = this.L[j];
        this.L[k].position = k;
        this.L[j] = tmp;
        this.L[j].position = j;
    }
}
