export interface IViewProps {
  actions: IViewActions;
  selectors: IViewSelectors;
}

export enum AvailabilityType {
  No = "no",
  Maybe = "maybe",
  Yes = "yes"
}

export interface IViewActions {
  setAvailability: (
    personKey: number,
    dateKey: number,
    value: AvailabilityType
  ) => void;
  setName: (personKey: number, value: string) => void;
  setDate: (dateKey: number, date: Date) => void;
  addRow: () => void;
  removeRow: () => void;
  addComment: (name: string, message: string) => void;
}

export interface IPersonType {
  name: string;
  availability: AvailabilityType[];
}

export interface IViewSelectors {
  dates: Date[];
  people: IPersonType[];
  comments: ICommentType[];
}

export interface ICommentType {
  name: string;
  message: string;
}
