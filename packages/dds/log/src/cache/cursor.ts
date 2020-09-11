import { Tuple, IInteriorNode } from "./types";

export class Cursor<T> {
    private readonly path: Tuple<number, 4> = [-1, -1, -1, -1];
    private readonly chunks: [
        IInteriorNode<T> | undefined,
        IInteriorNode<T> | undefined,
        IInteriorNode<T> | undefined,
        ILeafNode<T> | undefined
    ];

    public moveTo(index: number) {
        /* eslint-disable no-bitwise */
        for (let i = 0; i < 4; i++) {
            const chunkIndex = index >>> 24;
            if (this.path[i] !== chunkIndex) {
                this.path[i] = -chunkIndex;
            }
            // eslint-disable-next-line no-param-reassign
            index <<= 8;
        }
        /* eslint-enable no-bitwise */
    }

    public getEntry(index: number) {
        this.moveTo(index);
        for (let i = 0; i < 4; i++) {
        }
    }
}
