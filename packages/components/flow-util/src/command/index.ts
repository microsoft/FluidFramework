export interface ICommand {
    name: string;
    enabled: () => boolean;
    exec: () => void;
}
