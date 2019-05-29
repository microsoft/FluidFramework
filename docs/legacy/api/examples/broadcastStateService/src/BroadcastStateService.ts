import * as api from "@prague/client-api";
import { ICell } from "@prague/cell";
import { IMap } from "@prague/map";
import * as socketStorage from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";
import { IStateService } from "./IBroadcastStateService"

class BroadcastStateService implements IStateService
{
   constructor( private collabDoc : api.Document )
   {
   }

   async GetMap( id : string ) : Promise< IMap >
   {
      const rootView = await this.collabDoc.getRoot().getView();
      return rootView.get( id );
   }

   async WaitMap( id : string ) : Promise< IMap >
   {
      const rootView = await this.collabDoc.getRoot().getView();
      await rootView.wait( id );
      return rootView.get( id );
   }

   async CreateMap( id : string ) : Promise< IMap >
   {
      const rootView = await this.collabDoc.getRoot().getView();
      const map = rootView.get( id );
      if( map )
         return map;

      rootView.set( id, this.collabDoc.createMap() );

      return rootView.get( id );
   }

   async CreateCell( id : string ) : Promise< ICell >
   {
      const rootView = await this.collabDoc.getRoot().getView();
      const cell = rootView.get( id );
      if( cell )
         return cell;

      rootView.set( id, this.collabDoc.createCell() );

      return rootView.get( id );
   }

   async GetCell( id : string )    : Promise< ICell >
   {
      const rootView = await this.collabDoc.getRoot().getView();
      return rootView.get( id );
   }

   async WaitCell( id : string )   : Promise< ICell >
   {
      const rootView = await this.collabDoc.getRoot().getView();
      await rootView.wait( id );
      return rootView.get( id );
   }
}

export async function GetStateService( docID         : string,
                                       routerlicious : string, 
                                       historian     : string,
                                       tenantId      : string,
                                       secret        : string ) : Promise< IStateService >
{
   const documentServices = socketStorage.createDocumentService( routerlicious, historian );
   api.registerDocumentService( documentServices );
   const user = { id : "test" };

   const token = jwt.sign( { documentId : docID,
                           permission: "read:write", // use "read:write" for now
                           tenantId,
                           user },
                           secret );

   const collabDoc : api.Document = await api.load( docID,
                                                   tenantId,
                                                   user,
                                                   new socketStorage.TokenProvider( token ),
                                                   { blockUpdateMarkers: true, token } );

   if( !collabDoc.isConnected ) 
   {
      await new Promise< void >( resolve => collabDoc.once( "connected", () => resolve() ) );
   }

   return new BroadcastStateService( collabDoc );
}