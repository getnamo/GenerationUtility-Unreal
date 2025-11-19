const { 
	logObj,
	ArrayMap,
	randomItem,
	randomStream,
	sampleUniqueIndices,
	makeTransform,
    shiftT,
	makeVector,
	debugPoint,
	quadrilateralArea,
} = require('GenerationUtility/utility/objectUtility.js');
const { spawnActorFromBp } = require('GenerationUtility/utility/actorUtility.js');


//very much a wip
function VoxelOperations(omap, splineOps, probe){
    const stampActorBp = omap.VoxelStampActorBp;
    
    //Some useful defaults
    const origin = new Transform();
	let transform = new Transform();

    //C++ class
    function makeVoxelStampActor(transform = origin){
        const actor = new VoxelStampActor(GWorld, transform.Translation, Quat.Quat_Rotator(transform.Rotation));
        return actor;
    }

    //BP class if we fail converting
    function makeVoxelStampActorBp(transform){
        /** @type {Actor} */
        const stampActor = spawnActorFromBp(stampActorBp, transform);
        stampActor.K2_SetActorTransform(transform);
        return stampActor;
    }

    function setBlendMode(stampComponent, mode = 'Additive'){
        /** @type {VoxelVolumeStampRef} */
        const volumeStampRef = stampComponent.GetStamp().CastToVolumeStamp().$;
        volumeStampRef.SetBlendMode(volumeStampRef, mode);
    }
    function setMesh(stampComponent, mesh){
        /** @type {VoxelMeshStampRef} */
        const meshStampRef = stampComponent.GetStamp().CastToMeshStamp().$;
        meshStampRef.SetNewMesh(mesh);
    }
    function digInDirection(loc={Z:-1}, {iterations = 3, scale = 500} = {}){
        loc = Vector.Multiply_VectorFloat(loc, scale);
        for(let i = 0;i<iterations;i++){
            transform = shiftT(transform, {rot:{Pitch:0}, loc});
            /** @type {VoxelStampComponent} */
            const stampComponent = makeVoxelStampActorBp(transform).VoxelStamp;

            //VoxelStampActor

            // setBlendMode(stampComponent, 'Additive');
            setBlendMode(stampComponent, 'Subtractive');
        }
    }

    function makeMeshStamp(transform, {mesh = omap.VSM_CanyonRock5, blendMode = 'Additive'}={}){
        /** @type {Actor} */
        const actor = makeVoxelStampActorBp(transform);

        const stampRef = new VoxelMeshStampRef();
        stampRef.SetBlendMode(stampRef, blendMode);
        actor.SetNewStamp(stampRef);
        actor.SetNewMesh(mesh);

        return actor;
    }

    function makeMountainStamp(transform, {
        heightmap = omap.VLH_Mountain1,
        blendMode = 'Max', 
        uniformScale=1,
        priority=1
    }={}){

        if(uniformScale != 1){
            transform = shiftT(transform, {scale:{X:uniformScale,Y:uniformScale,Z:uniformScale}})
        }
        /** @type {Actor} */
        const actor = makeVoxelStampActorBp(transform);

        const stampRef = new VoxelHeightmapStampRef();
        stampRef.SetPriority(stampRef, priority);
        stampRef.SetBlendMode(stampRef, blendMode);
        actor.SetNewStamp(stampRef);

        //assign heightmap
        actor.SetNewHeightmap(heightmap);
    }

    function makeHeightGraphStamp(transform, {
        graph= omap.VHG_FlattenArea,
        blendMode = 'Override',
        priority = 1,
        params = {},
    }={}){
        /** @type {Actor} */
        const actor = makeVoxelStampActorBp(transform);
        const stampRef = new VoxelHeightGraphStampRef();
        stampRef.SetBlendMode(stampRef, blendMode);
        stampRef.SetGraph(stampRef, graph);
        stampRef.SetPriority(stampRef, priority);
        actor.SetNewStamp(stampRef);

        Object.keys(params).forEach(key=>{
            const value = params[key];
            //stampRef.K2_SetVoxelHeightGraphParameter(key, value);
            actor.SetGraphParameter(key, value);
        });
        return actor;
    }


    //Tests
    function digTest(){
        transform = new Transform();

        digInDirection({Z:-1});

        //rotate test
        transform = Transform.ComposeTransforms(makeTransform({rot:{Pitch:90}}), transform);
        // transform = shiftT(transform, {});
        digInDirection({X:1});
    }

    function heightMapTest(){

        transform = origin;
        transform = shiftT(transform, {loc:{X:20000, Z:5000}})

        //makeMeshStamp(transform, {blendMode:'Subtractive'});

        // makeMountainStamp(transform, {uniformScale:0.5, priority:5, heightmap: omap.VLH_Mountain1});
        // makeMountainStamp(shiftT(transform, {loc:{X:-50000}}), {uniformScale:0.8, priority:6, heightmap: omap.VLH_Mountain2});

        //Canyon from heightmap
        // transform = shiftT(transform, {loc:{Z:-10000}});
        // makeMountainStamp(transform, {uniformScale:-0.4, blendMode:'Min', priority:5});

        // transform = shiftT(transform, {loc:{X:40000, Y: 20000}});
        // makeMountainStamp(transform, {uniformScale:-0.4, blendMode:'Min', priority:3});

        // transform = shiftT(transform, {loc:{Z:3000}});
        const actor = makeHeightGraphStamp(transform, {priority:10, params:{
            'Sphere Radius':5000,
            // 'Shape': 1,   //box think enums are bytes...
            // 'Box Extents':5000
        }});

        //globalThis.dStamp = stampComponent;
        // globalThis.dMesh = omap.VSM_CanyonRock3;
        
        
        //const heightStamp = omap.VLH_AlpineMountain;

        //VoxelHeightmap
        //VoxelGraph
    }




    return Object.freeze({
        makeVoxelStampActor,
        makeVoxelStampActorBp,
        setBlendMode,
        setMesh,
        digInDirection,
        makeMeshStamp,
        makeMountainStamp,
        makeHeightGraphStamp,
        heightMapTest
    });
}

exports.VoxelOperations = VoxelOperations;