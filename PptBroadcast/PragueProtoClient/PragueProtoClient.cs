using System.Collections.Immutable;
using System.Text;

using System.IdentityModel.Tokens.Jwt;

using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

using Quobject.SocketIoClientDotNet.Client;

namespace PragueProtoClient
{
   class IConnect
   {
      public string tenantId;
      public string id;
      public string token;
   }
   
   class PragueProtoClient
   {
      static void Main( string[] args )
      {
         var options = new IO.Options();
         options.QueryString = "documentId=test-sequence-1204-2&tenantId=prague";
         options.Transports = new string[] { "websocket" }.ToImmutableList();

         var socket = IO.Socket( "http://localhost:3000", options );

         socket.On( "op", () => { System.Console.WriteLine( "OP" ); } );

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
            { "documentId", "test-sequence-1204-2" },
            { "permission", "read:write" },
            { "tenantId",   "prague" },
            { "user",        new JwtPayload { { "id", "test" } } },
            //{ "iat",        Convert.ToUInt64( ( DateTime.UtcNow - new DateTime( 1970, 1, 1, 0, 0, 0, DateTimeKind.Utc ) ).TotalSeconds ).ToString() }
         };

         var secToken = new JwtSecurityToken(header, payload );
         var handler = new JwtSecurityTokenHandler();

         var tokenString = handler.WriteToken( secToken );

         IConnect connect = new IConnect { id       = "test-sequence-1204-2",
                                           tenantId = "prague",
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
