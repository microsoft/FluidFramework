/**
 * True if left === right, or both left and right are "empty" where "empty" is
 * defined as { "", undefined, null }.
 */
export function areStringsEquivalent(left: string, right: string) {
    const isLeftEmpty = !left;
    const isRightEmpty = !right;

    return isLeftEmpty
        ? isRightEmpty
        : !isRightEmpty && left === right;
}
