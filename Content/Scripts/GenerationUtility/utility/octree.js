const { logObj } = require('GenerationUtility/utility/objectUtility.js');

const OctreeCollisionStructure = (maxPerBucket) => {
    const createNode = (bounds) => ({
        bounds,
        boxes: [],
        children: null
    });

    const insertBox = (node, box) => {
        if (node.children) {
            const octant = getOctant(node.bounds, box.bounds);
            insertBox(node.children[octant], box);
        } else {
            node.boxes.push(box);

            if (node.boxes.length > maxPerBucket) {
                splitNode(node);
            }
        }
    };

    const getBoxes = (node, bounds, results) => {
        if (!intersectBounds(node.bounds, bounds)) {
            return;
        }

        if (node.children) {
            for (let child of node.children) {
                getBoxes(child, bounds, results);
            }
        } else {
            for (let box of node.boxes) {
                if (intersectBounds(bounds, box.bounds)) {
                    results.push(box);
                }
            }
        }
    };

    const splitNode = (node) => {
        const { bounds } = node;
        const [x, y, z, size] = bounds;
        const half = size / 2;

        node.children = [
            createNode([x, y, z, half]),
            createNode([x + half, y, z, half]),
            createNode([x, y + half, z, half]),
            createNode([x + half, y + half, z, half]),
            createNode([x, y, z + half, half]),
            createNode([x + half, y, z + half, half]),
            createNode([x, y + half, z + half, half]),
            createNode([x + half, y + half, z + half, half])
        ];

        for (let box of node.boxes) {
            const octant = getOctant(bounds, box.bounds);
            insertBox(node.children[octant], box);
        }

        node.boxes = [];
    };

    const getOctant = (bounds, boxBounds) => {
        const [x, y, z, size] = bounds;
        const [bx, by, bz] = boxBounds;
        const half = size / 2;
        const midX = x + half;
        const midY = y + half;
        const midZ = z + half;

        return (bx >= midX ? 1 : 0) + (by >= midY ? 2 : 0) + (bz >= midZ ? 4 : 0);
    };

    const intersectBounds = (a, b) => {
        const [ax, ay, az, as] = a;
        const [bx, by, bz, bs] = b;

        return (ax < bx + bs && ax + as > bx && ay < by + bs && ay + as > by && az < bz + bs && az + as > bz);
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

        const minX = Math.min(...rotatedCorners.map(c => c.X));
        const minY = Math.min(...rotatedCorners.map(c => c.Y));
        const minZ = Math.min(...rotatedCorners.map(c => c.Z));
        const maxX = Math.max(...rotatedCorners.map(c => c.X));
        const maxY = Math.max(...rotatedCorners.map(c => c.Y));
        const maxZ = Math.max(...rotatedCorners.map(c => c.Z));

        return [minX, minY, minZ, Math.max(maxX - minX, maxY - minY, maxZ - minZ)];
    };

    const calculateStats = (node, depth = 0) => {
        let numEntries = node.boxes.length;
        let maxDepth = depth;

        if (node.children) {
            for (let child of node.children) {
                const childStats = calculateStats(child, depth + 1);
                numEntries += childStats.numEntries;
                maxDepth = Math.max(maxDepth, childStats.maxDepth);
            }
        }

        return { numEntries, maxDepth };
    };

    // Initialize the root node's bounds to a large range that includes large positive and negative values
    const root = createNode([-100000, -100000, -100000, 400000]);

    return Object.freeze({
        insert(translation, rotation, extents, value) {
            const bounds = transformBounds(translation, rotation, extents);
            insertBox(root, { bounds, translation, rotation, extents, value });
        },
        query(translation, rotation, extents) {
            const results = [];
            const bounds = transformBounds(translation, rotation, extents);
            getBoxes(root, bounds, results);
            return results;
        },
        toString() {
            const { numEntries, maxDepth } = calculateStats(root);
            return `Octree Stats:
            Number of entries: ${numEntries}
            Maximum depth of nodes: ${maxDepth}`;
        }
    });
};

// Usage example:
const octreeTest = () => {
    const maxPerBucket = 4;
    const octree = OctreeCollisionStructure(maxPerBucket);

    const translation1 = { X: 15, Y: 25, Z: 35 };
    const rotation1 = { X: 0, Y: 0, Z: 0, W: 1 }; // Quaternion representation
    const extents1 = { X: 10, Y: 10, Z: 10 };
    const value1 = "Object1";

    const translation2 = { X: 20, Y: 30, Z: 40 };
    const rotation2 = { X: 0, Y: 0, Z: 0, W: 1 }; // Quaternion representation
    const extents2 = { X: 10, Y: 10, Z: 10 };
    const value2 = "Object2";

    const translation3 = { X: -15, Y: -25, Z: -35 };
    const rotation3 = { X: 0, Y: 0, Z: 0, W: 1 }; // Quaternion representation
    const extents3 = { X: 10, Y: 10, Z: 10 };
    const value3 = "Object3";

    octree.insert(translation1, rotation1, extents1, value1);
    octree.insert(translation2, rotation2, extents2, value2);
    octree.insert(translation3, rotation3, extents3, value3);

    const queryTranslation = { X: 15, Y: 25, Z: 35 };
    const queryRotation = { X: 0, Y: 0, Z: 0, W: 1 }; // Quaternion representation
    const queryExtents = { X: 10, Y: 10, Z: 10 };

    console.log(octree.query(queryTranslation, queryRotation, queryExtents)); // Should print boxes that intersect with the query box
    console.log(octree.toString()); // Should print the octree stats
};

//octreeTest();

exports.OctreeCollisionStructure = OctreeCollisionStructure;