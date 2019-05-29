import * as bcs from "./broadcaststateservice"

async function Run()
{
   const pragueDocID   = "testDoc";
   const routerlicious = "http://localhost:3000";
   const historian     = "http://localhost:3001";
   const tenantID      = "prague";
   const secret        = "03302d4ebfb6f44b662d00313aff5a46"

   const stateService = await bcs.GetStateService( pragueDocID, 
                                                   routerlicious, 
                                                   historian, 
                                                   tenantID, 
                                                   secret );

   const newMap = await stateService.CreateMap( "testmap" );
   if( newMap )
      console.log( "Map created" );

   const ss2 = await bcs.GetStateService( pragueDocID, 
                                          routerlicious, 
                                          historian, 
                                          tenantID, 
                                          secret );

   const map2 = await ss2.WaitMap( "testmap" );

   const valueChangedPromise = new Promise< void >( resolve => { map2.on( "valueChanged", 
                                                                          ( changed, local, op ) => { console.log( "Value changed" ); 
                                                                                                      resolve(); } ) } );
                                                                          
   newMap.set( "Key", "value" );

   await valueChangedPromise;

   const c2 = await ss2.CreateCell( "currentSlide" );
   const c1 = await stateService.WaitCell( "currentSlide" );

   const slideNavPromise = new Promise< void >( resolve => { c1.on( "valueChanged", value => { resolve(); } ) } );

   c2.set( "256" );

   await slideNavPromise;
}

Run().then( () => { console.log( "Complete" ); process.exit(); } );