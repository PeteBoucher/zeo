const indev = require('indev');

const {
  NUM_CELLS,
  OVERSCAN,
  NUM_CELLS_OVERSCAN,

  DEFAULT_SEED,
} = require('../constants/constants');
const {MapPoint} = require('../records/records');

class Vector3 {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  static fromArray(array, offset = 0) {
    return new Vector3(
      array[offset + 0],
      array[offset + 1],
      array[offset + 2]
    );
  }

  sub(v) {
    return new Vector3(
      this.x - v.x,
      this.y - v.y,
      this.z - v.z
    );
  }

  cross(v) {
    return new Vector3(
      this.y * v.z - this.z * v.y,
		  this.z * v.x - this.x * v.z,
		  this.x * v.y - this.y * v.x
    );
  }
}

const BIOME_COLORS = {
  // Features
  OCEAN: 0x44447a,
  // OCEAN: 0x000000,
  // COAST: 0x33335a,
  COAST: 0x333333,
  LAKESHORE: 0x225588,
  LAKE: 0x336699,
  RIVER: 0x225588,
  MARSH: 0x2f6666,
  // ICE: 0x99ffff,
  ICE: 0x99dddd,
  // BEACH: 0xa09077,
  BEACH: 0xa0b077,
  ROAD1: 0x442211,
  ROAD2: 0x553322,
  ROAD3: 0x664433,
  BRIDGE: 0x686860,
  LAVA: 0xcc3333,

  // Terrain
  SNOW: 0xffffff,
  TUNDRA: 0xbbbbaa,
  BARE: 0x888888,
  SCORCHED: 0x555555,
  TAIGA: 0x99aa77,
  SHRUBLAND: 0x889977,
  TEMPERATE_DESERT: 0xc9d29b,
  TEMPERATE_RAIN_FOREST: 0x448855,
  TEMPERATE_DECIDUOUS_FOREST: 0x679459,
  GRASSLAND: 0x88aa55,
  SUBTROPICAL_DESERT: 0xd2b98b,
  TROPICAL_RAIN_FOREST: 0x337755,
  TROPICAL_SEASONAL_FOREST: 0x559944,
  MAGMA: 0xff3333,
};

const DIRECTIONS = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const _random = (() => {
  const generator = indev({
    seed: DEFAULT_SEED,
  });
  const elevationNoise = generator.uniform({
    frequency: 0.002,
    octaves: 8,
  });
  const moistureNoise = generator.uniform({
    frequency: 0.001,
    octaves: 2,
  });

  return {
    elevationNoise,
    moistureNoise,
  };
})();

const buildMapChunk = ({offset}) => {
  const points = (() => {
    const points = Array(NUM_CELLS_OVERSCAN * NUM_CELLS_OVERSCAN);

    for (let y = 0; y < NUM_CELLS_OVERSCAN; y++) {
      for (let x = 0; x < NUM_CELLS_OVERSCAN; x++) {
        const index = _getCoordOverscanIndex(x, y);
  
        const dx = (offset.x * NUM_CELLS) - OVERSCAN + x;
        const dy = (offset.y * NUM_CELLS) - OVERSCAN + y;
        const elevation = (-0.5 + Math.pow(_random.elevationNoise.in2D(dx, dy), 0.5)) * 64;/* (() => {
          const y = _random.elevationNoise.in2D(dx, dy);
          const scaleFactor = 1;
          const powFactor = 0.3;
          const x = Math.pow(scaleFactor, powFactor) - Math.pow(scaleFactor * (1 - y), powFactor);
          return x - 0.5;
        })(); */
        const moisture = _random.moistureNoise.in2D(dx, dy);
        const land = elevation > 0;
        const water = !land;
        const point = new MapPoint(
          elevation,
          moisture,
          land,
          water
        );

        points[index] = point;
      }
    }

    const _flood = (x, y, floodSeenIndex, fn) => {
      const nextPoints = [
        [x, y]
      ];

      while (nextPoints.length > 0) {
        const nextPoint = nextPoints.pop();
        const [x, y] = nextPoint;
        const index = _getCoordOverscanIndex(x, y);

        if (!floodSeenIndex[index]) {
          const potentialNextPoints = fn(x, y, index);
          nextPoints.push.apply(nextPoints, potentialNextPoints);

          floodSeenIndex[index] = true;
        }
      }
    };

    const floodOceanSeenIndex = {};
    const _startFloodOcean = (x, y) => {
      const _isOcean = p => p.water;

      const index = _getCoordOverscanIndex(x, y);
      const point = points[index];
      if (_isOcean(point)) {
        _flood(x, y, floodOceanSeenIndex, (x, y, index) => {
          const point = points[index];
          point.ocean = true;

          const nextPoints = [];
          for (let i = 0; i < DIRECTIONS.length; i++) {
            const direction = DIRECTIONS[i];
            const dx = x + direction[0];
            const dy = y + direction[1];
            if (dx >= 0 && dx < NUM_CELLS_OVERSCAN && dy >= 0 && dy < NUM_CELLS_OVERSCAN) {
              const neighborPointIndex = _getCoordOverscanIndex(dx, dy);
              const neighborPoint = points[neighborPointIndex];
              if (_isOcean(neighborPoint)) {
                nextPoints.push([dx, dy]);
              }
            }
          }
          return nextPoints;
        });
      }
    };

    const floodLakeSeenIndex = {};
    const _startFloodLake = (x, y) => {
      const _isLake = p => p.water && !p.ocean;

      const index = _getCoordOverscanIndex(x, y);
      const point = points[index];
      if (_isLake(point)) {
        _flood(x, y, floodLakeSeenIndex, (x, y, index) => {
          const point = points[index];
          point.lake = true;

          const nextPoints = [];
          for (let i = 0; i < DIRECTIONS.length; i++) {
            const direction = DIRECTIONS[i];
            const dx = x + direction[0];
            const dy = y + direction[1];
            if (dx >= 0 && dx < NUM_CELLS_OVERSCAN && dy >= 0 && dy < NUM_CELLS_OVERSCAN) {
              const neighborPointIndex = _getCoordOverscanIndex(dx, dy);
              const neighborPoint = points[neighborPointIndex];
              if (_isLake(neighborPoint)) {
                nextPoints.push([dx, dy]);
              }
            }
          }
          return nextPoints;
        });
      }
    };

    // flood fill oceans + lakes
    for (let y = 0; y < NUM_CELLS_OVERSCAN; y++) {
      for (let x = 0; x < NUM_CELLS_OVERSCAN; x++) {
        if (x === 0 || x === (NUM_CELLS_OVERSCAN - 1) || y === 0 || y === (NUM_CELLS_OVERSCAN - 1)) {
          _startFloodOcean(x, y);
        }
        _startFloodLake(x, y);
      }
    }

    // XXX assign lava

    return points;
  })();

  return {
    offset,
    points,
  };
};

const compileMapChunk = mapChunk => {
  const {offset, points} = mapChunk;
  const mapChunkUpdate = recompileMapChunk(mapChunk);
  const {positions, normals, colors, indices} = mapChunkUpdate;

  return {
    offset,
    points,
    positions,
    normals,
    colors,
    indices,
  };
};

const recompileMapChunk = mapChunk => {
  const {offset, points} = mapChunk;

  const positions = new Float32Array((NUM_CELLS + 1) * (NUM_CELLS + 1) * 3);
  const normals = new Float32Array((NUM_CELLS + 1) * (NUM_CELLS + 1) * 3);
  const colors = new Float32Array((NUM_CELLS + 1) * (NUM_CELLS + 1) * 3);
  const indices = new Uint16Array(NUM_CELLS * NUM_CELLS * 3 * 2);

  let i = 0;
  for (let y = 0; y <= NUM_CELLS; y++) {
    for (let x = 0; x <= NUM_CELLS; x++) {
      const index = _getCoordOverscanIndex(x, y);
      const point = points[index];
      const {elevation, moisture, land, water, ocean, lava} = point;
      const coast = land && ocean;

      const ax = x + (offset.x * NUM_CELLS);
      const ay = y + (offset.y * NUM_CELLS);
      positions[(i * 3) + 0] = ax;
      positions[(i * 3) + 1] = elevation;
      positions[(i * 3) + 2] = ay;

      const biome = _getBiome({
        elevation,
        moisture,
        land,
        water,
        ocean,
        coast,
        lava,
      });
      const colorInt = BIOME_COLORS[biome];
      const colorArray = _colorIntToArray(colorInt);
      colors[(i * 3) + 0] = colorArray[0];
      colors[(i * 3) + 1] = colorArray[1];
      colors[(i * 3) + 2] = colorArray[2];

      i++;
    }
  }

  i = 0;
  for (let y = 0; y < NUM_CELLS; y++) {
    for (let x = 0; x < NUM_CELLS; x++) {
      const a = x + (NUM_CELLS + 1) * y;
			const b = x + (NUM_CELLS + 1) * (y + 1);
			const c = (x + 1) + (NUM_CELLS + 1) * (y + 1);
			const d = (x + 1) + (NUM_CELLS + 1) * y;

      indices[(i * 3 * 2) + 0] = a;
      indices[(i * 3 * 2) + 1] = b;
      indices[(i * 3 * 2) + 2] = d;

      indices[(i * 3 * 2) + 3] = b;
      indices[(i * 3 * 2) + 4] = c;
      indices[(i * 3 * 2) + 5] = d;

      i++;
    }
  }

  for (let i = 0; i < indices.length; i += 3) {
    const vA = indices[i + 0] * 3;
    const vB = indices[i + 1] * 3;
    const vC = indices[i + 2] * 3;

    const pA = Vector3.fromArray(positions, vA);
    const pB = Vector3.fromArray(positions, vB);
    const pC = Vector3.fromArray(positions, vC);

    const cb = pC.sub(pB).cross(pA.sub(pB));

    normals[vA + 0] += cb.x;
    normals[vA + 1] += cb.y;
    normals[vA + 2] += cb.z;

    normals[vB + 0] += cb.x;
    normals[vB + 1] += cb.y;
    normals[vB + 2] += cb.z;

    normals[vC + 0] += cb.x;
    normals[vC + 1] += cb.y;
    normals[vC + 2] += cb.z;
  }

  return {
    offset,
    positions,
    normals,
    colors,
    indices,
  };
};

const _getCoordOverscanIndex = (x, y) => x + (y * NUM_CELLS_OVERSCAN);

const _normalizeElevation = elevation => {
  if (elevation >= 0) {
    return elevation;
  } else {
    return -Math.pow(-elevation, 0.5);
  }
};
const _getBiome = p => {
  if (p.coast) {
    return 'BEACH';
  } else if (p.ocean) {
    return 'OCEAN';
  } else if (p.water) {
    if (p.elevation < 6) { return 'MARSH'; }
    if (p.elevation > 28) { return 'ICE'; }
    return 'LAKE';
  } else if (p.lava > 2) {
    return 'MAGMA';
  } else if (p.elevation > 28) {
    if (p.moisture > 0.50) { return 'SNOW'; }
    else if (p.moisture > 0.33) { return 'TUNDRA'; }
    else if (p.moisture > 0.16) { return 'BARE'; }
    else { return 'SCORCHED'; }
  } else if (p.elevation > 18) {
    if (p.moisture > 0.66) { return 'TAIGA'; }
    else if (p.moisture > 0.33) { return 'SHRUBLAND'; }
    else { return 'TEMPERATE_DESERT'; }
  } else if (p.elevation > 6) {
    if (p.moisture > 0.83) { return 'TEMPERATE_RAIN_FOREST'; }
    else if (p.moisture > 0.50) { return 'TEMPERATE_DECIDUOUS_FOREST'; }
    else if (p.moisture > 0.16) { return 'GRASSLAND'; }
    else { return 'TEMPERATE_DESERT'; }
  } else {
    if (p.moisture > 0.66) { return 'TROPICAL_RAIN_FOREST'; }
    else if (p.moisture > 0.33) { return 'TROPICAL_SEASONAL_FOREST'; }
    else if (p.moisture > 0.16) { return 'GRASSLAND'; }
    else { return 'SUBTROPICAL_DESERT'; }
  }
};
const _getTriangleBiome = (ap, bp, cp) => {
  const elevation = (ap.elevation + bp.elevation + cp.elevation) / 3;
  const moisture = (ap.moisture + bp.moisture + cp.moisture) / 3;
  const numLand = (+ap.land) + (+bp.land) + (+cp.land);
  const land = numLand > 0;
  const numWater = (+ap.water) + (+bp.water) + (+cp.water);
  const water = numWater > 0;
  const numOcean = (+ap.ocean) + (+bp.ocean) + (+cp.ocean);
  const ocean = numOcean > 0;
  const coast = numLand >= 1 && numOcean >= 1;
  const lava = (ap.lava || 0) + (bp.lava || 0) + (cp.lava || 0);

  return _getBiome({
    elevation,
    moisture,
    land,
    water,
    ocean,
    coast,
    lava,
  });
};
const _colorIntToArray = n => ([
  ((n >> (8 * 2)) & 0xFF) / 0xFF,
  ((n >> (8 * 1)) & 0xFF) / 0xFF,
  ((n >> (8 * 0)) & 0xFF) / 0xFF,
]);

module.exports = {
  buildMapChunk,
  compileMapChunk,
};
