/// <reference path="../../typings/gu.d.ts" />
function ZoningHandler(meta=undefined){

	//Utility
	function is2D(array){
		return (array[0].constructor === Array);
	}

	//numpy type function for... 2D
	function reshape(array, rows){
		if(!rows){
			//attempt a square matrix
			rows = Math.floor(Math.sqrt(array.length));
		}
		let reshaped = [];
		const input = array.slice(0);
		while(input.length) reshaped.push(input.splice(0,rows));
		return reshaped;
	}

	function inverted(array){
		if(is2D(array)){
			return array.map( row => row.map( n =>1-n));
		}
		else{
			return array.map( n => 1-n);
		}
	}

	//for printing matrices to log
	function prettyMatrix(array, rows=undefined){
		let input;
		if(is2D(array)){
			input = array;
		}
		else{
			if(!rows){
				//attempt a square matrix
				rows = Math.floor(Math.sqrt(array.length));
			}
			input = reshape(array,rows)
		}
		return "\n" + input.map((d) => d.join(" ")).join("\n")
	}
	function logMatrix(array, extra='matrix:'){
		console.log(extra, prettyMatrix(array));
	}

	//Solutions


	//Histogram Approach O(r*c) or O(n)
	//See - https://www.geeksforgeeks.org/largest-rectangle-under-histogram/
	function maxHist(rows, columns, row)
	{
		// Create an empty stack. The stack
		// holds indexes of hist[] array.
		// The bars stored in stack are always
		// in increasing order of their heights.
		let result = [];

		let topVal; // Top of stack

		let best = {area:0, row:0, column:0, width:0, height:0}

		let area = 0; // Initialize area with
		// current top

		// Run through all bars of
		// given histogram (or row)
		let i = 0;
		while (i < columns) {
			// If this bar is higher than the
			// bar on top stack, push it to stack
			if (result.length == 0
				|| row[result[result.length - 1]] <= row[i]) {
				result.push(i++);
			}
			else {
				// If this bar is lower than top
				// of stack, then calculate area of
				// rectangle with stack top as
				// the smallest (or minimum height)
				// bar. 'i' is 'right index' for
				// the top and element before
				// top in stack is 'left index'
				topVal = row[result[result.length - 1]];
				result.pop();
				area = topVal * i;

				if (result.length > 0) {
					area = topVal * (i - result[result.length - 1] - 1);
				}
				//console.log(`area ${area} at ${i}`);

				if(area > best.area) {
					//console.log(`new Max area ${area} at ${i}`);
					best.area = area;
					best.column = i-1;
					best.width = area/topVal;
					best.height = area/best.width;
				}
			}
		}

		// Now pop the remaining bars from
		// stack and calculate area with
		// every popped bar as the smallest bar
		while (result.length > 0) {
			topVal = row[result[result.length - 1]];
			result.pop();
			area = topVal * i;
			if (result.length > 0) {
				area = topVal * (i - result[result.length - 1] - 1);
			}
		
			//console.log(area/topVal);

			if(area>best.area) {
				best.area = area;
				best.column = i-1;
				best.width = area/topVal;
				best.height = area/best.width;
				//console.log(`new Max area ${area} at remaining ${i}`);
			}


		}
		return best;
	}

	//Histogram based solution

	// Returns area of the largest
	// rectangle with all 1s in A[][]
	function maxRectangle(A, {matchType=1, copyMatrix=true}={})
	{
		let rows = A.length;
		let columns = A[0].length;

		//Copy matrix so we don't modify the matrix we passed in
		let histogram;
		if(matchType == 0){
			//invert matrix
			histogram = A.map( row => row.map( n =>1-n));
		}
		else{
			histogram = A.map( row => [...row]);
		}

		//x = row, y = column, width = row width, height = column height
		let rect = {w:0, h:0, x:0, y:0};

		//console.log(prettyMatrix(histogram));

		// Calculate area for first row
		// and initialize it as result
		let result = maxHist(rows, columns, histogram[0]);

		//console.log('h:', prettyMatrix(histogram));
		//console.log(result, ' maxhist initialized at ', 0);

		// iterate over row to find
		// maximum rectangular area
		// considering each row as histogram
		for (let i = 1; i < rows; i++) {
			for (let j = 0; j < columns; j++) {

				// if A[i][j] is 1 then
				// add A[i -1][j]
				if (histogram[i][j] == 1) {
					histogram[i][j] += histogram[i - 1][j];
				}
			}

			// Update result if area with current
			// row (as last row of rectangle) is more

			let newResult = maxHist(rows, columns, histogram[i]);

			//instead of max, we us this formulation to find i,j of max
			if(newResult.area> result.area){
				result.area = newResult.area;
				result.row = i;
				result.column = newResult.column;
				result.width = newResult.width;
				result.height = newResult.height;
				
				//console.log(result, ' maxhist found at ', i);
			}

			//console.log('h:', prettyMatrix(histogram));
		}
		
		//reformat the result for ordering
		return {
			area:result.area,
			top:result.row - result.height + 1,
			left:result.column - result.width + 1,
			bottom:result.row,
			right:result.column,
			width:result.width,
			height:result.height
		}

		//return result;
	}

	//from https://stackoverflow.com/questions/7245/puzzle-find-largest-rectangle-maximal-rectangle-problem
	//Note this method is naive and doesn't find the optimally largest rectangle
	function naiveMaxRectangle(mask) {
		let best = {area: 0}
		const width = mask[0].length
		const depth = Array(width).fill(0)
		for (let y = 0; y < mask.length; y++) {
			const ranges = Array()
			for (let x = 0; x < width; x++) {
				const d = depth[x] = mask[y][x] ? depth[x] + 1 : 0
				if (!ranges.length || ranges[ranges.length - 1].height < d) {
					ranges.push({left: x, height: d})
				} 
				else {
					for (var j = ranges.length - 1; j >= 0 && ranges[j].height >= d; j--) {
						const {left, height} = ranges[j]
						const area = (x - left) * height
						if (area > best.area) {
							best = {area, top: y + 1 - height, left, bottom: y, right: x - 1 }
							
							//NB: bottom and right have -1 added for inclusive coordinates (not exclusive)
							// for this reason + 1 is added to width/height
							best.width = best.right - best.left + 1;
							best.height = best.bottom - best.top + 1;
						}
					}
					ranges.splice(j+2)
					ranges[j+1].height = d
				}
			}
		}
		return best;
	}

	function test(){
		
		//matchtype 1
		/*let A = [
			0, 1, 1, 0,
			1, 1, 1, 1,
			1, 1, 1, 1,
			1, 1, 0, 0
		];*/
		let A = [
			[1, 0, 0, 1],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
			[0, 0, 1, 1]
		];
		

		/*let A = [
			1, 0, 0,
			0, 0, 0,
			1, 0, 0  
		];
		let rows = 3;
		reshape()*/

		A = inverted(A);

		
		logMatrix(A, 'A:');

		let result = naiveMaxRectangle(A);

		console.log('maxRectNaive: ', JSON.stringify(result));

		result = maxRectangle(A);

		
		console.log('maxRect: ', JSON.stringify(result));

		
	}

	function rasterizeRectangleInMatrix({
		matrix={}, 
		matrixSize={X:10,Y:10},
		matrixlocation={X:0,Y:0},
		rectSize={X:1, Y: 1},
		rectlocation={X:0,Y:0}}){



		/**
		Rasterize given rectangle inside our matrix
		 */

		return matrix;
	}

	return Object.freeze({
		maxRectangle,
		rasterizeRectangleInMatrix,
		test
	});
}

exports.ZoningHandler = ZoningHandler;