// Function to apply Chaikin's algorithm to smooth a polyline
function chaikinSmooth(points, iterations=1) {
    let smoothedPoints = points.slice(); // Copy the original points array

    for (let i = 0; i < iterations; i++) {
        let newPoints = [];

        for (let j = 0; j < smoothedPoints.length - 1; j++) {
            // Calculate the new points
            let p1 = smoothedPoints[j];
            let p2 = smoothedPoints[j + 1];

            let Q1 = {
                X: p1.X + (p2.X - p1.X) * 0.25,
                Y: p1.Y + (p2.Y - p1.Y) * 0.25,
                Z: p1.Z + (p2.Z - p1.Z) * 0.25
            };

            let Q2 = {
                X: p1.X + (p2.X - p1.X) * 0.75,
                Y: p1.Y + (p2.Y - p1.Y) * 0.75,
                Z: p1.Z + (p2.Z - p1.Z) * 0.75
            };

            newPoints.push(Q1);
            newPoints.push(Q2);
        }

        // Update the smoothed points array
        smoothedPoints = newPoints;
    }

    return smoothedPoints;
}

exports.chaikinSmooth = chaikinSmooth;