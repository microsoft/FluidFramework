import { IVectorReader, IVectorProducer } from "@tiny-calc/nano";
import { Serializable } from "@fluidframework/datastore-definitions";
import { SharedLog } from "./log";
import { Tuple, IInteriorNode, ILeafNode, LogNode } from "./types";

export class Cursor<T extends Serializable = Serializable> implements IVectorReader<T> {
    private readonly path: Tuple<number, 4> = [-1, -1, -1, -1];
    private readonly leaf: ILeafNode<T>;

    public constructor(private readonly log: SharedLog<T>) { }

    // #region IVectorReader<T>

    public get length(): number { return this.log.length; }

    getItem(index: number): T | Promise<T> {
        this.moveTo(index);
    }

    public get vectorProducer(): IVectorProducer<T> {
        return this.log;
    }

    // #endregion IVectorReader<T>

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

    public async getEntry(index: number) {
        const length = this.log.length;
        if (index > length) {
            return this.log.pending[index - length];
        }

        this.moveTo(index);

        const leaf = await this.loadLeaf();
        const { path } = this;

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return leaf.c![path[path.length - 1]];
    }
}
