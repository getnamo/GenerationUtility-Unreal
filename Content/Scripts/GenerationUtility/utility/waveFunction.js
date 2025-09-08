/**
 * Wafe Function Collapse Algorithm Utility, built for 2D and non-spatial constraints
 */

class Random {
    constructor(seedString) {
        this.seed = this.hashString(seedString);
        this.m = 0x80000000; // 2^31
        this.a = 1103515245;
        this.c = 12345;
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    next() {
        this.seed = (this.a * this.seed + this.c) % this.m;
        return this.seed / (this.m - 1);
    }

    nextInt(max) {
        return Math.floor(this.next() * max);
    }
    
    nextFloat() {
        return this.next();
    }
}

class Tile {
    constructor(possibleStates) {
        this.possibleStates = possibleStates;
    }

    isCollapsed() {
        return this.possibleStates.length === 1;
    }

    passesAdditionalConstraints(nonSpatialConstraints, x, y, grid){
        const validStates = this.possibleStates.filter(state =>
            nonSpatialConstraints.every(fn => fn(state, x, y, grid))
        );
        if (validStates.length === 0) {
            return false;
        }
        return true;
    }

    collapse(random, nonSpatialConstraints, x, y, grid) {
        if (!this.isCollapsed()) {
            let validStates = this.possibleStates.filter(state =>
                nonSpatialConstraints.every(fn => fn(state, x, y, grid))
            );
            if (validStates.length === 0) {
                this.possibleStates = [];
                return false;
            }
            const randomIndex = random.nextInt(validStates.length);
            this.possibleStates = [validStates[randomIndex]];
            return true;
        }
        return true;
    }

    getEntropy() {
        return this.possibleStates.length;
    }

    getState() {
        return this.isCollapsed() ? this.possibleStates[0] : null;
    }
}

class WFC {
    constructor(gridWidth, gridHeight, possibleStates, constraints, constraintWeights = {}, constraintFunctions = [], preFill = [], seedString = 'l33t', propagationCallback = null, maxPropagationSteps = Infinity) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.possibleStates = possibleStates;
        this.constraints = constraints;
        this.constraintWeights = constraintWeights;
        this.constraintFunctions = constraintFunctions;
        this.preFill = preFill;
        this.grid = this.initializeGrid();
        this.random = new Random(seedString);
        this.propagationCallback = propagationCallback;
        this.maxPropagationSteps = maxPropagationSteps;
        this.steps = 0;
        this.shouldStop = false;
    }

    initializeGrid() {
        const grid = [];
        for (let y = 0; y < this.gridHeight; y++) {
            const row = [];
            for (let x = 0; x < this.gridWidth; x++) {
                row.push(new Tile([...this.possibleStates]));
            }
            grid.push(row);
        }

        // Apply pre-fill configuration
        for (const { x, y, state } of this.preFill) {
            if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                if (this.possibleStates.includes(state)) {
                    grid[y][x] = new Tile([state]);
                }
            }
        }

        return grid;
    }

    getNeighbors(x, y) {
        const neighbors = [];
        if (x > 0) neighbors.push({ x: x - 1, y });
        if (x < this.gridWidth - 1) neighbors.push({ x: x + 1, y });
        if (y > 0) neighbors.push({ x, y: y - 1 });
        if (y < this.gridHeight - 1) neighbors.push({ x, y: y + 1 });
        return neighbors;
    }

    propagate() {
        const stack = [];
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.grid[y][x].isCollapsed()) {
                    stack.push({ x, y });
                }
            }
        }

        while (stack.length > 0) {
            if (this.steps % this.maxPropagationSteps == 0 || this.shouldStop) {
                if (this.propagationCallback) {
                    this.propagationCallback(this, this.steps);
                }
            }

            const { x, y } = stack.pop();
            const collapsedTile = this.grid[y][x];
            const neighbors = this.getNeighbors(x, y);

            for (const neighbor of neighbors) {
                const neighborTile = this.grid[neighbor.y][neighbor.x];
                if (!neighborTile.isCollapsed()) {
                    const validStates = this.getValidStates(collapsedTile.possibleStates[0], neighbor.x, neighbor.y);
                    if (validStates.length < neighborTile.possibleStates.length) {
                        neighborTile.possibleStates = validStates;
                        stack.push(neighbor);
                    }
                }
            }

            this.steps += 1;
        }
    }

    getValidStates(state, x, y) {
        if (!this.constraints[state]) {
            return [];
        }

        const validStates = [];
        const weights = this.constraintWeights[state] || this.possibleStates.map(s => ({ state: s, weight: 1 }));

        for (const possibleState of this.possibleStates) {
            const weightObj = weights.find(w => w.state === possibleState);
            const weight = weightObj ? weightObj.weight : 1;

            if (this.constraints[state].includes(possibleState) && this.constraintFunctions.every(fn => fn(possibleState, x, y, this.grid))) {
                for (let i = 0; i < weight; i++) {
                    validStates.push(possibleState);
                }
            }
        }

        return validStates;
    }

    findTileWithLeastEntropy() {
        let minEntropy = Infinity;
        let minEntropyTile = null;

        for (let y = 0;  y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid[y][x];
                if (!tile.isCollapsed() && tile.getEntropy() < minEntropy) {
                    minEntropy = tile.getEntropy();
                    minEntropyTile = { x, y };
                }
            }
        }

        return minEntropyTile;
    }

    run() {

        //Check validity of current state on startup
        const someTileFailure = this.grid.some((row, x) => row.some((tile, y) => {
            const noEntropy = tile.getEntropy() === 0;
            const failNonSpatial = !tile.passesAdditionalConstraints(this.constraintFunctions, x, y, this.grid);
            //console.log(`x${x},y${y} fail? ${noEntropy || failNonSpatial}`)
            return noEntropy || failNonSpatial;
        }));

        if (someTileFailure) {
            console.log('Constraints cannot be satisfied from starting conditions.');
            return this.grid;
        }

        while (true) {
            const tile = this.findTileWithLeastEntropy();
            if (!tile) break;

            if (!this.grid[tile.y][tile.x].collapse(this.random, this.constraintFunctions, tile.x, tile.y, this.grid)) {
                console.log('Constraints cannot be satisfied during collapse.');
                return this.grid;
            }
            this.propagate();

            // Check for unsatisfiable constraints
            if (this.grid.some(row => row.some(tile => tile.getEntropy() === 0))) {
                console.log('Constraints cannot be satisfied after propagation.');
                return this.grid;
            }
        }

        return this.grid;
    }

    //early exit signal
    stop(){
        this.shouldStop = true;
    }

    toString() {
        const result = this.grid.map(row => row.map(tile => {
            return tile.getState() === null? '\u25A0': tile.getState();
        }));
        return result.map(row => row.join(' ')).join('\n');
    }
}

function WFCTest1() {
    const seed = 'l33t';

    // Example usage
    const possibleStates = ['A', 'B', 'C'];
    const constraints = {
        'A': ['A', 'B'],
        'B': ['A', 'C'],
        'C': ['B', 'C']
    };

    const constraintWeights = {
        'A': [{ state: 'A', weight: 6 }, { state: 'B', weight: 4 }],
        'B': [{ state: 'A', weight: 3 }, { state: 'C', weight: 7 }],
        //'C': [{ state: 'B', weight: 5 }, { state: 'C', weight: 5 }]
    };

    // Example non-spatial constraint functions
    const nonSpatialConstraint1 = (state, x, y, grid) => {
        // Prevent state 'A' from being placed in the top row
        if (state === 'A' && y === 0) {
            return false;
        }
        return true;
    };

    const nonSpatialConstraint2 = (state, x, y, grid) => {
        // Prevent state 'C' from being placed in the leftmost column
        if (state === 'C' && x === 0) {
            return false;
        }
        return true;
    };

    const constraintFunctions = [nonSpatialConstraint1, nonSpatialConstraint2];

    // Example pre-fill configuration
    const preFill = [
        // { x: 0, y: 0, state: 'B' },
        { x: 1, y: 1, state: 'C' },
        //{ x: 2, y: 2, state: 'C' },
        //{ x: 3, y: 3, state: 'C' }
    ];

    const propagationCallback = (wfcStage, steps) => {
        console.log(`Propagation step: ${steps}`);
        console.log(wfcStage.toString());
    };

    //const wfc = new WFC(5, 5, possibleStates, constraints) //propagationCallback
    const wfc = new WFC(5, 5, possibleStates, constraints, constraintWeights, constraintFunctions, preFill, seed, propagationCallback, 100);
    const result = wfc.run();

    console.log('Final\n' + wfc.toString());
}

WFCTest1();


function WFCTest2(){
    const seed = 'l33t';

    // Example usage
    const possibleStates = [1, 2, 3];
    const constraints = {
        1: [1, 2],
        2: [3, 1],
        3: [2, 3]
    };

    const wfc = new WFC(5, 5, possibleStates, constraints, [], [], seed);
    const result = wfc.run();

    console.log(wfc.toString());
}

exports.Random = Random;
exports.Tile = Tile;
exports.WFC = WFC;