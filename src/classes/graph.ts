export class Graph {
  walls: number[];
  exits: number[];

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

  getSurroundingNodes(node: number): number[] {
    const nodeX = node % 50;
    const nodeY = Math.floor(node / 50);
    let xMinus = 1;
    let xPlus = 1;
    if (nodeX === 0) {
      xMinus = 0;
    } else if (nodeX === 49) {
      xPlus = 0;
    }
    let yMinus = 1;
    let yPlus = 1;
    if (nodeY === 0) {
      yMinus = 0;
    } else if (nodeY === 49) {
      yPlus = 0;
    }

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

  getNeighbors(node: number): number[] {
    // Get neighbors treats exit nodes as normal nodes, i.e. it does not use
    // the symbolic exit (the first exit) to get neighbors, but the actual
    // provided index.

    // Nodes not in the graph have no neighbors
    if (_.includes(this.walls, node)) {
      return [];
    }

    // Get the surrounding nodes, get them in the graph, and remove any possible
    // undefined neighbors (e.g. walls).
    const surrounding = this.getSurroundingNodes(node);
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
}
