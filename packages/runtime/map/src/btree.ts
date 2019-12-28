/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IBTreeEntry<TKey, TValue> {
    key: TKey;
    subBlock?: BTreeBlock<TKey, TValue>;
    value?: TValue;
    externalRef?: IRecordRef;
}

export interface IRecordBlock {
    records: string;
}

export interface IRecordRef {
    block: IRecordBlock;
    offset: number;
}

export const MaxNodesInBlock = 512;
export const MinNodesInBlock = MaxNodesInBlock / 2;

export class BTreeBlock<TKey, TValue>  {
    public children: IBTreeEntry<TKey, TValue>[];

    constructor(public childCount: number) {
        this.children = new Array<IBTreeEntry<TKey, TValue>>(MaxNodesInBlock);
    }
}

export interface IBTreeKeyFns<TKey, TValue> {
    compare(key1: TKey, key2: TKey): number;
    extractKey(v: TValue): TKey;
}

export class BTree<TKey, TValue> {
    public root: BTreeBlock<TKey, TValue>;
    public count = 0;
    private height = 0;

    constructor(public keyFns: IBTreeKeyFns<TKey, TValue>) {
        this.root = new BTreeBlock<TKey, TValue>(0);
    }

    public put(key: TKey, value: TValue): void {
        if (key !== undefined) {
            const upBlock = this.insert(this.root, key, value, this.height);
            this.count++;
            if (upBlock) {
                const newRoot = new BTreeBlock<TKey, TValue>(2);
                newRoot.children[0] = { key: this.root.children[0].key, subBlock: this.root };
                newRoot.children[1] = { key: upBlock.children[0].key, subBlock: upBlock };
                this.root = newRoot;
                this.height++;
            }
        }
        // TODO: exception
    }

    public insert(block: BTreeBlock<TKey, TValue>, key: TKey, val: TValue, ht: number): BTreeBlock<TKey, TValue> {
        const entry: IBTreeEntry<TKey, TValue> = { key };
        let j: number;
        // leaf
        if (ht === 0) {
            for (j = 0; j < block.childCount; j++) {
                if (this.keyFns.compare(key, block.children[j].key) < 0) {
                    break;
                }
            }
        }
        else {
            for (j = 0; j < block.childCount; j++) {
                if ((j + 1 === block.childCount) || (this.keyFns.compare(key, block.children[j + 1].key))) {
                    const upBlock = this.insert(block.children[j++].subBlock, key, val, ht - 1);
                    if (upBlock) {
                        entry.key = upBlock.children[0].key;
                        entry.subBlock = upBlock;
                    } else {
                        return undefined;
                    }
                }
            }
        }

        for (let i = block.childCount; i > j; i--) {
            block.children[i] = block.children[i - 1];
        }
        block.childCount++;
        if (block.childCount < MaxNodesInBlock) {
            return undefined;
        } else {
            return this.split(block);
        }
    }

    private split(block: BTreeBlock<TKey, TValue>) {
        const rightSib = new BTreeBlock<TKey, TValue>(MinNodesInBlock);
        block.childCount = MinNodesInBlock;
        for (let j = 0; j < MinNodesInBlock; j++) {
            rightSib.children[j] = block.children[MinNodesInBlock + j];
        }
        return rightSib;
    }
}
