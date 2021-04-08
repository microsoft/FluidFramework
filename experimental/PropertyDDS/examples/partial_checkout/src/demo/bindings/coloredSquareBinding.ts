import { DataBinding } from '@fluid-experimental/property-binder';
import { Square } from '../views/square';

export class ColoredSquareBinding extends DataBinding {
    private updatePosition(values: any) {
        const square = this.getRepresentation<Square>();
        square?.updatePosition(values);
    }

    private updateColor(value: string) {
        const square = this.getRepresentation<Square>();
        square?.updateColor(value);
    }

    private updateLength(value: number) {
        const square = this.getRepresentation<Square>();
        square?.updateLength(value);
    }

    static initialize() {
        this.registerOnValues('position', ['modify'], this.prototype.updatePosition);
        this.registerOnValues('color', ['modify'], this.prototype.updateColor);
        this.registerOnValues('length', ['modify'], this.prototype.updateLength);
    }
}


ColoredSquareBinding.initialize();
