/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const blockSize = 256 as const;

interface IInteriorNode<T> {
    i: string,
    c?: IInteriorNode<T>[] | ILeafNode<T>[];
}

interface ILeafNode<T> {
    i: string,
    e?: T[];
}

type LogNode<T> = IInteriorNode<T> | ILeafNode<T>;

export class LogIndex<T> {
    private building: T[] = [];
    private readonly root: LogNode<T> = {
        i: "",
        c: [{
            i: "",
            c: [{
                i: "",
                c: [{
                    i: "",
                    e: this.building,
                }],
            }],
        }],
    };

    public append(entry: T) {
        const { building } = this;
        building.push(entry);

        if (this.building.length === blockSize) {
            this.building = [];
            this.insert(this.root, /* height: */ 3, {
                i: "",
                e: this.building,
            });
        }
    }

    private evict(handler: (data: ArrayBuffer) => string, height = 3) {
        // eslint-disable-next-line no-param-reassign
        if (height-- === 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const entry of (node as ILeafNode<T>).e!) {
                callback(entry, index);
                // eslint-disable-next-line no-param-reassign
                index++;
            }
        } else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const child of (node as IInteriorNode<T>).c!) {
                // eslint-disable-next-line no-param-reassign
                index = this.visit(child as IInteriorNode<T>, height, index, callback);
            }
        }

        return index;
    }

    private insert(
        node: IInteriorNode<T>,
        height: number,
        leaf: ILeafNode<T>,
    ): LogNode<T> | undefined {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const children = node.c!;
        let child: LogNode<T> | undefined;

        // eslint-disable-next-line no-param-reassign
        if (--height > 0) {
            child = this.insert(children[children.length - 1] as IInteriorNode<T>, height, leaf);
            if (child === undefined) {
                return undefined;
            }
        } else {
            child = leaf;
        }

        if (children.length === blockSize) {
            return { i: "", c: [child] };
        }

        children.push(child);
        return undefined;
    }

    public forEach(callback: (value, index) => void) {
        this.visit(this.root, /* height: */ 3, /* index: */ 0, callback);
    }

    private visit(
        node: LogNode<T>,
        height: number,
        index: number,
        callback: (value, index) => void,
    ) {
        // eslint-disable-next-line no-param-reassign
        if (height-- === 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const entry of (node as ILeafNode<T>).e!) {
                callback(entry, index);
                // eslint-disable-next-line no-param-reassign
                index++;
            }
        } else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const child of (node as IInteriorNode<T>).c!) {
                // eslint-disable-next-line no-param-reassign
                index = this.visit(child as IInteriorNode<T>, height, index, callback);
            }
        }

        return index;
    }
}
