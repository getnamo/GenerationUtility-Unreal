class Transform {
	constructor(Translation, Rotation) {
	  this.Translation = Translation;
	  this.Rotation = Rotation;
	}
}
  
class BoxExtent {
	constructor(X, Y, Z) {
		this.X = X;
		this.Y = Y;
		this.Z = Z;
	}
}

function quaternionToMatrix(q) {
	const {X, Y, Z, W} = q;
	return [
		1 - 2 * Y * Y - 2 * Z * Z, 2 * X * Y - 2 * W * Z, 2 * X * Z + 2 * W * Y,
		2 * X * Y + 2 * W * Z, 1 - 2 * X * X - 2 * Z * Z, 2 * Y * Z - 2 * W * X,
		2 * X * Z - 2 * W * Y, 2 * Y * Z + 2 * W * X, 1 - 2 * X * X - 2 * Y * Y
	];
}

function rotatePoint(point, rotationMatrix) {
	const X =  point.X, Y =  point.Y, Z =  point.Z;
	return {
		X: rotationMatrix[0] * X + rotationMatrix[1] * Y + rotationMatrix[2] * Z,
		Y: rotationMatrix[3] * X + rotationMatrix[4] * Y + rotationMatrix[5] * Z,
		Z: rotationMatrix[6] * X + rotationMatrix[7] * Y + rotationMatrix[8] * Z
	};
}

function getOBB(transform, boxExtent) {
	const rotationMatrix = quaternionToMatrix(transform.Rotation);
	const halfExtent = [
		{X: boxExtent.X / 2, Y: boxExtent.Y / 2, Z: boxExtent.Z / 2},
		{X: -boxExtent.X / 2, Y: boxExtent.Y / 2, Z: boxExtent.Z / 2},
		{X: boxExtent.X / 2, Y: -boxExtent.Y / 2, Z: boxExtent.Z / 2},
		{X: -boxExtent.X / 2, Y: -boxExtent.Y / 2, Z: boxExtent.Z / 2},
		{X: boxExtent.X / 2, Y: boxExtent.Y / 2, Z: -boxExtent.Z / 2},
		{X: -boxExtent.X / 2, Y: boxExtent.Y / 2, Z: -boxExtent.Z / 2},
		{X: boxExtent.X / 2, Y: -boxExtent.Y / 2, Z: -boxExtent.Z / 2},
		{X: -boxExtent.X / 2, Y: -boxExtent.Y / 2, Z: -boxExtent.Z / 2},
	];

	const vertices = halfExtent.map(extent => {
		const rotated = rotatePoint(extent, rotationMatrix);
		return {
			X: rotated.X + transform.Translation.X,
			Y: rotated.Y + transform.Translation.Y,
			Z: rotated.Z + transform.Translation.Z
		};
	});

	return vertices;
}

function projectVertices(vertices, axis) {
	let min = Infinity;
	let max = -Infinity;
	for (const v of vertices) {
		const projection = v.X * axis.X + v.Y * axis.Y + v.Z * axis.Z;
		if (projection < min) min = projection;
		if (projection > max) max = projection;
	}
	return {min, max};
}

function overlap(proj1, proj2) {
	return proj1.max >= proj2.min && proj2.max >= proj1.min;
}

function getAxes(obb) {
	return [
		{X: obb[1].X - obb[0].X, Y: obb[1].Y - obb[0].Y, Z: obb[1].Z - obb[0].Z},
		{X: obb[2].X - obb[0].X, Y: obb[2].Y - obb[0].Y, Z: obb[2].Z - obb[0].Z},
		{X: obb[4].X - obb[0].X, Y: obb[4].Y - obb[0].Y, Z: obb[4].Z - obb[0].Z}
	];
}

function isCollidingSAT(obb1, obb2) {
	const axes = [...getAxes(obb1), ...getAxes(obb2)];

	for (const axis of axes) {
		const proj1 = projectVertices(obb1, axis);
		const proj2 = projectVertices(obb2, axis);

		if (!overlap(proj1, proj2)) {
			return false;
		}
	}
	return true;
}

function isFullyContained(obb1, obb2) {
	const axes = [...getAxes(obb1), ...getAxes(obb2)];

	for (const vertex of obb2) {
		for (const axis of axes) {
			const proj1 = projectVertices(obb1, axis);
			const projection = vertex.X * axis.X + vertex.Y * axis.Y + vertex.Z * axis.Z;
			if (projection < proj1.min || projection > proj1.max) {
				return false;
			}
		}
	}
	return true;
}

exports.getOBB = getOBB;
exports.isCollidingSAT = isCollidingSAT;
exports.isFullyContained = isFullyContained;

function testCollisions(){
	const transform1 = new Transform({X: 0, Y: 0, Z: 0}, {X: 0, Y: 0, Z: 0, W: 1});
	const boxExtent1 = new BoxExtent(2, 2, 2);

	const transform2 = new Transform({X: 1, Y: 1, Z: 1}, {X: 0, Y: 0, Z: 0, W: 1});
	const boxExtent2 = new BoxExtent(2, 2, 2);
		
	const obb1 = getOBB(transform1, boxExtent1);
	const obb2 = getOBB(transform2, boxExtent2);

	const collision1 = isCollidingSAT(obb1, obb2);
	console.log(`Collision 1: ${collision1}`);  // Output should be: true


	const transform3 = new Transform({X: 0, Y: 0, Z: 0}, {X: 0, Y: 0, Z: 0, W: 1});
	const boxExtent3 = new BoxExtent(2, 2, 2);

	const transform4 = new Transform({X: 5, Y: 5, Z: 5}, {X: 0, Y: 0, Z: 0, W: 1});
	const boxExtent4 = new BoxExtent(2, 2, 2);

	const obb3 = getOBB(transform3, boxExtent3);
	const obb4 = getOBB(transform4, boxExtent4);

	const collision2 = isCollidingSAT(obb3, obb4);
	console.log(`Collision 2: ${collision2}`);  // Output should be: false
}

//testCollisions();
