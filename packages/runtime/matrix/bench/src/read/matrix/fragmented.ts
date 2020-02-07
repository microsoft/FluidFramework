import { pointwise } from '../test';
import { createFragmentedMatrix } from '../../util';
import { getTestArgs } from '../../harness';

const { row, col, numRows, numCols } = getTestArgs();

pointwise('Fragmented Matrix 256x256', createFragmentedMatrix(row + numRows, col + numCols));
