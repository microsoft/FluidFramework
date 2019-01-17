using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Net.Http;
using System.Text;

using System.IdentityModel.Tokens.Jwt;

using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

using Quobject.SocketIoClientDotNet.Client;
using Quobject.EngineIoClientDotNet.ComponentEmitter;

namespace PragueProtoClient
{
   interface ICollaborativeObject
   {
      string id { get; }

      void ProcessCore( ISequencedObjectMessage message, bool local, object context );
   }

   class CollaborativeMap : ICollaborativeObject
   {
      private readonly string                        m_id;
      private readonly IDictionary< string, object > m_values = new Dictionary< string, object >();

      public CollaborativeMap( string id )
      {
         m_id = id;
      }

      public string id { get { return m_id; } }

      public void ProcessCore( ISequencedObjectMessage message, bool local, object context )
      {
         IEnvelope env = JsonConvert.DeserializeObject< IEnvelope >( ( string )message.contents );
         System.Console.WriteLine( "Env: {0}", JsonConvert.SerializeObject( env, Formatting.Indented ) );

         IObjectMessage objMessage = ( ( JObject )env.contents ).ToObject< IObjectMessage >();
         System.Console.WriteLine( "OM:{0}", JsonConvert.SerializeObject( objMessage, Formatting.Indented ) );

         IMapOperation mapOp = ( (JObject )objMessage.contents ).ToObject< IMapOperation >();
         System.Console.WriteLine( "MapOp:{0}", JsonConvert.SerializeObject( mapOp, Formatting.Indented ) );

         m_values[ mapOp.key ] = mapOp.value;

         System.Console.WriteLine( "CollaborativeMap::ProcessCore Key:{0} Value:{1}", mapOp.key, mapOp.value );
      }
   }

   class IAttachMessage
   {
      public string id;
      public string type;
      public object snapshot;
   }

   class IEnvelope
   {
      public string address;
      public object contents;
   }

   class IObjectMessage
   {
      public Int64  clientSequenceNumber;
      public Int64  referenceSequenceNumber;
      public string type;
      public object contents;
   }

   class IMapOperation
   {
      public string key;
      public string type;
      public object value;
   }

   class ISequencedDocumentMessage
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

   class ISequencedObjectMessage
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

   class IConnect
   {
      public string tenantId;
      public string id;
      public string token;
   }

   class OpListener : IListener
   {
      private readonly IDictionary< string, ICollaborativeObject > m_objs;

      public OpListener( IDictionary< string, ICollaborativeObject > objs )
      {
         m_objs = objs;
      }

      public void Call( params object[] args )
      {
         System.Console.WriteLine( "OpListener::Call " );

         foreach( object arg in args )
         {
            JArray objArray = arg as JArray;

            if( objArray != null )
            {
               foreach( JObject obj in objArray )
               {
                  System.Console.WriteLine( "===\n{0}\n===", obj );

                  string type = obj[ "type" ].Value< string >();

                  if( type == "objOp" )
                  {
                     ISequencedObjectMessage seqObjMessage = obj.ToObject< ISequencedObjectMessage >();
                     System.Console.WriteLine( JsonConvert.SerializeObject( seqObjMessage, Formatting.Indented ) );

                     IEnvelope env = JsonConvert.DeserializeObject< IEnvelope >( ( string )seqObjMessage.contents );
                     System.Console.WriteLine( "Env: {0}", JsonConvert.SerializeObject( env, Formatting.Indented ) );

                     ICollaborativeObject collabObj;
                     bool fGotValue = m_objs.TryGetValue( env.address, out collabObj );
                     if( fGotValue )
                     {
                        collabObj.ProcessCore( seqObjMessage, false, null );
                     }
                     else
                     {
                        throw new NotImplementedException( "obj not found" );
                     }
                  }
                  else if( type == "attach" )
                  {
                     ISequencedObjectMessage seqObjMessage = obj.ToObject< ISequencedObjectMessage >();
                     System.Console.WriteLine( JsonConvert.SerializeObject( seqObjMessage, Formatting.Indented ) );

                     IAttachMessage attachMessage = JsonConvert.DeserializeObject< IAttachMessage >( ( string )seqObjMessage.contents );
                     System.Console.WriteLine( "attachMessage: {0}", JsonConvert.SerializeObject( attachMessage, Formatting.Indented ) );

                     if( attachMessage.type == "https://graph.microsoft.com/types/map" )
                     {
                        if( m_objs.ContainsKey( attachMessage.id ) )
                        {
                           throw new NotImplementedException( "obj already exists" );
                        }

                        ICollaborativeObject newObj = new CollaborativeMap( attachMessage.id );
                        m_objs.Add( attachMessage.id, newObj );
                     }
                     else
                     {
                        throw new NotImplementedException();
                     }
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

         string docID         = "Doc1";
         string tenantID      = "prague";
         string routerlicious = "http://localhost:3000";

         HttpClient httpClient = new HttpClient();
         HttpResponseMessage responseMessage = httpClient.GetAsync( $"http://localhost:3000/deltas/{docID}" ).Result;

         if( responseMessage.StatusCode != System.Net.HttpStatusCode.OK )
         {
            throw new InvalidOperationException( "Invalid return code" );
         }

         IDictionary< string, ICollaborativeObject > objects = new Dictionary< string, ICollaborativeObject >();

         IListener opListener = new OpListener( objects );

         object deltasObj = JsonConvert.DeserializeObject( responseMessage.Content.ReadAsStringAsync().Result );

         opListener.Call( deltasObj );

         var options = new IO.Options();
         options.QueryString = string.Format( "documentId={0}&tenantId={0}", docID, tenantID );
         options.Transports = new string[] { "websocket" }.ToImmutableList();

         var socket = IO.Socket( routerlicious, options );

         socket.On( "op", opListener );

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
