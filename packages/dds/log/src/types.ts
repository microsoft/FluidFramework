import { IFluidHandle } from "@fluidframework/core-interfaces";

export const log2BlockSize = 11 as const;
export const log2LeafSize = 10 as const;
export const blockSize = 2048 as const;     // = 1 << log2BlockSize;
export const leafSize = 1024 as const;      // = 1 << log2LeafSize;

export interface ILogNode<T = unknown> {
    /**
     * Handle to the blob contents containing the serialized children.  Undefined
     * if the blob has not been uploaded, a Promise if the upload is in progress,
     * and a concrete handle reference once the upload completes.
     */
    h?: IFluidHandle<ArrayBufferLike> | Promise<IFluidHandle<ArrayBufferLike>>

    /** Current ref count for the node (used for eviction) */
    r: number;

    /**
     * Children
     */
    c?: T[];
}

export type InteriorNode<T = unknown> = ILogNode<LogNode<T>>;
export type LeafNode<T = unknown> = ILogNode<T>;
export type LogNode<T = unknown> = InteriorNode<T> | LeafNode<T>;
