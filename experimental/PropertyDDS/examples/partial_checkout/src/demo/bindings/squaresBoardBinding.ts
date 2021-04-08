import { DataBinding } from "@fluid-experimental/property-binder";
import { SquaresBoard } from '../views/squaresBoard';
import { Square } from '../views/square';

export class SquaresBoardBinding extends DataBinding {
    public board: SquaresBoard;
    constructor(params: any) {
        super(params);
        this.board = this.getRepresentation<SquaresBoard>()!;
    }

    insertSquare(key: any, ctx: any) {
        this.board.addSquare(this.getDataBinder().getRepresentation<Square>(ctx.getProperty(), 'view')!);
    }

    onPreRemove(){
        this.board.delete();
    }

    static initialize() {
        this.registerOnPath('squares', ['collectionInsert'], SquaresBoardBinding.prototype.insertSquare);
    }
}

SquaresBoardBinding.initialize();
