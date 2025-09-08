/**
 * Uses even spacing for hashgrid type lookup optimization
 * for both vectors and transform style inputs
 */const HashGridCollisionStructure = (spacing) => {
    const grid = new Map();

    const getKey = (x, y, z) => {
        const xi = Math.floor(x / spacing);
        const yi = Math.floor(y / spacing);
        const zi = Math.floor(z / spacing);
        return `${xi},${yi},${zi}`;
    };

    const transformBounds = (translation, rotation, extents) => {
        const { X: tx, Y: ty, Z: tz } = translation;
        const { X: ex, Y: ey, Z: ez } = extents;

        const corners = [
            { X: -ex / 2, Y: -ey / 2, Z: -ez / 2 },
            { X: ex / 2, Y: -ey / 2, Z: -ez / 2 },
            { X: -ex / 2, Y: ey / 2, Z: -ez / 2 },
            { X: ex / 2, Y: ey / 2, Z: -ez / 2 },
            { X: -ex / 2, Y: -ey / 2, Z: ez / 2 },
            { X: ex / 2, Y: -ey / 2, Z: ez / 2 },
            { X: -ex / 2, Y: ey / 2, Z: ez / 2 },
            { X: ex / 2, Y: ey / 2, Z: ez / 2 }
        ];

        const rotateCorner = (corner, rotation) => {
            const { X: qx, Y: qy, Z: qz, W: qw } = rotation;
            const { X: x, Y: y, Z: z } = corner;

            const ix = qw * x + qy * z - qz * y;
            const iy = qw * y + qz * x - qx * z;
            const iz = qw * z + qx * y - qy * x;
            const iw = -qx * x - qy * y - qz * z;

            return {
                X: ix * qw + iw * -qx + iy * -qz - iz * -qy,
                Y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
                Z: iz * qw + iw * -qz + ix * -qy - iy * -qx
            };
        };

        const rotatedCorners = corners.map(corner => {
            const rotated = rotateCorner(corner, rotation);
            return { X: rotated.X + tx, Y: rotated.Y + ty, Z: rotated.Z + tz };
        });

        return rotatedCorners;
    };

    const insert = (translation, rotation, extents, value) => {
        const corners = transformBounds(translation, rotation, extents);
        const minX = Math.min(...corners.map(c => c.X));
        const minY = Math.min(...corners.map(c => c.Y));
        const minZ = Math.min(...corners.map(c => c.Z));
        const maxX = Math.max(...corners.map(c => c.X));
        const maxY = Math.max(...corners.map(c => c.Y));
        const maxZ = Math.max(...corners.map(c => c.Z));

        for (let x = minX; x <= maxX; x += spacing) {
            for (let y = minY; y <= maxY; y += spacing) {
                for (let z = minZ; z <= maxZ; z += spacing) {
                    const key = getKey(x, y, z);
                    if (!grid.has(key)) {
                        grid.set(key, []);
                    }
                    grid.get(key).push({ translation, rotation, extents, value });
                }
            }
        }
    };

    const remove = (translation, rotation, extents, value) => {
        const corners = transformBounds(translation, rotation, extents);
        const minX = Math.min(...corners.map(c => c.X));
        const minY = Math.min(...corners.map(c => c.Y));
        const minZ = Math.min(...corners.map(c => c.Z));
        const maxX = Math.max(...corners.map(c => c.X));
        const maxY = Math.max(...corners.map(c => c.Y));
        const maxZ = Math.max(...corners.map(c => c.Z));

        for (let x = minX; x <= maxX; x += spacing) {
            for (let y = minY; y <= maxY; y += spacing) {
                for (let z = minZ; z <= maxZ; z += spacing) {
                    const key = getKey(x, y, z);
                    if (grid.has(key)) {
                        const cell = grid.get(key);
                        for (let i = 0; i < cell.length; i++) {
                            const item = cell[i];
                            if (item.value === value &&
                                item.translation.X === translation.X &&
                                item.translation.Y === translation.Y &&
                                item.translation.Z === translation.Z &&
                                item.rotation.X === rotation.X &&
                                item.rotation.Y === rotation.Y &&
                                item.rotation.Z === rotation.Z &&
                                item.rotation.W === rotation.W &&
                                item.extents.X === extents.X &&
                                item.extents.Y === extents.Y &&
                                item.extents.Z === extents.Z) {
                                cell.splice(i, 1);
                                break;
                            }
                        }
                        if (cell.length === 0) {
                            grid.delete(key);
                        }
                    }
                }
            }
        }
    };

    const query = (translation, rotation, extents) => {
        const results = [];
        const foundValues = new Set();
        const corners = transformBounds(translation, rotation, extents);
        const minX = Math.min(...corners.map(c => c.X));
        const minY = Math.min(...corners.map(c => c.Y));
        const minZ = Math.min(...corners.map(c => c.Z));
        const maxX = Math.max(...corners.map(c => c.X));
        const maxY = Math.max(...corners.map(c => c.Y));
        const maxZ = Math.max(...corners.map(c => c.Z));

        for (let x = minX; x <= maxX; x += spacing) {
            for (let y = minY; y <= maxY; y += spacing) {
                for (let z = minZ; z <= maxZ; z += spacing) {
                    const key = getKey(x, y, z);
                    if (grid.has(key)) {
                        grid.get(key).forEach(item => {
                            if (!foundValues.has(item.value)) {
                                foundValues.add(item.value);
                                results.push(item);
                            }
                        });
                    }
                }
            }
        }

        return results;
    };

    const toString = ()=>{
        let string = '';
        grid.forEach((value, key)=>{
            //string += `\n(${key})=>${JSON.stringify(value)}`;
            string += `\n(${key})=>${value.length}`;
        });
        return string;
    }
    const internal = ()=>{
        return grid;
    }

    return {
        insert,
        remove,
        query,
        toString,
        grid
    };
};

// Usage example:
const hashGridTest = () => {
    const spacing = 10;
    const hashGrid = HashGridCollisionStructure(spacing);

    const translation1 = { X: 15, Y: 25, Z: 35 };
    const rotation1 = { X: 0, Y: 0, Z: 0, W: 1 }; // Quaternion representation
    const extents1 = { X: 10, Y: 10, Z: 10 };
    const value1 = "Object1";

    const translation2 = { X: 20, Y: 30, Z: 40 };
    const rotation2 = { X: 0, Y: 0, Z: 0, W: 1 }; // Quaternion representation
    const extents2 = { X: 10, Y: 10, Z: 10 };
    const value2 = "Object2";

    hashGrid.insert(translation1, rotation1, extents1, value1);
    hashGrid.insert(translation2, rotation2, extents2, value2);

    const queryTranslation = { X: 15, Y: 25, Z: 35 };
    const queryRotation = { X: 0, Y: 0, Z: 0, W: 1 }; // Quaternion representation
    const queryExtents = { X: 10, Y: 10, Z: 10 };

    console.log(hashGrid.query(queryTranslation, queryRotation, queryExtents)); // Should print boxes that intersect with the query box

    hashGrid.remove(translation1, rotation1, extents1, value1);
    console.log(hashGrid.query(queryTranslation, queryRotation, queryExtents)); // Should print only the remaining boxes
};

exports.HashGridCollisionStructure = HashGridCollisionStructure;

//hashGridTest();