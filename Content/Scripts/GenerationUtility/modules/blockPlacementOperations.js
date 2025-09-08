/// <reference path="../../typings/gu.d.ts" />
const { inspect, uclass, 
	tryLog, logObj, uScale,
	scaleVector, meshBounds,
	worldTransform,
	makeVector,
	copyVector,
	shiftT,
	ArrayMap,
	randomItem,
	randomStream,
	makeTransform,
	copyTransform } = require('GenerationUtility/utility/objectUtility.js');

const { getOBB, isCollidingSAT } = require('GenerationUtility/utility/collisionUtility.js');
const { OctreeCollisionStructure } = require('GenerationUtility/utility/octree.js');
const { HashGridCollisionStructure } = require('GenerationUtility/utility/hashGrid.js');

function BlockOperations({
    seed = 'l33t',
    omap,
    debugCollision = false,
    maxOctreeLeafSize = 10,
}={}){
	let rand = randomStream(seed);
	let rand2 = randomStream(seed + '1');
	let rand3 = randomStream(seed);

    let totalCollisionCount = 0;

    //acceleration structure for collision checks
    const octree = OctreeCollisionStructure(maxOctreeLeafSize);
    const hashgrid = HashGridCollisionStructure(2000);  //~20 meters.

    function logHashGrid(){
        logObj(hashgrid);
    }

    function fillStreetWithHouses(housingTypes=[omap.TownHouse01],{
        lotWidth=1000,
        lotDepth=2000,
        streetLength=10000,
        spacing=0,
        origin = makeTransform(),
        instanceOffset = makeTransform(),
        depthJitter=200,
        treeLined=false,
        checkForCollision=false, //this can get expensive!
        collisionExtentScale=1.4,
        treeOptions={
            treeOffset : 1500,
            treeJitter : {Y:400,X:100},
            treeSelection : [omap.Broadleaf_Desktop_Field2, omap.Broadleaf_Desktop_Field],
        },
        map = new ArrayMap(),
        randHouses = rand,
        randJitter = rand2,
        randTrees = rand3,
    }={}){
        let houseWidth = lotWidth;
        let collisionCheckCount = 0;

        //collisionExtentScale = 1;

        for (let x = 0; x <= streetLength;x += houseWidth + spacing) {
            const type = randomItem(housingTypes, randHouses);

            if(type == null){
                continue;
            }
            houseWidth = type.ExtendedBounds.BoxExtent.X;

            const house = {
              loc: { X: x, Y: (depthJitter * randJitter()), Z: 0 },
              rot: { Yaw: 90 }
            };

            const houseTranslation = makeTransform(house);
            const houseTransform = instanceOffset.ComposeTransforms(houseTranslation);
            const combinedTransform = houseTransform.ComposeTransforms(origin);

            //This uses brute force sat solving, we need to cut down candidates by placing them within
            //hashgrids and exiting early instead of forEach loop...
            if(checkForCollision){
                const boxExtentCandidate = type.GetBounds().BoxExtent.Multiply_VectorFloat(collisionExtentScale);

                //logObj(boxExtentCandidate, 'extent candidate');
                //logObj(combinedTransform, 'transform candidate');

                const obbCandidate = getOBB(combinedTransform, boxExtentCandidate);

                let isAnyColliding = false;
                let bruteForceCollision = false;
                let hashGridCollision = false;

                if(bruteForceCollision){
                    map.forEach((transforms, key)=>{
                        const boxExtentOther = key.GetBounds().BoxExtent.Multiply_VectorFloat(collisionExtentScale);

                        const isNotColliding = transforms.every(transformOther=>{
                            //globalThis.d = transformOther;
                            const obbOther = getOBB(transformOther, boxExtentOther);
                            collisionCheckCount++;
                            totalCollisionCount++;
                            return !isCollidingSAT(obbCandidate, obbOther);
                        });
                        if(!isNotColliding){
                            isAnyColliding = true;
                        }
                    });
                }
                else{
                    let entries = [];

                    //Hashgrid
                    if(hashGridCollision){
                        entries = hashgrid.query(combinedTransform.Translation, combinedTransform.Rotation, boxExtentCandidate);
                    }
                    else{
                        entries = octree.query(combinedTransform.Translation, combinedTransform.Rotation, boxExtentCandidate);
                    }
                    
                    //collisionCheckCount++;
                    //totalCollisionCount++;
                    
                    if(entries.length>0){
                        //continue;

                        const isNotColliding = entries.every(entry=>{
                            const transform = new Transform();

                            //console.log(JSON.stringify(entry));
                            transform.Translation.X = entry.translation.X;
                            transform.Translation.Y = entry.translation.Y;
                            transform.Translation.Z = entry.translation.Z;

                            transform.Rotation.X = entry.rotation.X;
                            transform.Rotation.Y = entry.rotation.Y;
                            transform.Rotation.Z = entry.rotation.Z;
                            transform.Rotation.W = entry.rotation.W;

                            const obbOther = getOBB(transform, entry.extents);
                            collisionCheckCount++;
                            totalCollisionCount++;
                            return !isCollidingSAT(obbCandidate, obbOther);
                        });
                        if(!isNotColliding){
                            isAnyColliding = true;
                        }
                    }
                }

                if(isAnyColliding){
                    continue;
                }
                //console.log('hi!')
            }
            
            //valid placement, continue
            const typeEntityIndex = map.addValue(type, combinedTransform);

            const entry = {
                Location: combinedTransform.Translation,
                Rotation: combinedTransform.Rotation,
                Extents: type.GetBounds().BoxExtent.Multiply_VectorFloat(collisionExtentScale),
                Value: { type, index:typeEntityIndex }
            }


            octree.insert(entry.Location, entry.Rotation, entry.Extents, entry.Value);
            //console.log(octree.toString());


            if(treeLined){
                const randomTree = randomItem(treeOptions.treeSelection, randTrees);

                const treeOffsetTransform = makeTransform({ loc:{
                        Y:(randTrees() * treeOptions.treeJitter.Y),
                        X:(randTrees() * treeOptions.treeJitter.X + treeOptions.treeOffset)}
                });
                const treeTransform = treeOffsetTransform.ComposeTransforms(houseTransform).ComposeTransforms(origin);

                map.addValue(randomTree, treeTransform);
            }
        }

        if(debugCollision){
            console.log('<Temp> collision check count: ', totalCollisionCount, `\t(${collisionCheckCount})`);
        }
        
        return map;
    }

    //polygonal fill
    function fillCellWithHouses(types=[omap.TownHouse01, omap.TownHouse02], {
        cell = [],
        lotWidth = 1000,
        lotDepth = 2000,
        spacing = -240,
        depthJitter = 200,
        checkForCollision=false,
        collisionExtentScale=1.4,
        instanceOffset = makeTransform({rot:{Yaw:180}, loc:{X:0}}),
        treeLined = false,
        inset=0,
        treeOptions = undefined,
        randHouses = rand,
        randJitter = rand2,
        randTrees = rand3,
        map = new ArrayMap()
    }={}){

        //inset to clear spacing for e.g. roads along polygonal block. Positive value insets, negative outsets
        if(inset!=0){
            //Obtain midpoint
            let midPoint = makeTransform().Translation;
            cell.forEach(transform=>{
                midPoint = midPoint.Add_VectorVector(transform.Translation);
            });

            midPoint = midPoint.Divide_VectorFloat(cell.length);

            //Scale inset by finding normal for each translation

            cell = cell.map(transform=>{
                const pointingVector = transform.Translation.Subtract_VectorVector(midPoint);
                const originalLength = pointingVector.VSize();
                
                const direction = pointingVector.Normal();
                const finalVector = midPoint.Add_VectorVector(direction.Multiply_VectorFloat(originalLength - inset));
                const finalTransform = makeTransform({loc:finalVector});
                //console.log(originalLength, inset);

                return finalTransform;
            });
        }

        for(let i = 0; i<cell.length - 1; i++){
            const from = cell[i].Translation;
            const to = cell[i+1].Translation;

            const lineLength = to.Subtract_VectorVector(from).VSize();
            const lookAtRotation = from.FindLookAtRotation(to);

            //logObj(from.FindLookAtRotation(to), `Look at (${lineLength}): `);

            options = {
                cell, lotWidth, lotDepth, spacing, depthJitter, 
                instanceOffset, treeLined, map, 
                checkForCollision, collisionExtentScale,
                randHouses,
                randTrees,
                randJitter,
            }
            if(treeOptions!=undefined){
                options.treeOptions = treeOptions;
            }

            options.streetLength = lineLength;
            options.origin = makeTransform({rot:lookAtRotation, loc:from}),

            map = fillStreetWithHouses(types, options);
        }
        return map;
    }

    //square block fill
    function fillBlockWithHouses(housingTypes=[omap.TownHouse01],{
        blockWidth=10000,
        blockDepth=8000,
        lotDepth=2000,
        spacing=0,
        origin = makeTransform(),
        depthJitter=200,
        treeLined=true,
        map = new ArrayMap()
    }={}){
        function makeStreet({offset={}, streetLength=blockWidth}={}){
            offset = makeTransform(offset).ComposeTransforms(origin);
            return fillStreetWithHouses(housingTypes, {depthJitter, map, streetLength, spacing, origin:offset, treeLined});
        }
        map = makeStreet({offset:{loc:{X:-blockDepth, Y:blockWidth/2}}});
        map = makeStreet({offset:{loc:{X:-blockDepth, Y:-blockWidth/2 + lotDepth}, rot:{Yaw:90}}, streetLength:blockDepth});
        map = makeStreet({offset:{loc:{X:lotDepth, Y:-blockWidth/2 + lotDepth}, rot:{Yaw:180}}});
        map = makeStreet({offset:{loc:{X:lotDepth, Y:blockWidth/2},rot:{Yaw:-90}}, streetLength:blockDepth});
        
        return map;
    }

    //Make a few cityblocks
    function fillBlockGroup({
        blockHouseTypes = [omap.TownHouse01, omap.TownHouse02],
        blockCountX=2,
        blockCountY=2,
        blockWidth=10000,
        blockDepth=8000,
        spacingX=5000,
        spacingY=5000,
        depthJitter=200,
        treeLined=false,
        spacing=0,
        origin=makeTransform(),
        map = new ArrayMap()
    }={}){

        for(let j=0;j<blockCountY;j++){
            for(let i=0;i<blockCountX;i++){
                map = fillBlockWithHouses(blockHouseTypes, {
                    origin:origin.ComposeTransforms(makeTransform(
                        {loc:{X:i*(blockWidth+spacingX), Y:j*(blockDepth+spacingY) }}
                    )),
                    spacing,
                    blockWidth,
                    blockDepth,
                    depthJitter,
                    treeLined,
                    map
                });
            }
        }
        return map;
    }

    return Object.freeze({
        fillStreetWithHouses,
        fillCellWithHouses,
        fillBlockWithHouses,
        fillBlockGroup,
        logHashGrid,
        octree
    });
}

exports.BlockOperations = BlockOperations;