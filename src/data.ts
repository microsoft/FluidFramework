export enum Available {
    No = "NO",
    Yes = "YES",
    Maybe = "MAYBE"
}

export type Person = {
    name: string;
    availability: Available[];
}

export const defaultPeople: Person[] = [
    {
        name: "Bruno",
        availability: [Available.Yes, Available.Maybe, Available.Maybe]
    },
    {
        name: "Tamine",
        availability: [Available.Yes, Available.Yes, Available.No]
    },
    {
        name: "Jodom",
        availability: [Available.Maybe, Available.No, Available.Yes]
    },
    {
        name: "Michelle",
        availability: [Available.Yes, Available.No, Available.Maybe]
    }
];

const today = new Date();
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);
export const defaultDates = [today, tomorrow, dayAfter];
