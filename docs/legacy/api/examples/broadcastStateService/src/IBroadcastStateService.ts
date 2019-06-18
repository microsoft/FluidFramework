/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMap } from "@prague/map";
import { ICell } from "@prague/cell";

export interface IStateService
{
   CreateMap( id : string ) : Promise< IMap >;
   GetMap( id : string )    : Promise< IMap >;
   WaitMap( id : string )   : Promise< IMap >;

   CreateCell( id : string ) : Promise< ICell >;
   GetCell( id : string )    : Promise< ICell >;
   WaitCell( id : string )   : Promise< ICell >;
}