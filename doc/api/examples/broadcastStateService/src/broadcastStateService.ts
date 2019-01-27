import * as api from "@prague/client-api";
import * as socketStorage from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";

import { IMap } from "@prague/map";

// const routerlicious = "https://alfred.wu2.prague.office-int.com";
// const historian = "https://historian.wu2.prague.office-int.com";
// const tenantId = "gallant-hugle";
const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "03302d4ebfb6f44b662d00313aff5a46";

// Register endpoint connection
const documentServices = socketStorage.createDocumentService( routerlicious, historian );
api.registerDocumentService( documentServices );

const readline = require( "readline" );

function ReadLine( readLine, question : string ) : Promise< string >
{
    return new Promise< string >( ( resolve, reject ) => { readLine.question( question,
                                                                              answer => { resolve( answer ); } ) } );
}

async function ReadKeyValuePairsFromConsole( map : IMap )
{
   console.log( "ReadKeyValuePairsFromConsole" );

   const readLineInterface = readline.createInterface( { input  : process.stdin,
                                                         output : process.stdout } );

   while( true )
   {
      const line = await ReadLine( readLineInterface, "Enter key:value pair> " );

      const parts = line.split( ":", 2 );

      if( parts.length == 2 )
      {
         map.set( parts[ 0 ], parts[ 1 ] );
      }
   }
}

async function PrintKeyValue( map : IMap, key : string )
{
    const value = await map.get( key );
    console.log( `valueChanged key:${key} value:${value}` );
}

async function MonitorUpdates( docID : string ) : Promise<void>
{
   console.log( `MonitorUpdates docID:${docID}` );
    
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

   const rootView = await collabDoc.getRoot().getView();

   if( !collabDoc.existing )
   {
      rootView.set( "obj", collabDoc.createMap() );
   }
   else
   {
      await rootView.wait( "obj" );
   }

   const map : IMap = rootView.get( "obj" );

   map.on( "valueChanged", 
           ( changed, local, op ) => { PrintKeyValue( map, changed.key ); } );

           
   ReadKeyValuePairsFromConsole( map );
}

const args = process.argv.slice( 2 );

const docID = args[ 0 ] ? args[ 0 ] : "DefaultDoc";

MonitorUpdates( docID );
