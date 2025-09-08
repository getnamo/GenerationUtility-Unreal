const { tryLog,
    customTimeout,
    logObj,
    randomIndex,
    randomStream,
    logIfEnabled,
    makeTransform
 } = require('GenerationUtility/utility/objectUtility.js');

 
const {	makePathFromAToBInGraphAndHouseMap, findClosestVertex} = require('GenerationUtility/utility/pathFinding.js');


/**
 * Class like function for a planning/schedule handler. Helps making
 * @returns Wrapped Object
 */

function PlanComposer(){
    function compactPlanDescription(plan){
        //new 5.5 method means we have to pull the return from $ directly
        //unsure why exactly
        const {$:compactString} = EntityPlanConstructor.CompactDescription(plan);
        return compactString; 
    }

    function makePlanIfMissing(plan){
        //adopt the passed in plan
        if(!plan){
            return new EntityPlan();
        }
        else{
            return plan;
        }
    }

    function insertWaitToPlan(duration=1, index=0, {plan=undefined}={}){
        plan = makePlanIfMissing(plan);

        const action = new InstancedAction();
        action.Duration = duration;
        action.Type = "Wait";
        const wrappedAction = EntityPlanConstructor.WrapperFromInstancedAction(action);
        EntityPlanConstructor.InsertActionAtIndex(plan, wrappedAction, index);

        return plan;
    }

    function testPlan0(cells, {plan=undefined, extraWait=0, oneCellOnly=true}={}){
        plan = makePlanIfMissing(plan);

        const action = new InstancedAction();
        if(extraWait>0){
            action.Duration = extraWait;
            action.Type = "Wait";
            EntityPlanConstructor.AddInstanceAction(plan, action);
        }

        action.Duration = 1;
        action.Speed = 150;
        action.Type = "Travel";

        cells.every(cell=>{
            cell.forEach(transform=>{
                action.Target = transform.Translation;
                EntityPlanConstructor.AddInstanceAction(plan, action);
            });
            return !oneCellOnly;   //only first
        });

        return plan;
    }

    //Todo: convert this into a pure plan somehow we can just add separately,
    //right now it's completely stuck to the track system.
    function testPlan1(cells, {plan=undefined, extraWait=0}={}){        
        plan = makePlanIfMissing(plan);

        const action = new InstancedAction();

        if(extraWait>0){
            action.Duration = extraWait;
            action.Type = "Wait";
            EntityPlanConstructor.AddInstanceAction(plan, action);
        }

        action.Type = "Face";
        action.Target = Vector.MakeVector(0,1,0);
        EntityPlanConstructor.AddInstanceAction(plan, action);

        action.Type = "Wait";
        action.Duration = 0.5;
        EntityPlanConstructor.AddInstanceAction(plan, action);

        action.Type = "Face";
        action.Target = Vector.MakeVector(1,1,0);
        EntityPlanConstructor.AddInstanceAction(plan, action);

        action.Type = "Wait";
        action.Duration = 0.5;
        EntityPlanConstructor.AddInstanceAction(plan, action);

        action.Type = "Face";
        action.Target = Vector.MakeVector(1,0,0);
        EntityPlanConstructor.AddInstanceAction(plan, action);

        //add a custom wait at the end
        action.Type = "Wait";
        action.Speed = 0;
        action.Duration = 3.0;
        EntityPlanConstructor.AddInstanceAction(plan, action);

        let count = 0;

        //logObj(action, 'BaselineAction');

        //just run the first cell for now
        cells.every(cell=>{
            cell.forEach(transform=>{
                action.Type = "Travel";
                // planAction.Speed = 100*(count+1);
                action.Speed = 150;
                action.Target = transform.Translation;
                action.Duration = 1;

                EntityPlanConstructor.AddInstanceAction(plan, action);

                //Wait between actions
                action.Type = "Wait";
                action.Speed = 0;
                action.Target = Vector.MakeVector();
                action.Duration = 1;
                EntityPlanConstructor.AddInstanceAction(plan, action);
                
                count++;

                //logObj(planAction, 'TravelAction' + count);
            });
            return false;
        });
        
        //console.log('plan after: ', planMaker.CompactDescription());

        //return the raw plan
        return plan;
    }

    //simple fixed function of a fixed schedule: home->shop->inn->home 
    function testPlanVillagePath(extra, {
        plan=undefined,
        extraWait=0,
        villagerId=0,
        randomSeed='l33t',
        goInsideHouses=true,
        rightHandOffsetMovement=true,
        offsetDistance = 65,
    }={}){
        plan = makePlanIfMissing(plan);

        const rand = randomStream(villagerId + randomSeed);

        //validity tests
        if(!extra.houseTypeMap.contains('normal')){
            console.log('testPlanVillagePath early exit1 (no normal houses)');
            return plan;
        }

        //for this type of test we need both an inn and a normal house
        if(!extra.houseTypeMap.contains('inn')){
            console.log('testPlanVillagePath early exit2 (no inn)');
            return plan;
        }

        const randomHouseOfType = (type='normal')=>{
            const index = randomIndex(extra.houseTypeMap.value(type) ,rand);
            //console.log('random', type, 'picked: ', index);
            return {index, transform:extra.houseTypeMap.value(type)[index]};
        }

        //start with a wait just to not let them all start at once
        const action = new InstancedAction();
        if(extraWait>0){
            action.Duration = extraWait;
            action.Type = "Wait";
            EntityPlanConstructor.AddInstanceAction(plan, action);
        }

        action.Duration = 1;
        action.Speed = 150;
        action.Type = "Travel";

        //find their home (overassign guard)
        const homeId = villagerId % extra.houseTypeMap.value('normal').length;
        const innPair = randomHouseOfType('inn');
        const poiId = innPair.index;

        const homeTransform = extra.houseTypeMap.value('normal')[homeId];
        const innTransform = innPair.transform;

        const shopCount = extra.houseTypeMap.value('shop').length;
        const foundShops = shopCount>0;
        let shopTransform = innTransform;

        if(foundShops){
            shopTransform = randomHouseOfType('shop').transform;
        }

        //wrapper functions for pathing
        const addPathFromAToBToSchedule = (aT, bT)=>{
            action.Duration = 1;
            action.Speed = 150;
            action.Type = "Travel";

            if(goInsideHouses){
                action.Target = aT.Translation;
                EntityPlanConstructor.AddInstanceAction(plan, action);
            }

            //Returns vertex nodes to traverse
            let path = makePathFromAToBInGraphAndHouseMap(
                aT, 
                bT, 
                extra.roadNetwork, 
                extra.houseTypeMap, 
                {debugVisualizePath:true});


            //for each path node
            path.forEach((node, index)=>{
                //convert to point then transform and add to schedule action
                let point = extra.roadNetwork.vertices[node];

                //modify the point to have a right hand movement
                if(rightHandOffsetMovement &&
                    !(index == 0 || index == node.length-1)){
                    //compass offset
                    const prevNode = path[index-1];
                    const prevPoint = extra.roadNetwork.vertices[prevNode];

                    const direction = Vector.Subtract_VectorVector(point, prevPoint);

                    const right = Vector.Cross_VectorVector(Vector.MakeVector(0,0,1), direction).Normal();

                    const offsetVector = Vector.Multiply_VectorFloat(right, offsetDistance);

                    point = Vector.Add_VectorVector(point, offsetVector);
                }
                
                action.Target = point;//makeTransform({loc:point});
                EntityPlanConstructor.AddInstanceAction(plan, action);
            });

            if(goInsideHouses){
                action.Target = bT.Translation;
                EntityPlanConstructor.AddInstanceAction(plan, action);
            }
        }

        const addWait = (duration)=>{
            action.Duration = duration;
            action.Type = "Wait";
            EntityPlanConstructor.AddInstanceAction(plan, action);
        }

        const goToHouseIdDirectly = (hid, houseType = 'normal')=>{
            const houseTransform = extra.houseTypeMap.value(houseType)[hid];
            action.Duration = 1;
            action.Speed = 150;
            action.Type = "Travel";

            //also go inside the house
            if(goInsideHouses){
                action.Target = houseTransform.Translation;
                EntityPlanConstructor.AddInstanceAction(plan, action);
            }
            else{
                const node = findClosestVertex(houseTransform.Translation.X, houseTransform.Translation.Y, 
                    extra.roadNetwork.vertices);
    
                const point = extra.roadNetwork.vertices[node];
    
                action.Target = point;
                EntityPlanConstructor.AddInstanceAction(plan, action);
            }
        }

        const goHome = ()=>{
            goToHouseIdDirectly(homeId, 'normal');
        }

        //go home directly first
        goHome();

        //wait a bit at home
        addWait(20);

        if(foundShops){
            //go to shop
            addPathFromAToBToSchedule(homeTransform, shopTransform);

            addWait(10);

            //go to inn
            addPathFromAToBToSchedule(shopTransform, innTransform);
        }

        else{
            //path to the inn from home
            addPathFromAToBToSchedule(homeTransform, innTransform);
        }

        //Wait there for 10 sec 
        addWait(10);

        //then back home
        addPathFromAToBToSchedule(innTransform, homeTransform);

        return plan;
    }

    //uses a plan array to parse a simple array instruction into
    //the proper schedule format from the extra data.
    //largely similar to testPlanVillagePath, but allowing variant processing
    function simplifiedVillagePathPlan(extra, {
        plan=undefined,
        planArray = [
            'goTo:home', 
            'wait:10',
            'pathTo:shop',
            'wait:20',
            'pathTo:inn',
            'pathTo:home'
        ],
        extraWait=0,
        villagerId=0,
        randomSeed='l33t',
        walkSpeed=150,
        goInsideHouses=true,
        rightHandOffsetMovement=true,
        offsetDistance = 65,
    }={}){
        plan = makePlanIfMissing(plan);

        const hasHouseType = (type) =>{
            return extra.houseTypeMap.contains(type);
        }

        //validity tests
        if(!hasHouseType('normal')){
            console.log('simplifiedVillagePathPlan early exit (no normal houses)');
            return plan;
        }


        //start with a wait just to not let them all start at once
        const action = new InstancedAction();
        if(extraWait>0){
            action.Duration = extraWait;
            action.Type = "Wait";
            EntityPlanConstructor.AddInstanceAction(plan, action);
        }

        //find their home (overassign guard)
        const homeId = villagerId % extra.houseTypeMap.value('normal').length;
        const homeTransform = extra.houseTypeMap.value('normal')[homeId];


        //Utility functions
        const rand = randomStream(villagerId + randomSeed);

        const randomHouseOfType = (type='normal')=>{
            const index = randomIndex(extra.houseTypeMap.value(type), rand);
            //console.log('random', type, 'picked: ', index);
            return {index, transform:extra.houseTypeMap.value(type)[index]};
        }

        const setTravelActionDefaults = ()=>{
            action.Duration = 1;
            action.Speed = walkSpeed;
            action.Type = "Travel";
        }

        const addPathFromAToBToSchedule = (aT, bT)=>{
            setTravelActionDefaults();

            if(goInsideHouses){
                action.Target = aT.Translation;
                EntityPlanConstructor.AddInstanceAction(plan, action);
            }

            //Returns vertex nodes to traverse
            let path = makePathFromAToBInGraphAndHouseMap(
                aT, 
                bT, 
                extra.roadNetwork, 
                extra.houseTypeMap, 
                {debugVisualizePath:true});


            //for each path node
            path.forEach((node, index)=>{
                //convert to point then transform and add to schedule action
                let point = extra.roadNetwork.vertices[node];

                //modify the point to have a right hand movement
                if(rightHandOffsetMovement &&
                    !(index == 0 || index == node.length-1)){
                    //compass offset
                    const prevNode = path[index-1];
                    const prevPoint = extra.roadNetwork.vertices[prevNode];

                    const direction = Vector.Subtract_VectorVector(point, prevPoint);

                    const right = Vector.Cross_VectorVector(Vector.MakeVector(0,0,1), direction).Normal();

                    const offsetVector = Vector.Multiply_VectorFloat(right, offsetDistance);

                    point = Vector.Add_VectorVector(point, offsetVector);
                }
                
                action.Target = point;//makeTransform({loc:point});
                EntityPlanConstructor.AddInstanceAction(plan, action);
            });

            if(goInsideHouses){
                action.Target = bT.Translation;
                EntityPlanConstructor.AddInstanceAction(plan, action);
            }
        }

        const addWait = (duration)=>{
            action.Duration = duration;
            action.Type = "Wait";
            EntityPlanConstructor.AddInstanceAction(plan, action);
        }

        const goToHouseIdDirectly = (hid, houseType = 'normal', speed=-1)=>{
            const houseTransform = extra.houseTypeMap.value(houseType)[hid];

            setTravelActionDefaults();

            if(speed != -1){
                action.Speed = speed;
            }

            //also go inside the house
            if(goInsideHouses){
                action.Target = houseTransform.Translation;
                EntityPlanConstructor.AddInstanceAction(plan, action);
            }
            else{
                const node = findClosestVertex(houseTransform.Translation.X, houseTransform.Translation.Y, 
                    extra.roadNetwork.vertices);
    
                const point = extra.roadNetwork.vertices[node];
    
                action.Target = point;
                EntityPlanConstructor.AddInstanceAction(plan, action);
            }
        }

        const goHome = (speed=-1)=>{
            goToHouseIdDirectly(homeId, 'normal', speed);
        }

        //set defaults
        setTravelActionDefaults();

        //convert to {action, data} object
        const parsedPlan = planArray.map(entry => {
            const [action, data] = entry.split(':');
            return { action, data };
        });

        //to keep track of pathing from/to
        let lastTransform = homeTransform;
        

        const innPair = randomHouseOfType('inn');
        const poiId = innPair.index;
        const innTransform = innPair.transform;

        const shopCount = extra.houseTypeMap.value('shop').length;
        const foundShops = shopCount>0;

        

        if(!hasHouseType('inn')){
            console.log('testPlanVillagePath (no inn)');
            return plan;
        }

        if(foundShops){
            shopTransform = randomHouseOfType('shop').transform;
        }

        //logObj(parsedPlan);

        //parse the simplified schedule
        const valid = parsedPlan.every(parsedAction =>{
            if(parsedAction.action.startsWith('goTo')){
                if(parsedAction.data =='home'){
                    if(parsedAction.action == 'goToFast'){
                        goHome(10000);
                    }
                    else{
                        goHome();
                    }
                    
                    lastTransform = homeTransform;
                }
                else{
                    const type = parsedAction.data;
                    if(!hasHouseType(type)){
                        console.log(`simplifiedVillagePathPlan early exit 2 (no ${type} houses), incomplete plan returned.`);
                        return false;
                    };

                    const house = randomHouseOfType(type); 
                    goToHouseIdDirectly(house.index, type);
                }
            }
            else if(parsedAction.action == 'wait'){
                addWait(Number(parsedAction.data));
            }
            else if(parsedAction.action == 'pathTo'){

                const type = parsedAction.data;
                let house = {index:homeId, transform:homeTransform};

                if(type !== 'home'){
                    if(!hasHouseType(type)){
                        console.log(`simplifiedVillagePathPlan early exit 3 (no ${type} houses), incomplete plan returned.`);
                        return false;
                    };

                    house = randomHouseOfType(type);  //gives index,transform
                }
                
                addPathFromAToBToSchedule(lastTransform, house.transform);

                //make sure we update our last transform
                lastTransform = house.transform;
            }

            return true;
        });

        return plan;
    }



    return Object.freeze({
        compactPlanDescription,
        testPlan0,
        testPlan1,
        testPlanVillagePath,
        insertWaitToPlan,
        simplifiedVillagePathPlan
    });
}

exports.planComposer = PlanComposer();


/**
 * Js wrapper around the default processor for a passed in schedule track
*/
function JsPlanProcessor(esmActor, timers, {
        scheduleTrack=undefined,
        loggingEnabled=false,
        groupMeshKey=undefined
    }={}){
    const dlog = logIfEnabled(loggingEnabled);

    if(!scheduleTrack){
        scheduleTrack = esmActor.PlanningSystem.GetScheduleTrack();
    }

    function setupProcessingLinks(){
        if(!groupMeshKey){
            console.warn('groupMeshKey undefined, schedule forward will likely not work.');
        }

        //Clear any current callbacks
        scheduleTrack.DefaultPlanProcessor.ClearCallbacks();

        //Link next and cancelled actions
        scheduleTrack.DefaultPlanProcessor.OnNextAction = (wrapper, entityId)=>{
            tryLog(()=>{
                dlog('OnNextAction, id: ', entityId);
                //console.log('got action: ', wrapper);
                //logObj(action, 'action def');

                const action = EntityPlanConstructor.InstancedActionFromWrapper(wrapper);

                if(action.Type == 'Wait'){
                    dlog(`waiting for ${action.Duration} seconds...`);
                    const durationMs = action.Duration * 1000;
                    timers.setTimeout(()=>{
                        dlog(`wait of ${action.Duration} sec complete for ${entityId}`);
                        scheduleTrack.DefaultPlanProcessor.ProcessNextActionForEntity(entityId);
                    }, durationMs);
                }
                else if(action.Type == 'Travel'){
                    dlog(`traveling to ${action.Target.X},${action.Target.Y}...`);
                    esmActor.SetISMMovementTargetDataForIndex(groupMeshKey, action.Target, entityId, action.Speed);
                }
                else if(action.Type == 'Face'){
                    //Grab the target information for now (should be actual transform)
                    const transform = esmActor.GetISMTransformForIndex(groupMeshKey, entityId);
                    
                    transform.Rotation = action.Target.MakeRotFromX().Conv_RotatorToQuaternion();

                    esmActor.SetISMTransformForIndex(groupMeshKey, transform, entityId, true);

                    dlog('facing complete');
                    scheduleTrack.DefaultPlanProcessor.ProcessNextActionForEntity(entityId);
                }
            });
        };
        scheduleTrack.DefaultPlanProcessor.OnActionCancelled = (wrapper, entityId)=>{
            tryLog(()=>{
                const action = EntityPlanConstructor.InstancedActionFromWrapper(wrapper);

                dlog('OnActionCancelled, id: ', entityId);
                dlog('got action: ', action);

                //Stop travelling
                if(action.Type == 'Travel'){
                    esmActor.StopTravelForInstance(groupMeshKey, entityId);
                }
                
                //logObj(action, 'action def');

                //esmActor.SetISMMovementTargetDataForIndex(key, target, i, -1);
            });
        };
    }
    function setEsmActor(inActor){
        esmActor = inActor;
    }

    setupProcessingLinks();

    return Object.freeze({
        setupProcessingLinks,
        setEsmActor,
    });
}

exports.JsPlanProcessor = JsPlanProcessor;