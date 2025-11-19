/// <reference path="../../typings/gu.d.ts" />

const {logObj, makeVector} = require('GenerationUtility/utility/objectUtility.js');

//Not fully implemented
function LandscapeCaptureSystem(LandscapeActor){
    if(LandscapeActor == undefined){
        LandscapeActor = World.GetFirstActorOfClass(Landscape.StaticClass);
    }

    let renderTarget = undefined;

    function createCaptureComponent(actor) {
        //Untested
        let CaptureActor = World.SpawnActor(Actor.StaticClass);
        let SceneCaptureComponent = new SceneCaptureComponent2D(World);
        CaptureActor.AddComponent(SceneCaptureComponent);
    
        let RenderTarget = new TextureRenderTarget2D(World);
        RenderTarget.InitAutoFormat(1024, 1024); // Adjust resolution as needed
    
        SceneCaptureComponent.TextureTarget = RenderTarget;
        SceneCaptureComponent.CaptureSource = ESceneCaptureSource.SCS_SceneDepth;
        SceneCaptureComponent.OrthoWidth = 2000; // Adjust based on your mesh size
        SceneCaptureComponent.SetRelativeLocation(new Vector(0, 0, 1000));
        SceneCaptureComponent.SetRelativeRotation(new Rotator(-90, 0, 0));
    
        // Attach capture component to the target actor
        SceneCaptureComponent.AttachToComponent(actor.GetRootComponent(), { RelativeLocation: new Vector(0, 0, 1000), RelativeRotation: new Rotator(-90, 0, 0) });
    
        SceneCaptureComponent.CaptureScene();
    
        return RenderTarget;
    }

    function calculateWorldZ(depthValue) {
        // Assuming an orthographic top-down view
        let NearPlane = -10000;
        let FarPlane = 10000;
        return NearPlane + depthValue * (FarPlane - NearPlane);
    }

    function extractHeightmapData(RenderTarget) {
        let Width = RenderTarget.GetSizeX();
        let Height = RenderTarget.GetSizeY();
        let DepthData = RenderTarget.PlatformData.Mips[0].BulkData;
    
        let HeightMap = [];
    
        for (let y = 0; y < Height; y++) {
            let Row = [];
            for (let x = 0; x < Width; x++) {
                let DepthValue = DepthData[(y * Width + x) * 4] / 255.0; // Normalize depth value
                let WorldZ = calculateWorldZ(DepthValue);
                Row.push(WorldZ);
            }
            HeightMap.push(Row);
        }
    
        return HeightMap;
    }
}

function EnvironmentProber({originActor, landscape}={}){

    let World = GWorld;
    let PC = GetPC();

    //Converting this enum is non-trivial in js so we just have a direct reference instead
    const visibilityChannel = 'TraceTypeQuery1';

    function GetPC() {
        return GWorld.GetAllActorsOfClass(PlayerController).OutActors[0];
    }

    //Generic tracer from viewpoint
    function lineTraceFromPlayer(traceDistance = 1000){
        if (!PC) return 0.0;
    
        // Get the player's viewpoint
        
        let ViewLocation = new Vector();
        let ViewRotation = new Rotator();
        PC.GetPlayerViewPoint(ViewLocation, ViewRotation);

        // Define the start and end points of the trace
        let Start = ViewLocation;
        let End = Start.Add_VectorVector(ViewRotation.GetForwardVector().Multiply_VectorFloat(traceDistance));
        
        // Perform the line trace
        //let Result = originActor.LineTraceJs(Start, End); //backup method

        //Destructure out params, $ is generic return
        const {$:bHit, OutHit:Result} = World.LineTraceSingle(
            Start,
            End,
            visibilityChannel,
            false
        );

        originActor.DrawLine(Start,End, bHit);

        // If we hit something, return the distance to the hit
       if (bHit) {
            globalThis.dLastTraceResult = Result;
            
            let Distance = Result.Distance;
            
            return Distance;
        }
    
        // If no hit, return 0
        return 0.0;
    }

    //Example api:
    // from Player : probe.boxTrace({debugTraceType:"ForDuration"});
    // from origin : probe.boxTrace({start:Vector.MakeVector(0,0,0), boxRotation:Rotator.MakeRotator(0,45,0) debugTraceType:"ForDuration"});
    //NB set debugTraceType to "ForDuration" or "Persistent" to see the line traces
    function boxTrace({
        boxHalfSize,
        boxRotation,                //if not specified either origin or player rotation (see start)
        halfSizeDimension = 100,    //if boxHalfSize is not specified, we have a 1m cubed box
        start,                      //if not specified, will use player location
        end,                        //defaults to slightly offset from start
        debugTraceType = 'None' //default to no debugging
    }={}){
        if (!PC) return [];

        //if no box is passed in, make one from the halfsize dimension param, default 1m cube
        if(!boxHalfSize){
            boxHalfSize = Vector.MakeVector(halfSizeDimension, halfSizeDimension, halfSizeDimension);
        }
        
        // Get the player's viewpoint
        let pcViewLocation = new Vector();
        let pcViewRotation = new Rotator();
        PC.GetPlayerViewPoint(pcViewLocation, pcViewRotation);
        
        //if no rotation is specified, use pc view rotation
        if(!boxRotation){
            //no start point defined, wanting player pov
            if(!start){
                boxRotation = pcViewRotation;
            }
            //axis aligned default
            else{
                boxRotation = new Rotator();
            }
        }

        // Define the start and end points of the trace if not passed in as from player location
        if(!start)
        {
            start = pcViewLocation;
        }
        if(!end){
            //we offset the end just a tiny bit to go around a typical engine bug
            end = start.Add_VectorVector(boxRotation.GetForwardVector().Multiply_VectorFloat(0.01));
        }

        //debug colors, red = miss, green = hit
        const redColor = LinearColor.MakeColor(1,0,0,1);
        const greenColor = LinearColor.MakeColor(0,1,0,1);//new LinearColor();

        //Destructure out params to hit and results params
        //$ is generic return, OutHits is a parameter passed by reference
        const {$:hit, OutHits:results} = World.BoxTraceMulti(
            start,
            end,
            boxHalfSize,
            boxRotation,
            visibilityChannel,
            false,
            undefined,
            debugTraceType,
            [], //this is OutHits param position, needs to be an array but it's ignored and destructured out
            true,
            redColor,
            greenColor,
            5.0
        );

        //check the returned boolean result destructured from $
        console.log('did we hit?', hit);

        //Loop through each result and output the hit actor name
        results.forEach(result =>{
            console.log(result.HitObjectHandle.Actor.GetDisplayName());
        });

        //For Mason: some helpful hints below

        //results is an array of HitResult
        //results[0].HitObjectHandle.Actor.GetDisplayName() //would return actor name

        //expose the results to our Js console for object inspection
        //globalThis.results = results;
        
        //log the resulting object via inspection
        //logObj(results);
        return results;
    }

    function lineTraceHeightAtLocation(startLocation, {
        traceDistance = 50000,
        downVector=undefined,
        debugLineTrace=false,
        detailHit
    }={}){
        if(downVector==undefined){
            downVector = new Vector();
            downVector.Z = -1;
        }
        if(startLocation==undefined){
            const ViewLocation = new Vector();
            const ViewRotation = new Rotator();
            PC.GetPlayerViewPoint(ViewLocation, ViewRotation);
            startLocation = ViewLocation;
        }

        const upVector = new Vector();
        upVector.Z = traceDistance/2;

        const Start = startLocation.Add_VectorVector(upVector);
        const End = Start.Add_VectorVector(downVector.Multiply_VectorFloat(traceDistance));
        const {$:bHit, OutHit:Result} = World.LineTraceSingle(
            Start,
            End,
            visibilityChannel,
            false
        );

        // const Params = new CollisionQueryBPParams();
        // Params.bTraceComplex = false;
        // Params.bReturnPhysicalMaterial = true;
        // Params.TraceChannel = visibilityChannel;
        // World.LineTraceSingleWithParams(Start, End, Params);

        // If we hit something, return the distance to the hit
        if (bHit) {
            if(debugLineTrace){
                originActor.DrawLine(Start, Result.Location, bHit);
            }
            if(detailHit){
                const hitActorName = Result.HitObjectHandle.ReferenceObject.GetName();
                const hitLandscape = hitActorName.startsWith('Landscape');
                const hitVoxel = hitActorName.startsWith('VoxelCollisionComponent');
                
                detailHit.hitLandscape = hitLandscape;
                detailHit.hitVoxel = hitVoxel;
                
            }

            let Distance = Result.Location.Z;//Start.Subtract_VectorVector(Result.Location).VSize();
            //console.log(`Hit object: ${Result} at distance: ${Distance}, height: ${Result.Location.Z}`);
            return Distance;
        }

        if(debugLineTrace){
            originActor.DrawLine(Start,End, bHit);
        }

        return 0.0;
    }

    function heightAdjustTransforms(transforms,{traceOptions={}}={}){
        return transforms.map(transform=>{
            const location = transform.Translation;
            const height = lineTraceHeightAtLocation(location, traceOptions);
            transform.Translation.Z = height;
            return transform;
        });
    }

    function heightAdjustCells(cells,{traceOptions={}}={}){
        cells = cells.map(cell=>{
            return heightAdjustTransforms(cell, {traceOptions});
        });
        return cells;
    }

    return Object.freeze({
        lineTraceHeightAtLocation,
        lineTraceFromPlayer,
        heightAdjustCells,
        heightAdjustTransforms,
        boxTrace,
        GetPC,
    });
}

exports.EnvironmentProber = EnvironmentProber;