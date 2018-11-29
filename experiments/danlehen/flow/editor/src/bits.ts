/** Helpers for common bit operations */
export module BitOps {
    export const test  = (bits: number, mask: number) => bits & mask;
    export const set   = (bits: number, mask: number) => bits | mask;
    export const clear = (bits: number, mask: number) => bits & ~mask;
}