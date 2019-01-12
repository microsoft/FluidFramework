using System;
using System.Collections.Immutable;
using System.Text;

using System.IdentityModel.Tokens.Jwt;

using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

using Quobject.SocketIoClientDotNet.Client;
using Quobject.EngineIoClientDotNet.ComponentEmitter;

namespace PragueProtoClient
{
   class SequencedDocumentMessage
   {
      public object   user; // TODO IUser
      public string   clientId;
      public Int64    sequenceNumber;
      public Int64    minimumSequenceNumber;
      public Int64    clientSequenceNumber;
      public Int64    referenceSequenceNumber;
      public string   type;
      public object   any;
      public object   metadata;
      public object[] traces;
      public Int64    timestamp;
   }

   class SequencedObjectMessage
   {
      public object   user;
      public Int64    sequenceNumber;
      public Int64    minimumSequenceNumber;
      public Int64    clientSequenceNumber;
      public Int64    referenceSequenceNumber;
      public string   clientId;
      public string   type;
      public object   contents;
      public object   origin;
      public object[] traces;
   }

   interface IPragueDocument
   {
   }

   interface IMap
   {

   }

   class IConnect
   {
      public string tenantId;
      public string id;
      public string token;
   }

   class OpListener : IListener
   {
      public void Call( params object[] args )
      {
         System.Console.WriteLine( "OpListener::Call " );

         foreach( object arg in args )
         {
            System.Console.WriteLine( "\t{0}", arg );

            JArray objArray = arg as JArray;

            if( objArray != null )
            {
               foreach( JObject obj in objArray )
               {
                  string type = obj[ "type" ].Value< string >();
                  System.Console.WriteLine( "Type:{0}", type );

                  if( type == "objOp" )
                  {
                     SequencedObjectMessage objMessage = obj.ToObject< SequencedObjectMessage >();
                  }
                  else
                  {
                     System.Console.WriteLine( "Type:{0} Unhandled", type );
                  }
               }
            }
         }
      }

      public int CompareTo( IListener other )
      {
         throw new NotImplementedException();
      }

      public int GetId()
      {
         throw new NotImplementedException();
      }
   }

   class PragueProtoClient
   {
      static void Main( string[] args )
      {
         //string docID         = "DefaultDoc";
         //string tenantID      = "gallant-hugle";
         //string routerlicious = "https://alfred.wu2.prague.office-int.com";

         string docID         = "doc7";
         string tenantID      = "prague";
         string routerlicious = "http://localhost:3000";


         var options = new IO.Options();
         options.QueryString = string.Format( "documentId={0}&tenantId={0}", docID, tenantID );
         options.Transports = new string[] { "websocket" }.ToImmutableList();

         var socket = IO.Socket( routerlicious, options );

         socket.On( "op", new OpListener() );

         socket.On( Socket.EVENT_CONNECT, () => { System.Console.WriteLine( "Connected" ); } );
         socket.On( Socket.EVENT_CONNECT_ERROR, () => { System.Console.WriteLine( "ConnectionError" ); } );
         socket.On( Socket.EVENT_MESSAGE, () => { System.Console.WriteLine( "Event_Message" ); } );
         socket.On( Socket.EVENT_ERROR, () => { System.Console.WriteLine( "Error" ); } );
         
         string key = "03302d4ebfb6f44b662d00313aff5a46";

         var securityKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey( Encoding.UTF8.GetBytes( key ) );

         var credentials = new Microsoft.IdentityModel.Tokens.SigningCredentials( securityKey, Microsoft.IdentityModel.Tokens.SecurityAlgorithms.HmacSha256 );

         var header = new JwtHeader( credentials );
         
         var payload = new JwtPayload
         {
            { "documentId", docID },
            { "permission", "read:write" },
            { "tenantId",   tenantID },
            { "user",       new JwtPayload { { "id", "test" } } },
            //{ "iat",        Convert.ToUInt64( ( DateTime.UtcNow - new DateTime( 1970, 1, 1, 0, 0, 0, DateTimeKind.Utc ) ).TotalSeconds ).ToString() }
         };

         var secToken = new JwtSecurityToken(header, payload );
         var handler = new JwtSecurityTokenHandler();

         var tokenString = handler.WriteToken( secToken );

         IConnect connect = new IConnect { id       = docID,
                                           tenantId = tenantID,
                                           token    = tokenString } ;

         string connectStr = JsonConvert.SerializeObject( connect );

         socket.On( "connect_document_success", () => { System.Console.WriteLine( "Connect_Success" ); } );
         socket.On( "connect_document_error", data => { System.Console.WriteLine( "Connect doc error {0}", data ); } );

         JObject jobj = JObject.Parse( JsonConvert.SerializeObject( connect ) );

         socket.Emit( "connect_document", jobj );

         System.Console.WriteLine( "Press any key to continue..." );
         System.Console.ReadKey();
      }
   }
}
