import { AvailabilityType, IPersonType, IViewSelectors } from "../provider";

export const defaultPeople: IPersonType[] = [
    {
        name: "Bruno",
        availability: [
            AvailabilityType.Yes,
            AvailabilityType.Maybe,
            AvailabilityType.Maybe,
        ],
    },
    {
        name: "Tamine",
        availability: [
            AvailabilityType.Yes,
            AvailabilityType.Yes,
            AvailabilityType.No,
        ],
    },
    {
        name: "Jodom",
        availability: [
            AvailabilityType.Maybe,
            AvailabilityType.No,
            AvailabilityType.Yes,
        ],
    },
    {
        name: "Michelle",
        availability: [
            AvailabilityType.Yes,
            AvailabilityType.No,
            AvailabilityType.Maybe,
        ],
    },
];

const today = new Date();
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);
export const defaultDates: Date[] = [today, tomorrow, dayAfter];

export const defaultDatesNumbers: number[] = defaultDates.map((date) =>
    date.valueOf()
);

// Comments Reducer
export const commentsReducer: React.Reducer<any, any> = (state, action) => {
    let newState = [...state];
    switch (action.type) {
        case "add":
            newState.push({ name: action.name, message: action.message });
            break;
    }
    return newState;
};

// Date reducer
export const dateReducer: React.Reducer<Date[], { key: number; date: Date }> = (
    state,
    action
) => {
    const newState = [...state];
    newState[action.key] = action.date;
    return newState;
};

// People Reducer
export const peopleReducer: React.Reducer<IViewSelectors["people"], any> = (
    state,
    action
) => {
    let newState = [...state];
    switch (action.type) {
        case "name":
            const newPerson = {
                ...state[action.personKey],
                name: action.name,
            };
            newState[action.personKey] = newPerson;
            break;
        case "availability":
            const person = newState[action.personKey];
            person.availability[action.dayKey] = action.availability;

            newState[action.personKey] = person;
            break;
        case "add":
            newState.push({
                name: "",
                availability: [
                    AvailabilityType.No,
                    AvailabilityType.No,
                    AvailabilityType.No,
                ],
            });
            break;
        case "remove":
            newState.pop();
            break;
    }

    return newState;
};
