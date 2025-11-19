/// <reference path="../../typings/gu.d.ts" />

const { inspect,
    uclass, 
	tryLog,
    logObj,
    uScale,
	scaleVector,
	worldTransform,
	makeVector,
	copyVector,
	shiftT,
	ArrayMap,
	randomItem,
	randomStream,
	randomVector,
	randomName,
	makeTransform,
	copyTransform,
    customTimeout,
    logIfEnabled,
	debugDrawText,
	setArrayFromTransform } = require('GenerationUtility/utility/objectUtility.js');
const { spawnActor } = require('GenerationUtility/utility/actorUtility.js');
const { armyPositions } = require('GenerationUtility/modules/formations.js');
const { planComposer, JsPlanProcessor } = require('GenerationUtility/modules/planOperations.js');

//consistent key for esm/staticmesh key pairing
function esmMeshKey(esmActor, key){
    return esmActor.GetName() + '-' + key.GetName();
}

exports.esmMeshKey = esmMeshKey;

function ProcgenOperations({
    splineOps,
    blockOps,
    probe,
    voxelOps,
    layoutOps,
    omap,
    cmap,
    importDataRootPath = 'Content/Scripts/Data',
    scheduleLoggingEnabled = false,
    procgenSeed = 'l33t',
    generateNpcForUid = undefined,
}={}){

    //Main arraymap
    let map = new ArrayMap();
    const timers = customTimeout();

    /** @type {CUFileSubsystem} */
    const fileSubsystem = GUBlueprintLibrary.GetEngineSubsystem(CUFileSubsystem);
    const dataDirectory = 'Plugins/Getnamo/GenerationUtility-Unreal/Content/Scripts/Data/';

    const entityTravelData = this.entityTravelData =  {
        entityKeymap : {
            map:{},
             spawned: false
        },
        updateDynamic : false
    }

    const entityGroupMeta = {};

    //convenience reader
    function readJsonFile(fileName, category = 'names'){
        const fullPath = fileSubsystem.ProjectDirectory() + dataDirectory + '/' + category + '/' + fileName + '.json';
        const fileContents = fileSubsystem.ReadStringFromFile(fullPath);//.trim();
        try{
            return JSON.parse(fileContents);
        }
        catch(e){
            return undefined;
        }
    }

    //read files once on init
    const maleFirstNames = readJsonFile('maleFirst');
    const femaleFirstNames = readJsonFile('femaleFirst');
    const familyNames = readJsonFile('family');
    const placeRootNames = readJsonFile('placeRoot');
    const placeSuffixNames = readJsonFile('placeSuffix');

    function randomPlaceName(nameRand = Math.random){
        randomName(placeRootNames, {list2:placeSuffixNames, addSpace:false}, nameRand);
    }
    function randomCharacterName({genderIsFemale = true, rand = Math.random}={}){
        let first = '';
        let last = randomName(familyNames, rand);
        if(genderIsFemale){
            first = randomName(femaleFirstNames, rand);
        }
        else{
            first = randomName(maleFirstNames, rand)
        }

        //console.log('generated: ', first, last);

        return {first, last};
    }


    //schedule log
    let slog = logIfEnabled(scheduleLoggingEnabled);
    let silog = logIfEnabled(scheduleLoggingEnabled);   //individual schedule logging checks
    

    const callbacks = {

        //called per ISM so you can handle tick behavior
        onTargetsReached : (key, reachedCount, esmActor)=>{
            //console.log('target reached!');

            let checkCount = 0;

            const meta = entityGroupMeta[esmMeshKey(esmActor, key)];
            if(meta){
                checkCount = meta.scheduledCount;
            }
            slog(`${reachedCount} targets reached.`);
            
            const followSchedule = true;
    
            if(followSchedule){
                
                //This set is the unchecked set of reached indices (that are still valid)
                //NB convert to a set to convert m*n complexity to m+n
                const reachedSet = new Set(esmActor.GetReachedInstanceIdsSinceLastCheck(key));
    
                slog('Recently reached: ', Array.from(reachedSet));
                
                //We're only interested in one entity for this early test
                //Use optimal set check vs loop through
    
                const checkEntity = (entityId)=>{
                    //enable log only for this npc
                    //silog = logIfEnabled(true);

                    silog('checking entity', entityId, 'for esmKey', esmMeshKey(esmActor, key));
    
                    /** @type {EntityPlanTrack} */
                    const scheduleTrack = esmActor.PlanningSystem.GetScheduleTrack();
    
                    const entityReached = esmActor.DidInstanceReachTarget(key, entityId);
                    //TODO: convert action checks to plan checks
                    const currentAction = scheduleTrack.CurrentActionTypeForEntity(entityId);
                    silog(`Current action: ${currentAction} for ${entityId}`);
    
                    const validActionType = currentAction == 'Travel' || currentAction == 'Idle';
    
                    if(entityReached){
                        silog(`entity ${entityId} done, moving to next schedule action`);
                        
                        scheduleTrack.DefaultPlanProcessor.ProcessNextActionForEntity(entityId);
                    }
                }
                
                for(let i=0;i<checkCount;i++){
                    //use a set check to see if we need to run check entity
                    if(reachedSet.has(i)){
                        checkEntity(i);
                    }
                }
            }
        }
    };

    //UTILITY SECTION
    function combineToSingle729Float(x, y, z) {
        // Ensure x, y, z are integers from 0 to 9
        x = Math.floor(x) % 10;
        y = Math.floor(y) % 10;
        z = Math.floor(z) % 10;
    
        const combined = parseFloat(`0.${x}${y}${z}`);
        return combined;
    }
    
    //this is the more efficient packing format
    function packRGBtoFloat(r, g, b) {
        // Clamp to 0–255 range
        r = Math.min(255, Math.max(0, r));
        g = Math.min(255, Math.max(0, g));
        b = Math.min(255, Math.max(0, b));
    
        // Combine into a 24-bit integer: R in upper 8, G in middle, B in lower
        const packedInt = (r << 16) | (g << 8) | b;
    
        // Normalize to float: scale to 0.0–1.0 range of a 24-bit int
        const packedFloat = packedInt / 16777215; // 2^24 - 1
    
        return packedFloat;
    }
    
    function packRandColorToFloat(randFunction){
        return packRGBtoFloat(randFunction()*255, randFunction()*255, randFunction()*255);
    }
    
    //more efficient packing
    
    //NB: Shader code (HLSL used in M_UnpackFloatTo24bit3)
    // float3 UnpackRGB(float packed) {
    //     // Multiply to restore 24-bit int range
    //     float value = packed * 16777215.0;
    
    //     float r = floor(value / 65536.0);               // Extract R
    //     float g = floor((value - r * 65536.0) / 256.0); // Extract G
    //     float b = value - r * 65536.0 - g * 256.0;      // Extract B
    
    //     return float3(r, g, b) / 255.0; // Normalize to 0–1
    // }

    const medievalColors = [
        "#3B5BA1", // Woad Blue
        "#912F2F", // Madder Red
        "#5C3A21", // Walnut Brown
        "#8C9C68", // Sage Green
        // "#5E2A77", // Tyrian Purple
        "#C8A046", // Ochre Yellow
        "#1C1C1C", // Iron Black
        "#A45729", // Rust Orange
        "#A8A09E", // Undyed Wool (Natural Gray)
        "#7B3F00"  // Chestnut
    ];

    const skinTones = [
        "#F9D7C3", // Very fair
        "#F1C27D", // Light
        "#E0AC69", // Light-medium
        "#C68642", // Medium
        "#8D5524", // Medium-dark
        "#7D4E2D", // Deep brown
        "#5C4033", // Dark brown
        "#3D2B1F", // Very dark
        "#A9746E", // Warm olive
        "#B87D5B"  // Reddish bronze
    ];

    const hairColors = [
        "#F5E2B8", // Light Blonde
        "#E6C98D", // Dark Blonde
        "#C19A6B", // Light Brown
        "#8B5A2B", // Medium Brown
        "#5C4033", // Dark Brown
        "#A52A2A", // Auburn
        "#B55239", // Copper Red
        "#3B2F2F", // Soft Black
        "#1C1C1C", // Jet Black
        "#B7A99A"  // Natural Gray
    ];

    //convenient format to copy to hex
    function packHexToFloat(hex) {
        // Remove '#' if present
        if (hex.startsWith('#')) hex = hex.slice(1);

        // Expand shorthand (e.g. "f80" → "ff8800")
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }

        if (hex.length !== 6) {
            throw new Error("Invalid hex color format.");
        }

        // Parse RGB values
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);

        // Combine into 24-bit int and normalize
        const packedInt = (r << 16) | (g << 8) | b;
        const packedFloat = packedInt / 16777215;

        return packedFloat;
    }

    function randomMedievalColor(rand = Math.random){
        return packHexToFloat(randomItem(medievalColors, rand));
    }

    function randomSkinTone(rand = Math.random){
        return packHexToFloat(randomItem(skinTones, rand));
    }

    function randomHairColor(rand = Math.random){
        return packHexToFloat(randomItem(hairColors, rand));
    }

    //Esm spawning
    const spawnEsmActor = ({instanceInteractable = false, targetReachedCallback}={})=>{
        const newEsmActor = new EntitySpawningManagerActor(GWorld, {}, {});

        //bind default callback
        if (!targetReachedCallback){
            targetReachedCallback = (mesh, count) =>{
                callbacks.onTargetsReached(mesh, count, newEsmActor);
            };
        }
        newEsmActor.OnTargetsReached = targetReachedCallback;

        newEsmActor.Settings.bEnableInstanceInteraction = instanceInteractable;
        return newEsmActor;
    }

    //#WORLDGEN SECTION

    //Make a village from an import map.
    //NB: if map isn't specified (ArrayMap type), then it will make an esmactor and spawn immediately
    function makeVillage({
        layoutImportName='villageForestTree', 
        makeFields=false,
        flattenTerrain=false,   //typically handled by the spawners themselves
        makeRoadNetwork=true,
        transform = new Transform(),
        extra = {},
        map,
        esmActor = spawnEsmActor(),
        outputSpawningStats = false,
        biomeExclusionMeta = omap.BiomeExclusionZoneMetaData
    }={}) {
        let generateImmediately = false;

        //if we didn't specify a map, each village should be uniquely spawned
        if(!map){
            map = new ArrayMap();
            generateImmediately = true;
        }

        map = layoutOps.villageImportMap({
            seed: 'l33tes',
            villageTransform:transform,
            map,
            makeRoadNetwork,	//needed for scheduling
            makeFields,
            shopCount:4,
            innCount:2,
            layoutImportName,
            layoutImportDirectory: importDataRootPath + '/villages',
            extra
        });

        //example pullout of roadnetwork data
        //logObj(extra.roadNetwork.vertices.length, "roadnetwork Graph");

        // Optional: Add a central feature (e.g., a town square or church)
        // const centerPoint = {X: -20000, Y: -20000, Z: 0};
        // const centralFeature = omap.Church01; // Assuming you have a church asset
        // map.addValue(centralFeature, makeTransform({loc: centerPoint}));
        if(flattenTerrain){
            //Todo: adjust the flatten by actual size of village

            const actor = voxelOps.makeHeightGraphStamp(transform, {priority:10, params:{
                'Sphere Radius':48000,
                'Falloff':15000,
                // 'Shape': 1,   //box think enums are bytes...
                // 'Box Extents':5000
            }});

            //exclude biome from this area
            if(biomeExclusionMeta){
                actor.SetFloatMetaData(biomeExclusionMeta, 1);
            }
        }

        if(generateImmediately){
            map.forEach((transforms, key)=>{
                esmActor.SetISMTransforms(key, transforms, 'Static', 'QueryAndPhysics');

                if(outputSpawningStats){
                    console.log('Village Static Transforms: ', transforms.length);
                }
            });
        }
        return esmActor;
    }

    function makeDungeon({
        transform = new Transform(),
        dungeonClass = undefined,
        boxExtents={
            X:5271.256942,
            Y:7099.405721,
            Z:1580.0
        },
        floors=2,
        dungeonSize= {X:11,Y:14},
        // initialSeed=776,
        initialSeed=777,
        entrance={
            location:{
                X:1,
                Y:6
            },
            floor:2
        },
        startInteriorGeneration=true,
        demoMode=false,
        roomDataCallback=undefined,
        flattenTerrain = true,
        spawnEnemies = true,
        placeOutdoorKeep = false,
        placeInteriorVolume = true,
        interiorVolumeClass,
        dungeonEsmActor = undefined,
        enemySpawnRoomTypes = ['Barracks', 'Storage'],
        // enemySpawnRoomTypes = ['Hallway'],
        enemyTypes=['Skeleton', 'Ork'],
        // enemyTypes=['Ork'],
        enemyTypeSeed = 'l33t',
        biomeExclusionMeta = omap.BiomeExclusionZoneMetaData,
        keepMesh = omap.SM_MergedKeep,
        logSpawning = false,
        validEnemies = {},
        roomMetaCallback = ()=>{},
    }={}){

        if(!dungeonClass){
            return;
        }

        const dlog = logIfEnabled(logSpawning);

        if(!dungeonEsmActor){
            //unique per dungeon if not specified
            dungeonEsmActor = spawnEsmActor();
        }

        //Default for floor Z
        transform.Translation.Z += 899.311838;

        if(!roomDataCallback){
            roomDataCallback = roomData => {
                //first do a callback to modify the data if needed:
                const modifiedData = roomMetaCallback(roomData);

                //todo: use modified data to exclude spawns (e.g. for spawning item markers)
                //these can then be used to offset the npc spawns

                // logObj(roomData, 'room data: ');
                const dungeonSpawnArrayMap = new ArrayMap();
                
                let rand = randomStream(enemyTypeSeed);

                //logObj(roomData, 'room data:');

                roomData.forEach((floor, i) =>{
                    floor.data.forEach((room, j) =>{
                        //console.log(`floor ${i} room ${j}`);
                        dlog(`floor ${i} room ${j} is type ${room.Utility}`);
                        const extents = room.RoomExtents[0];

                        if(!extents || !enemySpawnRoomTypes){
                            return;	//skip
                        }
                        
                        //logObj(extents, 'extents');

                        //This is needed for debug mode in dev dunno why //PCGPartitionActor
                        let min = extents.Min;
                        let max = extents.Max;

                        if(extents.min){
                            min = extents.min;
                            max = extents.max;
                        }
                        
                        //floor center
                        const spawnCenter = Vector.MakeVector(
                            min.X,// + (extents.Max.X/2),
                            min.Y,// + (extents.Max.Y/2),
                            min.Z - (max.Z));
                        
                        if(spawnEnemies){
                            //only primary utility is used to check for now
                            const roomType = room.Utility[0];

                            dlog('spawn check...')
                            dlog('types desired', enemySpawnRoomTypes);
                            dlog('room type: ', room.Utility);

                            const isEnemyRoom = enemySpawnRoomTypes.includes(roomType);

                            if(isEnemyRoom){
                                //logObj(spawnCenter, 'I should spawn enemies at ');

                                const type = randomItem(enemyTypes, rand);
                                dungeonSpawnArrayMap.addValue(type, spawnCenter);
                                
                            }
                        }
                    });
                });

                //logObj(dungeonSpawnPoints)
                if(spawnEnemies){
                    dungeonSpawnArrayMap.forEach((spawnCenter, type)=>{
                        makeEnemies({
                            enemyEsmActor: dungeonEsmActor,
                            customSpawnPoints:spawnCenter,
                            nearFieldSwapDistance:2500,
                            maxPoolSize:5,
                            entityType:validEnemies[type].entityType,
                            nearFieldClass: validEnemies[type].nearFieldClass
                        });
                    });
                }
            }
        }

        /** @type {Actor} */
        const dungeon = spawnActor(dungeonClass, transform); 

        //Set defaults
        dungeon.Enabled = true;
        dungeon.BoxExtents = boxExtents;
        dungeon.Floors = floors;
        dungeon.DungeonSizeX = dungeonSize.X;
        dungeon.DungeonSizeY = dungeonSize.Y;
        dungeon.RandomStream.InitialSeed = initialSeed;
        dungeon.Entrances = [({
            EntranceLocations:entrance.location,
            Floor:entrance.floor
        })];
        dungeon.DemoMode = demoMode;

        dungeon.K2_SetActorTransform(transform);

        //callback and handle generation complete callbacks
        dungeon.OnGenerationComplete = (layers) => {
            tryLog(()=>{
                console.log(`Dungeon Generation complete with ${layers.length} floors.`);
                //globalThis.dLayers = layers;

                //feedback the room data for spawning
                const roomData = layers.map((layer, i)=>{
                    return {
                        data:layer.RoomData,
                        floor:i
                    }
                });
                roomDataCallback(roomData);
            });
        };

        //kick off the generationw
        if(startInteriorGeneration){
            dungeon.BeginWork();
        }

        if(placeInteriorVolume){
            /** @type {Actor} */
            const stampActor =  spawnActor(interiorVolumeClass, transform);
        }

        //place the outdoor keep
        // placeOutdoorKeep = false;
        if(placeOutdoorKeep){
            const relativeTransform = makeTransform({loc:{X:4708.361651, Y:-649.35774, Z: -911.311838}});
            const keepTransform = Transform.ComposeTransforms(relativeTransform, transform);

            const actor = new StaticMeshActor(GWorld, keepTransform.Translation, Quat.Quat_Rotator(keepTransform.Rotation));
            
            actor.StaticMeshComponent.StaticMesh = keepMesh;
            actor.StaticMeshComponent.SetMobility('Stationary');
            actor.StaticMeshComponent.SetMobility('Static');
        }

        if(flattenTerrain){
            transform.Scale3D.X = 1;
            transform.Scale3D.Y = 1;
            transform.Scale3D.Z = 1;
            transform.Translation.Z -= 900;
            const actor = voxelOps.makeHeightGraphStamp(transform, {priority:20, params:{
                'Sphere Radius':30000,
                'Falloff':15000,
                'Shape': 1,   //box enums are bytes...
                'Box Extents':30000
            }});

            //exclude biome from this area
            if(biomeExclusionMeta){
                actor.SetFloatMetaData(omap.BiomeExclusionZoneMetaData, 1);   
            }
        }
    };


    //#ENTITY SECTION
    const ValidDungeonClass = {};

    function makeEnemies({
        enemyEsmActor = undefined,
        entityType = omap.enemyMesh,
        nearFieldClass = cmap.Enemy_C,
        offset = {Y:-1000},
        nearFieldSwapDistance= 1500,
        count = 2,
        maxPoolSize = 1,
        moveTowardsPlayerAsTarget = false,
        customSpawnPoints = undefined,
        outData,
    }={}){

        const key = entityType;
        const collisionState = 'NoCollision';
        // const collisionState = 'QueryAndPhysics';

        const transforms = [];
        const initialTargets = [];
        const customFloats = [];
        const numCustomFloats = 2;
        const defaultCustomValue = 0;	//idle

        //Spawn an esm just for this enemy setup
        if(!enemyEsmActor){
            /** @type {EntitySpawningManagerActor} */
            enemyEsmActor = spawnEsmActor();
        }

        //Grab player info
        const targetCenter = {X:0, Y:0}
        if(moveTowardsPlayerAsTarget){
            const PC = probe.GetPC();
            const ViewLocation = new Vector();
            const ViewRotation = new Rotator();
            PC.GetPlayerViewPoint(ViewLocation, ViewRotation);
            
            targetCenter.X = ViewLocation.X;
            targetCenter.Y = ViewLocation.Y;
        }

        //just spawn at desired positions
        if(customSpawnPoints){
            //assumes vector array
            customSpawnPoints.forEach((point,i) =>{
                initialTargets.push(point);
                transforms.push(makeTransform({loc:point}));
                customFloats.push(defaultCustomValue);	//anim state
                customFloats.push(0);		
            });
        }

        else{
            //Basic square formation
            for(let i=0; i<count; i++){
                for(let j=0; j<count; j++){
                    const initialPosition = {X:i*100, Y: offset.Y + j*100};
                    const finalTarget = {
                        X:targetCenter.X + (i*50 - (count*25)),
                        Y:targetCenter.Y + (j*50 - (count*25)),
                    }

                    if(!moveTowardsPlayerAsTarget){
                        finalTarget.X += initialPosition.X;
                        finalTarget.Y += initialPosition.Y;
                    }

                    initialTargets.push(makeVector(finalTarget));
                    //initialTargets.push(ViewLocation);	//make em chase your last location

                    transforms.push(makeTransform({loc:initialPosition}));
                    customFloats.push(defaultCustomValue);	//anim state
                    customFloats.push(0);					//override anim (for death state)
                }
            }
        }

        enemyEsmActor.SetISMTransforms(key, transforms, 'Movable', collisionState);//QueryAndPhysics/NoCollision
        enemyEsmActor.SetISMCustomFloats(key, customFloats, numCustomFloats, true, true);

        //This is needed for nearfield info to be accepted otherwise we're missing TargetData struct
        //for key
        enemyEsmActor.SetISMMovementBatchTargetData(key, initialTargets);

        //Now make it nearfield swappable
        const nearFieldInfo = new NearFieldDynamicInfo();
        nearFieldInfo.bNearFieldSwapEnabled = true;
        // nearFieldInfo.NearFieldSwapDistance = 1500;
        nearFieldInfo.NearFieldSwapDistance = nearFieldSwapDistance;	//for quick tests we use smaller values
        nearFieldInfo.SwapPool.MaxPoolSize = maxPoolSize;
        nearFieldInfo.SwapPool.PooledActorClass = nearFieldClass; //needs
        nearFieldInfo.SwapPool.bAutoShrinkSlackSize = maxPoolSize/2;
        nearFieldInfo.SwapPool.ActorOffset = makeTransform({loc:{Z:90}, rot:{Yaw:90}});

        enemyEsmActor.SetDynamicNearFieldSettings(key, nearFieldInfo);

        /*
        - NB: SetISMMovementBatchTargetData needs to be set for given key before SetDynamicNearFieldSettings can be set
        - Todo: fix 'dead' state spawning, by caching our dead bone positions and reloading them on nearfield swap.
        */

        //modify local data instead if we don't want to customize behavior
        if(!outData){
            outData = entityTravelData
        }
        outData.entityKeymap.spawned = true;
        outData.updateDynamic = true;

        //We add these so that our enemies can travel in the tick forward
        const mapKey = esmMeshKey(enemyEsmActor, key);

        outData.entityKeymap.map[mapKey] = {
            key,
            esmActor:enemyEsmActor
        };
    }

    function makeNpcs({
        esmActor=undefined,
        entityType=omap.npcMesh,
        nearFieldClass=cmap.Npc_C,
        shouldNearFieldSwap = true,
        spawnRadius = 10000,
        transform = new Transform(),
        count = 1,
        spawnInArmyPositions = true,
        positionSeed = 'l33t',
        clothingSeed = '3l33t',
        collisionState = 'NoCollision', //'QueryAndPhysics'
        customization = {
            customizeSkinColor : true,
            customizeHairColor : true,
            customizeClothing1 : false,	//dress/top
            customizeClothing2 : true,	//apron/bottom
        },
        idOffset = 0,           //this is UID offset to match them with your desired npcs
        outData,
        walkOffset = makeVector(),
        // walkOffset = makeVector({Y:1000}),
        dbUpdateCallback = ()=>{},
        }={}){

        if(!esmActor){
            esmActor = spawnEsmActor();
        }

        //const npcGridSize = 7000;
        let positions = [];
        if(spawnInArmyPositions){
            //NB: army positions should support rotational offsets too...
            positions = armyPositions(count);
        }
        else{
            //random positions within grid
            let rand = randomStream(positionSeed);
            for(let i=0;i<count;i++){
                const randomPosition = randomVector({radius:spawnRadius, clampZ:true}, rand);
                positions.push(randomPosition);
            }
        }

        //remap positions to a transform (todo: proper facing offset)
        const transforms = positions.map(position => {
            return Transform.ComposeTransforms(transform, makeTransform({loc:position}));
        });

        //remap the positions back with a target offset
        const targets = transforms.map(gridTransform => Vector.Add_VectorVector(gridTransform.Translation, walkOffset));

        let customFloatNum = 1
        let movementCustomFloat = 1;
        let walkMultiplier = 1;
        let shouldVaryWalk = 0;
        const isNPCWithClothing = true;
        
        walkMultiplier = 1;
        customFloatNum = 1;
        if(isNPCWithClothing){
            customFloatNum = 5;
        }

        let clothingRand = randomStream(clothingSeed);
        const key = entityType;
        const customData = [];
        const uids = [];

        let generatedCount = 0;

        //Link custom data for these npcs
        const total = positions.length;
        for (let i=0; i<total;i++){
            
            //with the offset this is now a proper uid
            const uid = i + idOffset;
            uids.push(uid);

            movementCustomFloat = 1;

            customData.push(movementCustomFloat);

            //Rand color test?
            if(isNPCWithClothing){

                //let packedColor = 0;
                // packedColor = packRGBtoFloat(255,0,0);
                //packedColor = packRandColorToFloat(rand);

                // packedColor = packHexToFloat('#ff3300');
                // packedColor = packHexToFloat('#00ff00');
                // packedColor = packHexToFloat('#0000ff');

                const skinColor = customization.customizeSkinColor? randomSkinTone(clothingRand) :  packHexToFloat('#E0AC69');
                const hairColor = customization.customizeHairColor? randomHairColor(clothingRand) : packHexToFloat('#5C4033');
                const clothing1Color = customization.customizeClothing1? randomMedievalColor(clothingRand) : packHexToFloat('#5C3A21');
                const clothing2Color = customization.customizeClothing2? randomMedievalColor(clothingRand) : packHexToFloat('#A8A09E');

                customData.push(skinColor);
                customData.push(hairColor);
                customData.push(clothing1Color);
                customData.push(clothing2Color);

                //ensure we have this character before we set customizations
                dbUpdateCallback({
                    uid,
                    instanceId:i,
                    esmActor,
                    key,
                    customizations: [skinColor, hairColor, clothing1Color, clothing2Color]
                });
                generatedCount++;
            }

            //debug index
            // let copyTarget = transforms[i].Translation.clone();
            // copyTarget.Z += 200;
            // debugDrawText(`<${i}>`, copyTarget, {duration:5});
        }

        //console.log('NPCs Transforms: ', transforms.length);

        esmActor.SetISMTransforms(key, transforms, 'Movable', collisionState);//QueryAndPhysics/NoCollision
        esmActor.SetISMCustomFloats(key, customData, customFloatNum, true, true);

        //Critical during nearfield swap setup, both creates the specialized data and Uids link and targets
        esmActor.SetISMMovementBatchTargetData(key, targets, uids);

        if(shouldNearFieldSwap && nearFieldClass != undefined){
            //adjust common data to test much larger actor counts
            const nearFieldInfo = new NearFieldDynamicInfo();
            nearFieldInfo.bNearFieldSwapEnabled = true;
            nearFieldInfo.NearFieldSwapDistance = 2000;
            nearFieldInfo.SwapPool.MaxPoolSize = 10;
            nearFieldInfo.SwapPool.PooledActorClass = nearFieldClass;
            nearFieldInfo.SwapPool.bAutoShrinkSlackSize = 5;
            nearFieldInfo.SwapPool.ActorOffset = makeTransform({loc:{Z:90}, rot:{Yaw:90}});
            
            esmActor.SetDynamicNearFieldSettings(key, nearFieldInfo); //This has distance issues
        }
        entityTravelData.updateDynamic = true;

        if(!outData){
            outData = entityTravelData
        }
        outData.entityKeymap.spawned = true;
        outData.updateDynamic = true;

        //We add these so that our enemies can travel in the tick forward
        const mapKey = esmMeshKey(esmActor, key);

        outData.entityKeymap.map[mapKey] = {
            key,
            esmActor
        };

        return {esmActor, generatedCount};
    }

    //not sure if these are needed but...
    const planProcessors = {};

    function setupScheduleProcessingForEsm(esmActor, key){
        //depends on esmActor, ticked timers, and this.key groupMeshKey
        const planProcessor = planProcessors[esmMeshKey(esmActor, key)] = new JsPlanProcessor(esmActor, timers, {
            //loggingEnabled:true,
            groupMeshKey:key,
        });

        //const scheduleTrack = esmActor.PlanningSystem.GetScheduleTrack();
        //scheduleTrack.SetDefaultProcessor(planProcessor);

        return planProcessor
    }

    /**
     * Appends a schedule for a given
     * @param {EntitySpawningManagerActor} esmActor 
     * @param {StaticMesh} key 
     * @param {Object} housingExtra - has the housing info 
     * @returns 
     */
    function addVillageScheduleToNpcs(esmActor, key, housingExtra, {
        planArray = [
            'goToFast:home', 
            `wait:${10}`,
            'pathTo:inn',
            'wait:20',
            'pathTo:shop',
            'wait:10',
            'pathTo:home'
        ],
        residents = -1,
        scheduleLoggingEnabled = false,
        idOffset = 0,
    }={}){
        const meshKey = esmMeshKey(esmActor, key);
        if(!planProcessors[meshKey]){
           setupScheduleProcessingForEsm(esmActor, key);
        }

        //scheduleLoggingEnabled = true;

		console.log('addVillageScheduleToNpcs village Start');

		//Grab the schedule track
        /** @type {EntityPlanTrack} */
		const scheduleTrack = esmActor.PlanningSystem.GetScheduleTrack();

		//debug logging, tie to schedule logging
		const dlog = logIfEnabled(scheduleLoggingEnabled);
		
		//swap for saving
		//const planCount = this.entityPlanCount;
		// const planCount = 1;

		if(!housingExtra){
			console.warn('No house data found, aborting scheduling.');
			return;
		}

		//assign one villager per house
        if(residents == -1){
            residents = housingExtra.houseTypeMap.value('normal').length;
        }

        //So we know how many we need to check against
        entityGroupMeta[meshKey] = {
            scheduledCount : residents
        }

		logObj(JSON.parse(housingExtra.houseTypeMap.mapSummary()), 'Village housing summary: ');
		console.log(`Assigning ${residents} villagers to network.`);
        //logObj(scheduleTrack, 'schedule track')

		//overwrite the whole plan (todo: add support for merging/inserting plans)
		for(let i = 0; i<residents; i++){
            const uid = i + idOffset;
			scheduleTrack.ClearPlanForEntity(uid);

			//  planArray = [
			// 	'goToFast:home', 
			// 	// `wait:${10 + Math.floor(i/2)}`,
			// 	'pathTo:inn',
			// 	// 'wait:20',
			// 	// 'pathTo:shop',
			// 	// 'wait:10',
			// 	'pathTo:home'
			// ];

			//alternative plan
			// if(i%2==0){
			// 	//reverse plan
			// 	planArray = [
			// 		'goTo:home', 
			// 		`wait:${10 + i}`,
			// 		'pathTo:shop',
			// 		'wait:20',
			// 		'pathTo:home',
			// 		'wait:10',
			// 		'pathTo:inn',
			// 		'wait:10',
			// 		'pathTo:home'
			// 	];
			// }

			//modify schedule via simplified array
			let plan = planComposer.simplifiedVillagePathPlan(housingExtra, {
				planArray,
				// walkSpeed:300,
				extraWait:(i+1)*0.1,
				villagerId:i    //this is instance id, because houses get assigned there
			});
			
			//planComposer.insertWaitToPlan(i, 0);
			//dlog(`villager plan for ${i}: ${planComposer.compactPlanDescription(plan)}`);

			plan.MeshKey = this.key;

			scheduleTrack.SetPlanForEntity(plan, uid);
			scheduleTrack.DefaultPlanProcessor.ResumePlanForEntity(uid);
		}
    }

    function tick(deltaTime){
        //Forward tick to our timers (used in scheduling for wait adjustments)
        timers.onTick(deltaTime);

        //Early out of travel logic
		if(!entityTravelData.updateDynamic){
			return;
		}

		//Do we have any spawned entities?
		if(!entityTravelData.entityKeymap.spawned){
			return;
		}

		//Traverse all esms and travel for every entity in the map
		//this is needed for nearfield swapping to work
		const entityKeymap = entityTravelData.entityKeymap.map;
		Object.keys(entityKeymap).forEach(mapKey=>{
			const entityMapValue = entityKeymap[mapKey];
			entityMapValue.esmActor.TravelDynamicISMTowardTargets(entityMapValue.key, deltaTime, true);
		});
    }


    //Publicy exposed functions
    return Object.freeze({
        packRandColorToFloat,
        spawnEsmActor,
        makeVillage,
        makeDungeon,
        makeEnemies,
        makeNpcs,
        addVillageScheduleToNpcs,
        randomPlaceName,
        randomCharacterName,
        esmMeshKey,
        map, //exposed main map
        callbacks,
        entityTravelData,
        tick,           //must be linked to game tick to work
    });
}

exports.ProcgenOperations = ProcgenOperations;