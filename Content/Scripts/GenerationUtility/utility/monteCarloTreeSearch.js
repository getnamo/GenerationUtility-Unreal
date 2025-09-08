class Node {
    constructor(state, parent = null) {
        this.state = state;
        this.parent = parent;
        this.children = [];
        this.visits = 0;
        this.wins = 0;
    }

    addChild(child) {
        this.children.push(child);
    }

    isLeaf() {
        return this.children.length === 0;
    }
}

class Tree {
    constructor(root) {
        this.root = root;
    }

    selectPromisingNode(node) {
        while (!node.isLeaf()) {
            node = this.getBestUCTNode(node);
        }
        return node;
    }

    getBestUCTNode(node) {
        let bestNode = null;
        let bestUCTValue = -Infinity;

        for (const child of node.children) {
            const uctValue = this.uctValue(node.visits, child.wins, child.visits);
            if (uctValue > bestUCTValue) {
                bestUCTValue = uctValue;
                bestNode = child;
            }
        }

        return bestNode;
    }

    uctValue(totalVisits, nodeWins, nodeVisits) {
        if (nodeVisits === 0) {
            return Infinity;
        }
        return (nodeWins / nodeVisits) + Math.sqrt(2) * Math.sqrt(Math.log(totalVisits) / nodeVisits);
    }

    expandNode(node, possibleStates) {
        for (const state of possibleStates) {
            const newNode = new Node(state, node);
            node.addChild(newNode);
        }
    }
}


class MCTS {
    constructor(rootState) {
        this.root = new Node(rootState);
        this.tree = new Tree(this.root);
    }

    run(iterations) {
        for (let i = 0; i < iterations; i++) {
            const promisingNode = this.tree.selectPromisingNode(this.root);
            if (promisingNode.visits > 0) {
                this.tree.expandNode(promisingNode, this.getPossibleStates(promisingNode.state));
            }
            const nodeToExplore = promisingNode.isLeaf() ? promisingNode : this.getRandomChild(promisingNode);
            const simulationResult = this.simulateRandomPlayout(nodeToExplore);
            this.backPropagate(nodeToExplore, simulationResult);
        }

        return this.getBestChild(this.root);
    }

    getPossibleStates(state) {
        // Return an array of possible states from the given state.
        // This should be implemented based on your specific use case.
        return [];
    }

    getRandomChild(node) {
        const children = node.children;
        return children[Math.floor(Math.random() * children.length)];
    }

    simulateRandomPlayout(node) {
        let tempNode = new Node(node.state);
        let tempState = tempNode.state;

        while (!this.isTerminalState(tempState)) {
            const possibleStates = this.getPossibleStates(tempState);
            tempState = possibleStates[Math.floor(Math.random() * possibleStates.length)];
        }

        return this.getPlayoutResult(tempState);
    }

    isTerminalState(state) {
        // Return true if the state is a terminal state.
        // This should be implemented based on your specific use case.
        return false;
    }

    getPlayoutResult(state) {
        // Return the result of a playout.
        // This should be implemented based on your specific use case.
        return 0;
    }

    backPropagate(node, result) {
        let tempNode = node;
        while (tempNode != null) {
            tempNode.visits++;
            tempNode.wins += result;
            tempNode = tempNode.parent;
        }
    }

    getBestChild(node) {
        let bestChild = null;
        let bestWinRate = -Infinity;

        for (const child of node.children) {
            const winRate = child.wins / child.visits;
            if (winRate > bestWinRate) {
                bestWinRate = winRate;
                bestChild = child;
            }
        }

        return bestChild;
    }
}

exports.MCTS = MCTS;

class SimpleGameState {
    constructor(value) {
        this.value = value;
    }

    getPossibleStates() {
        return [new SimpleGameState(this.value + 1), new SimpleGameState(this.value - 1)];
    }

    isTerminal() {
        return this.value === 0;
    }

    getResult() {
        return this.value === 0 ? 1 : 0;
    }
}

class TicTacToeState {
    constructor(board = Array(9).fill(null), currentPlayer = 'X') {
        this.board = board;
        this.currentPlayer = currentPlayer;
    }

    getPossibleMoves() {
        return this.board.map((cell, index) => cell === null ? index : null).filter(index => index !== null);
    }

    makeMove(move) {
        const newBoard = this.board.slice();
        newBoard[move] = this.currentPlayer;
        return new TicTacToeState(newBoard, this.currentPlayer === 'X' ? 'O' : 'X');
    }

    isTerminal() {
        const winningLines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6]             // diagonals
        ];

        for (const line of winningLines) {
            const [a, b, c] = line;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                return true;
            }
        }

        return this.board.every(cell => cell !== null);
    }

    getResult(playerMark = 'X') {
        const winningLines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6]             // diagonals
        ];

        for (const line of winningLines) {
            const [a, b, c] = line;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                return this.board[a] === playerMark ? 1 : -1;
            }
        }

        return 0; // Draw
    }

    toString(board=this.board) {
        let boardStr = '';
        for (let i = 0; i < board.length; i++) {
            boardStr += board[i] ? board[i] : ' ';
            if ((i + 1) % 3 === 0 && i < board.length - 1) {
                boardStr += '\n';
            } else if ((i + 1) % 3 !== 0) {
                boardStr += '|';
            }
        }
        return boardStr;
    }
}

function TestTicTacToe(){
    let initialState = new TicTacToeState();
    let bestChild = {
        state:initialState
    }

    console.log('Starting state :\n' + bestChild.state.toString());

    while(true){
        const mcts = new MCTS(bestChild.state);
        console.log('Player Move: ', bestChild.state.currentPlayer);
        mcts.getPossibleStates = (state) => state.getPossibleMoves().map(move => state.makeMove(move));
        mcts.isTerminalState = (state) => state.isTerminal();
        mcts.getPlayoutResult = (state) => state.getResult(bestChild.state.currentPlayer);
        bestChild = mcts.run(1000);

        console.log('Best move :\n' + bestChild.state.toString());

        if(bestChild.state.isTerminal()){
            break;
        }
    }
}

TestTicTacToe();