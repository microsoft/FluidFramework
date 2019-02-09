export function randomSequence(length: number) {
    return Array.from({length}, () => (Math.random() * length * 2) | 0)
}