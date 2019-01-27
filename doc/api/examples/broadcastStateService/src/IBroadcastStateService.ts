import { IMap } from "@prague/map";

export interface IStateService
{
   GetMap( id : string ) : IMap;
   CreateMap( id : string ) : IMap;
}

export function GetStateService( routerlicious : string, 
                                 historian     : string,
                                 tenantId      : string,
                                 secret        : string )
{
   throw new Error( "NYI" );
}