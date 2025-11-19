/// <reference path="../../typings/gu.d.ts" />
const { 
    logObj,
	makeVector,
    clamp
 } = require('GenerationUtility/utility/objectUtility.js');

/**
 * Formation helpers. Generates positions to a given setup. Useful for e.g. army formations or group movement
*/

//todo: Add formation movement logic (offsetting)

exports.moveCurrentFormation = function(esmActor, leadingTargetPosition, {
    leadingUnitIndex=0,
    formationShouldFaceTarget=false
}={}){
    //Move everyone based on unit 0's position
    const unit0CurrentTarget = esmActor.GetISMMovementTargetDataForIndex(key, 0);

    const deltaVector = leadingTargetPosition.Subtract_VectorVector(unit0CurrentTarget);

    //NB: self.entities needs to be replaced with an esmaction

    //Todo: rotate whole formation to face forward
    //formationShouldFaceTarget

    const maxPositions = self.entities.value(key).length;
    for(let i=0; i<maxPositions;i++){
        const currentTarget = esmActor.GetISMMovementTargetDataForIndex(key, i);
        const position = currentTarget.Add_VectorVector(deltaVector);
        esmActor.SetISMMovementTargetDataForIndex(key, position, i, -1);
    }
}

//split into centurion sized cohorts
exports.armyPositions = function(armySize, {
    centurionSize=80,
    centurionWidth=20,  //depth is calculated from width
    centurionSpacing=400,  //between centuries
    cohortSize=480,
    cohortDepth=3,
    armyDepth=1,
    cohortSpacing=1000,
    spacing=100,
    offset={X:0,Y:0,Z:0},
    logDetails=false,
}={}){

    const cohorts = Math.ceil(armySize/cohortSize);

    const centurionDepth = centurionSize/centurionWidth;
    const centuries = Math.ceil(cohortSize/centurionSize);

    //depth defines how the cohorts arrange themselves
    const cohortWidth = centuries/cohortDepth;

    const centuryWidthInCm = spacing*centurionWidth;
    const centuryDepthInCm = spacing*centurionDepth;

    const cohortWidthInCm = (cohortWidth * (centuryWidthInCm + centurionSpacing)) - centurionSpacing; //remove one spacing
    const cohortDepthInCm = (cohortDepth * (centuryDepthInCm + centurionSpacing)) - centurionSpacing;

    const armyWidth = Math.ceil(cohorts/armyDepth);
    const armyWidthInCm = (armyWidth * (cohortWidthInCm + cohortSpacing)) - cohortSpacing;

    offset.Y -= armyWidthInCm/2;

    

    //place the army such that the full extent is centered around the tip center of the army
    function centurionPositions(size=centurionSize, centuryOffset={X:0,Y:0,Z:0}){
        centuryOffset.X += offset.X;
        centuryOffset.Y += offset.Y;
        centuryOffset.Z += offset.Z;

        //we specify size, because there can be leftover troops
        return exports.columnPositions(size, {offset:centuryOffset, columnWidth:centurionWidth, spacing});
    }

    function cohortPositions(size=cohortSize, cohortOffset={X:0,Y:0,Z:0}){
        let positions = [];
        let remainingTroops = size;
        for(let d = 0; d<cohortDepth;d++){
            for(let w = 0; w<cohortWidth; w++){
                //update final centurion
                if(remainingTroops<centurionSize){
                    centurionSize = remainingTroops;
                }
                positions = positions.concat(centurionPositions(centurionSize, {
                    X:(centuryDepthInCm + centurionSpacing) * d + cohortOffset.X,
                    Y:(centuryWidthInCm + centurionSpacing) * w + cohortOffset.Y
                }))
    
                remainingTroops -= centurionSize;
            }  
        }
        return positions;
    }

    let positions = [];
    let remainingTroops = armySize;

    if(logDetails){
        console.log(`army width ${armyWidth}, depth: ${armyDepth}`);
        console.log('army remaining: ', remainingTroops);
    }

    for(let d = 0; d<armyDepth;d++){
        for(let w = 0; w<armyWidth; w++){
            //update final centurion
            if(remainingTroops<cohortSize){
                cohortSize = remainingTroops;
            }
            positions = positions.concat(cohortPositions(cohortSize, {
                X:(cohortDepthInCm + cohortSpacing) * d,
                Y:(cohortWidthInCm + cohortSpacing) * w
            }));

            remainingTroops -= cohortSize;

            if(logDetails){
                console.log('army remaining: ', remainingTroops, 'positions total', positions.length);
            }
        }
    }

    if(logDetails){
        console.log('total positions: ', positions.length);
    }
    
    return positions;
}

exports.columnPositions = function(maxPositions, {columnWidth = 6, spacing=100, offset={X:0,Y:0,Z:0}}={}){
    const positions = [];
    let x = 0, y = 0;

    for(let i=0; i<maxPositions;i++){
        const position = new Vector();
        
        position.X = x * spacing + offset.X;
        position.Y = y * spacing + offset.Y;

        y++;
        if(y>=columnWidth){
            y = 0;
            x++;
        }
        positions.push(position);
    }
    return positions;
}

exports.circlePositions = function(maxPositions, {radius=2500, spacing=100, offset={X:0,Y:0,Z:0}}={}) {
    const positions = [];
    let layer = 0;
    let angleIncrement = (2 * Math.PI * radius) / spacing;
    let remainingEntities = maxPositions;

    while (remainingEntities > 0) {
        const circumference = 2 * Math.PI * (radius + layer * spacing);
        const entitiesInLayer = Math.min(Math.floor(circumference / spacing), remainingEntities);
        const angleStep = 2 * Math.PI / entitiesInLayer;

        for (let i = 0; i < entitiesInLayer; i++) {
            const angle = i * angleStep;
            const X = (radius + layer * spacing) * Math.cos(angle) + offset.X;
            const Y = (radius + layer * spacing) * Math.sin(angle) + offset.Y;
            const Z = offset.Z; // Z is set to 0 for each position
            positions.push({ X, Y, Z });
        }

        remainingEntities -= entitiesInLayer;
        layer++;
    }

    return positions;
}
exports.trianglePositions = function(numTroops, spacing=100) {
    const positions = [];
    let currentRow = 0;
    let troopsRemaining = numTroops;

    while (troopsRemaining > 0) {
        // Calculate the number of troops in the current row
        const troopsInRow = Math.min(currentRow + 1, troopsRemaining);

        // Calculate the x offset for the row (center it horizontally)
        const rowWidth = (troopsInRow - 1) * spacing;
        const xOffset = -rowWidth / 2;

        // Place troops in the current row
        for (let i = 0; i < troopsInRow; i++) {
            const X = xOffset + i * spacing;
            const Y = currentRow * spacing;
            const Z = 0;
            positions.push({ X, Y, Z });
        }

        // Update the number of troops remaining and move to the next row
        troopsRemaining -= troopsInRow;
        currentRow++;
    }
    return positions;
}

function euclidean(a,b){
    return (a**2 + b**2)**0.5;
}

//also know as a pig's head in roman formation - min 10 max 75
// Function to create a wedge formation
exports.wedgePositions= function(entityCount, {
    spacing = 100,
    wedgeLength = 1000, 
    wedgeAngle = 45,
    offset = {X: 0, Y: 0, Z: 0}, 
    direction = 'up',
    // limitEndToFirstRow = false,
}={})
{
    let remainingTroops = entityCount;
    const clampedHalfAngle = clamp(wedgeAngle, 10, 75);
    const angleRad = clampedHalfAngle * (Math.PI / 180); // technically the 'half' wedge angle
    const over45spacingModifier = clamp(wedgeAngle / 45 * 1.5, 1, 20);

    // Calculate the tip of the triangle
    function leadingWedge(inWedgeLength, wedgeOffset = 0, positions = []) {
        const finalOffset = makeVector(offset);
        const clampedYSpacingFactor = clamp(45 / clampedHalfAngle, 1, 10);
        finalOffset.Y += wedgeOffset * (spacing * clampedYSpacingFactor); // push spacing based on standard angle

        function makePositionFromXOffset(xPosition, yPosition) {
            return { X: xPosition + finalOffset.X, Y: direction === 'up' ? yPosition + finalOffset.Y : finalOffset.Y - yPosition, Z: finalOffset.Z };
        }

        // Add tip position
        positions.push(finalOffset);
        remainingTroops--;
        let i = 1;

        // Fill out the positions along one wing
        while (remainingTroops > 0) {
            const yPosition = i * spacing / over45spacingModifier;
            const xPosition = yPosition * Math.tan(angleRad);

            

            if (euclidean(xPosition, yPosition) > inWedgeLength) {
                break;
            }

            // Wing 1 (left side)
            positions.push(makePositionFromXOffset(-xPosition, yPosition));
            remainingTroops--;

            if (remainingTroops <= 0) {
                break;
            }

            // Wing 2 (right side)
            positions.push(makePositionFromXOffset(xPosition, yPosition));
            remainingTroops--;
            i++;
        }

        if (remainingTroops) {
            inWedgeLength -= spacing;

            // No more spacing for this wedge
            if (inWedgeLength < 0) {
                return positions;
            }

            return leadingWedge(inWedgeLength, wedgeOffset + 1, positions);
        }

        return positions;
    }

    return leadingWedge(wedgeLength, 0);
}

// Function to create a diamond formation from two triangle formations (WIP)
exports.diamondPositions = function(entityCount, options) {
    const halfEntityCount = Math.floor(entityCount / 2);

    // Create the top-facing triangle wedge
    const topWedge = exports.wedgePositions(halfEntityCount, {...options, direction: 'up'});

    // Create the bottom-facing triangle wedge
    const bottomWedge = exports.wedgePositions(halfEntityCount, {...options, direction: 'down', 
        offset: {X: options.offset.X, Y: options.offset.Y + ( options.wedgeLength / (Math.sin(Math.PI/4)) ), Z: options.offset.Z}});

    return [...topWedge, ...bottomWedge];
}


//Use this for diamond positions
exports.squarePositions = function(entityCount, { squareSize = 2000, spacing = 100, offset = { X: 0, Y: 0, Z: 0 }, rotation = 0 } = {}) {
	const positions = [];
	let remainingEntities = entityCount;
	let currentLayer = 0;

	const radRotation = (Math.PI / 180) * rotation;

	const rotate = (x, y) => {
		return {
			X: x * Math.cos(radRotation) - y * Math.sin(radRotation),
			Y: x * Math.sin(radRotation) + y * Math.cos(radRotation)
		};
	};

	while (remainingEntities > 0) {
		const currentSize = squareSize - currentLayer * spacing * 2;
		const numPerSide = Math.floor(currentSize / spacing);

		// Fill top side
		for (let i = 0; i < numPerSide && remainingEntities > 0; i++) {
			const { X, Y } = rotate(-currentSize / 2 + i * spacing, currentSize / 2);
			positions.push({ X: X + offset.X, Y: Y + offset.Y, Z: offset.Z });
			remainingEntities--;
		}

		// Fill right side
		for (let i = 0; i < numPerSide && remainingEntities > 0; i++) {
			const { X, Y } = rotate(currentSize / 2, currentSize / 2 - i * spacing);
			positions.push({ X: X + offset.X, Y: Y + offset.Y, Z: offset.Z });
			remainingEntities--;
		}

		// Fill bottom side
		for (let i = 0; i < numPerSide && remainingEntities > 0; i++) {
			const { X, Y } = rotate(currentSize / 2 - i * spacing, -currentSize / 2);
			positions.push({ X: X + offset.X, Y: Y + offset.Y, Z: offset.Z });
			remainingEntities--;
		}

		// Fill left side
		for (let i = 0; i < numPerSide && remainingEntities > 0; i++) {
			const { X, Y } = rotate(-currentSize / 2, -currentSize / 2 + i * spacing);
			positions.push({ X: X + offset.X, Y: Y + offset.Y, Z: offset.Z });
			remainingEntities--;
		}

		currentLayer++;
	}

	return positions;
}
