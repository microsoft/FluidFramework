export function shuffle(array: any[]): any[] {
    for (let i = 0; i < array.length; i++) {
        const index = Math.floor(Math.random() * (array.length - i));
        const tmp = array[i];
        array[i] = array[index + i];
        array[index + i] = tmp;
    }
    return array;
}

export function getTimeInSeconds() {
    return new Date().getTime() / 1000;
}
