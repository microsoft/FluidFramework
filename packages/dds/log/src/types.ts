import { IFluidHandle } from "@fluidframework/core-interfaces";

export const blockSize = 256 as const;

export interface IInteriorNode<T = unknown> {
    /** Count of populated leaf nodes (used for eviction.) */
    p: number;

    /** Children */
    c: LogNode<T>[];
}

export interface ILeafNode<T = unknown> {
    /**
     * Handle to the blob contents containing the serialized children.  Undefined
     * if the blob has not been uploaded, a Promise if the upload is in progress,
     * and concrete handle reference once the upload completes.
     */
    h?: IFluidHandle<ArrayBufferLike> | Promise<IFluidHandle<ArrayBufferLike>>

    /**
     * Children
     */
    c?: T[];
}

export type LogNode<T = unknown> = IInteriorNode<T> | ILeafNode<T>;
