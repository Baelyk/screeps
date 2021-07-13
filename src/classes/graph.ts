export class OldGraph {
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

class Edge {
  from: number;
  to: number;
  capacity: number;
  flow: number;

  constructor(from: number, to: number, capacity: number, flow = 0) {
    this.from = from;
    this.to = to;
    this.capacity = capacity;
    this.flow = flow;
  }

  resCap(): number {
    return this.capacity - this.flow;
  }

  toString(): string {
    return `${this.from} --> ${this.to} [${this.flow}/${this.capacity}]`;
  }
}

type EdgeList = { [key: number]: Edge[] };
type Levels = { [key: number]: number };
type NextList = { [key: number]: number };

export class Graph {
  static order = 50 * 50;
  edges: EdgeList;
  source: number;
  sink: number;

  static getSurrounding(node: number, radius = 1): number[] {
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

  private static generateEdges(
    sources: number[],
    sinks: number[],
    walls: number[],
  ): EdgeList {
    const source = sources[0];
    const sink = sinks[0];

    const edges: EdgeList = {};

    for (let i = 0; i < this.order; i++) {
      const surrounding = _.difference(this.getSurrounding(i), walls);
      const removedSources = _.remove(surrounding, (node) =>
        _.includes(sources, node),
      );
      const removedSinks = _.remove(surrounding, (node) =>
        _.includes(sinks, node),
      );
      if (removedSources.length > 0) {
        surrounding.push(source);
      }
      if (removedSinks.length > 0) {
        surrounding.push(sink);
      }
      edges[i] = _.map(surrounding, (node) => new Edge(i, node, 1));
    }

    return edges;
  }

  static createScreepsGraph(
    sources: number[],
    sinks: number[],
    walls: number[],
  ): Graph {
    const graph = new Graph(sources[0], sinks[0]);
    graph.edges = Graph.generateEdges(sources, sinks, walls);
    return graph;
  }

  constructor(source: number, sink: number) {
    this.source = source;
    this.sink = sink;
    this.edges = {};
  }

  addEdge(from: number, to: number, capacity: number, reverse = false): void {
    const edge = new Edge(from, to, capacity);
    if (this.edges[from] == undefined) {
      this.edges[from] = [edge];
    } else {
      const existingEdge = _.find(this.edges[from], { to: to });
      if (existingEdge != undefined) {
        existingEdge.capacity += capacity;
      } else {
        this.edges[from].push(edge);
      }
    }

    if (!reverse) {
      this.addEdge(to, from, capacity, true);
    }
  }

  getReverseEdge(edge: Edge): Edge {
    const reverse = _.find(this.edges[edge.to], { to: edge.from });
    if (reverse == undefined) {
      throw new Error(`Reverse edge does not exist for ${edge.toString()}`);
    }
    return reverse;
  }

  augmentFlow(edge: Edge, flow: number): void {
    edge.flow += flow;
    this.getReverseEdge(edge).flow -= flow;
  }

  getResNeighbors(node: number): number[] {
    const edges = this.edges[node];

    // Node isn't in graph or isn't connected
    if (edges == undefined || edges.length === 0) {
      return [];
    }

    // Must have positive residual capacity
    return _.pluck(
      _.filter(edges, (edge) => edge.resCap() > 0),
      "to",
    );
  }

  getLevelNeighbors(levels: Levels, node: number): number[] {
    const edges = this.edges[node];

    // Node isn't in graph or isn't connected
    if (edges == undefined || edges.length === 0) {
      return [];
    }

    // Must have positive residual capacity and increase level by exactly 1
    return _.pluck(
      _.filter(
        edges,
        (edge) =>
          edge.resCap() > 0 && levels[edge.to] === levels[edge.from] + 1,
      ),
      "to",
    );
  }

  levelGraph(): Levels | null {
    // Levels, levels
    const levels: Levels = {};
    // BFS starting at the source
    // FIFO queue
    const queue: number[] = [this.source];
    // Set
    const discovered: number[] = [this.source];

    let level = 0;
    // Number of nodes with the current level
    let currentClassSize = 0;
    // Number of nodes with the previous level
    let previousClassSize = queue.length;

    let sinkReached = false;

    while (queue.length > 0) {
      const node = queue.shift();
      if (node == undefined) {
        throw new Error("Unexpected undefined in queue");
      }

      if (currentClassSize === previousClassSize) {
        currentClassSize = 0;
        previousClassSize = queue.length;
        level++;
      }
      if (levels[node] == undefined) {
        levels[node] = level;
        currentClassSize++;
      }

      const neighbors = this.getResNeighbors(node);
      _.forEach(neighbors, (neighbor) => {
        if (!_.includes(discovered, neighbor)) {
          if (neighbor === this.sink) {
            sinkReached = true;
          }

          queue.push(neighbor);
          discovered.push(neighbor);
        }
      });
    }

    if (!sinkReached) {
      return null;
    }

    return levels;
  }

  augmentingFlow(
    levels: Levels,
    next: NextList,
    current: number,
    flow: number,
  ): number {
    // Recursive DFS to sink
    if (current === this.sink) {
      // Sink reached, pass the flow back
      return flow;
    }

    // Go through current's edges starting with the next[current]th edge,
    // incremented after each failed search from current to ignore dead ends
    const edgeCount = this.edges[current].length;
    if (next[current] == undefined) {
      // If current has never been reached, start at the first edge
      next[current] = 0;
    }
    for (; next[current] < edgeCount; next[current]++) {
      const edge = this.edges[current][next[current]];
      // Edge is traversable if it has residual capacity and is exactly +1 level
      if (edge.resCap() > 0 && levels[edge.to] === levels[current] + 1) {
        // The flow is now limited by this edge's capacity
        flow = Math.min(edge.resCap(), flow);
        const furtherFlow = this.augmentingFlow(levels, next, edge.to, flow);
        // If the flow continues, the sink was reached, so update this edge's
        // flow
        if (furtherFlow > 0) {
          this.augmentFlow(edge, furtherFlow);
          // Pass the flow back
          return furtherFlow;
        }
      }
    }

    // Dead end, so flow 0
    return 0;
  }

  dinicMaxFlow(): number {
    let maxFlow = 0;
    let levels = this.levelGraph();

    while (levels != undefined) {
      const next: NextList = {};
      let blockingFlow = 0;
      let augmentingFlow = 0;

      // Find augmenting flows until a blocking flow is reached
      do {
        augmentingFlow = this.augmentingFlow(
          levels,
          next,
          this.source,
          Infinity,
        );
        blockingFlow += augmentingFlow;
      } while (augmentingFlow > 0);

      // Add the blocking flow to the max flow
      maxFlow += blockingFlow;

      // Recreate level graph for next iteration
      levels = this.levelGraph();
    }

    return maxFlow;
  }
}

export function testing(): void {
  console.log("Hello, testing time!");
}
