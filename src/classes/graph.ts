export class Graph {
  walls: number[];
  exits: number[];

  public static coordToIndex(coord: { x: number; y: number }): number {
    return coord.x + coord.y * 50;
  }

  constructor(walls: number[], exits: number[]) {
    this.walls = walls;
    this.exits = exits;
  }

  getNode(node: number): number | undefined {
    // Walls are not part of the graph
    if (_.includes(this.walls, node)) {
      return undefined;
    }
    // The first node in this.exits is that symbolic exit
    if (_.includes(this.exits, node)) {
      return this.exits[0];
    }
    // If the node isn't a wall or exit, it's in the graph
    return node;
  }

  getSurroundingNodes(node: number, radius = 1): number[] {
    const nodeX = node % 50;
    const nodeY = Math.floor(node / 50);

    // Adjust by the radius or the max possible adjustment staying within 0-49
    const xMinus = Math.min(radius, nodeX);
    const xPlus = Math.min(radius, 49 - nodeX);
    const yMinus = Math.min(radius, nodeY);
    const yPlus = Math.min(radius, 49 - nodeY);

    const surrounding: number[] = [];
    for (let y = nodeY - yMinus; y <= nodeY + yPlus; y++) {
      for (let x = nodeX - xMinus; x <= nodeX + xPlus; x++) {
        if (x + y * 50 === node) {
          continue;
        }
        surrounding.push(x + y * 50);
      }
    }

    return surrounding;
  }

  public getNeighbors(
    node: number,
    radius = 1,
    getWallNeighbors = false,
  ): number[] {
    // Get neighbors treats exit nodes as normal nodes, i.e. it does not use
    // the symbolic exit (the first exit) to get neighbors, but the actual
    // provided index.

    // Nodes not in the graph have no neighbors
    if (!getWallNeighbors && _.includes(this.walls, node)) {
      return [];
    }

    // Get the surrounding nodes, get them in the graph, and remove any possible
    // undefined neighbors (e.g. walls).
    const surrounding = this.getSurroundingNodes(node, radius);
    const neighbors = _.map(surrounding, (tile) => this.getNode(tile));
    _.remove(neighbors, _.isUndefined);

    return neighbors as number[];
  }

  getBoundaryNodes(): number[] {
    // Boundary nodes are nodes that exist in the graph (not walls) with less
    // than 8 neighbors (e.g. at least one of its neighbors is a wall).
    const boundaries: number[] = [];
    for (let i = 0; i < 50 * 50; i++) {
      const node = this.getNode(i);
      if (node != undefined && this.getNeighbors(i).length < 8) {
        boundaries.push(i);
      }
    }

    return boundaries;
  }

  public distanceTransform(): number[] {
    const boundaries = this.getBoundaryNodes();
    // FIFO queue initialized to boundary nodes
    const queue = boundaries.slice();
    // Set of discovered nodes initialized to boundary nodes
    const discovered = boundaries.slice();

    // Initialize all distances to -1
    const distances = new Array<number>(50 * 50);
    for (let i = 0; i < 50 * 50; i++) {
      distances[i] = -1;
    }

    // A node with distance 0 is adjacent to a wall
    let distance = 0;
    // Number of nodes with the current distance
    let currentClassSize = 0;
    // Number of nodes with the previous distance
    let previousClassSize = queue.length;

    while (queue.length > 0) {
      if (currentClassSize === previousClassSize) {
        currentClassSize = 0;
        previousClassSize = queue.length;
        distance++;
      }

      const node = queue.shift();
      if (node == undefined) {
        throw new Error("Queue unexpectedly has undefined element");
      }
      if (distances[node] === -1) {
        distances[node] = distance;
        currentClassSize++;
      }

      // Traverse through the graph through neighbors
      const neighbors = this.getNeighbors(node);
      _.forEach(neighbors, (neighbor) => {
        if (!_.includes(discovered, neighbor)) {
          queue.push(neighbor);
          discovered.push(neighbor);
        }
      });
    }

    return distances;
  }

  /**
   * Find the closest tile from a provided tile (included) with a distance
   * transform value higher than a provided distance. Uses a breadth-first
   * search (I believe, lol). Can accept a list of nodes to ignore as solutions
   * but to still traverse through.
   */
  public findClosestTileWithDistance(
    startTile: number,
    distance: number,
    distanceTransform: number[],
    ignore?: number[],
    ignoreRadius = 0,
  ): number | undefined {
    if (ignore == undefined) {
      ignore = [];
    }

    // FIFO queue
    const queue = [startTile];
    const discovered = [startTile];

    while (queue.length > 0) {
      const node = queue.shift();
      if (node == undefined) {
        throw new Error("Queue unexpectedly has undefined element");
      }

      // First check that the tile isn't ignored
      if (!_.includes(ignore, node)) {
        // Then check that tiles within the ignore radius aren't ignored
        if (ignoreRadius > 0) {
          const radiusNeighbors = this.getNeighbors(node, ignoreRadius);
          // Make sure there are no walls within the radius
          if ((2 * ignoreRadius + 1) ** 2 === radiusNeighbors.length + 1) {
            // Try and find a node in both the radius and ignore arrays
            const overlap = _.find(radiusNeighbors, (neighbor) => {
              // TODO: Why is `|| []` necessary here?
              return _.includes(ignore || [], neighbor);
            });
            if (overlap == undefined) {
              return node;
            }
          }
        } else {
          // Ignore radius is 0, so since the tile isn't ignored, success
          return node;
        }
      }

      // Traverse through the graph through neighbors
      const neighbors = this.getNeighbors(node);
      _.forEach(neighbors, (neighbor) => {
        if (!_.includes(discovered, neighbor)) {
          queue.push(neighbor);
          discovered.push(neighbor);
        }
      });
    }

    // No such node found in the graph
    return undefined;
  }
}
