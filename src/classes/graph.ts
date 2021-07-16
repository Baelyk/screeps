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

  public static coordToIndex(coord: { x: number; y: number }): number {
    return coord.x + coord.y * 50;
  }

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

  static createScreepsGraph(
    sources: number[],
    sinks: number[],
    walls: number[],
  ): Graph {
    const graph = new Graph(sources[0], sinks[0]);
    graph.generateEdges(sources, sinks, walls);
    return graph;
  }

  constructor(source: number, sink: number) {
    this.source = source;
    this.sink = sink;
    this.edges = {};
  }

  toString(): string {
    let output = `[Source: ${this.source} | Sink: ${this.sink}]`;
    _.forEach(this.edges, (edgeList) => {
      _.forEach(edgeList, (edge) => {
        output += `\n\t${edge.toString()}`;
      });
    });
    return output;
  }

  printEdges(node: number): void {
    let output = `Edges of node ${node}:`;
    _.forEach(this.edges[node], (edge) => {
      output += `\n\t${edge.toString()}`;
    });
    console.log(output);
  }

  showFlow(roomName?: string): void {
    const visual = new RoomVisual(roomName);
    _.forEach(this.edges, (edgeList) => {
      _.forEach(edgeList, (edge) => {
        let color = "white";
        let opacity = 0.5;
        if (edge.flow > 0) {
          color = "black";
          opacity = 1;
        }
        if (edge.flow > 0) {
          visual.line(
            edge.from % 50,
            Math.floor(edge.from / 50),
            edge.to % 50,
            Math.floor(edge.to / 50),
            { opacity, color },
          );
        }
      });
    });
  }

  generateEdges(sources: number[], sinks: number[], walls: number[]): void {
    for (let i = 0; i < 50 * 50; i++) {
      let capacity = 1;
      // Wall's aren't part of the graph, unless they're part of the source
      if (!_.includes(sources, i) && _.includes(walls, i)) {
        continue;
      }

      let surrounding = _.difference(Graph.getSurrounding(i), walls);

      // Nodes connect to the representative source, not individual "sources"
      surrounding = _.map(surrounding, (node) =>
        _.includes(sources, node) ? this.source : node,
      );

      // Sinks can connect to other sinks, but non-sinks only connect to the
      // representative sink (`this.sink`)
      if (_.includes(sinks, i)) {
        // However, these edges do not have any capacity
        capacity = 0;
      } else {
        surrounding = _.map(surrounding, (node) =>
          _.includes(sinks, node) ? this.sink : node,
        );
      }

      // If `i` is in the source, mark edges as from `this.source`.
      const from = _.includes(sources, i) ? this.source : i;
      _.forEach(surrounding, (node) => this.addEdge(from, node, capacity));
    }
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
      this.addEdge(to, from, 0, true);
    }
  }

  getReverseEdge(edge: Edge): Edge {
    const reverse = _.find(this.edges[edge.to], { to: edge.from });
    if (reverse == undefined) {
      throw new Error(`Reverse edge does not exist for ${edge.toString()}`);
    }
    return reverse;
  }

  addToSource(node: number): void {
    const edges = this.edges[node];
    _.forEach(edges, (edge) => {
      // Add edge from the source to this neighbor (and reverse edge)
      this.addEdge(this.source, edge.to, edge.capacity);
      // Remove capacity on this and the reverse edge
      edge.capacity = 0;
      this.getReverseEdge(edge).capacity = 0;
    });
  }

  addManyToSource(nodes: number[]): void {
    _.forEach(nodes, (node) => this.addToSource(node));
  }

  getNeighbors(node: number, range = 1): number[] {
    const surrounding = Graph.getSurrounding(node, range);
    return _.filter(surrounding, (tile) => this.edges[tile] != undefined);
  }

  augmentFlow(edge: Edge, flow: number): void {
    edge.flow += flow;
    this.getReverseEdge(edge).flow -= flow;
  }

  levelGraph(): Levels | null {
    // Levels, levels
    const levels: Levels = {};
    // BFS starting at the source
    // FIFO queue
    const queue: number[] = [this.source];
    levels[this.source] = 0;

    let sinkReached = false;

    while (queue.length > 0) {
      const node = queue.shift();
      if (node == undefined) {
        throw new Error("Unexpected undefined in queue");
      }

      const edges = this.edges[node];
      _.forEach(edges, (edge) => {
        // Only edges with positive residual capacity are traversable
        if (edge.resCap() > 0 && levels[edge.to] == undefined) {
          if (edge.to === this.sink) {
            sinkReached = true;
          }

          levels[edge.to] = levels[node] + 1;
          queue.push(edge.to);
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

  nodesConnectedToSource(): number[] {
    // BFS from source
    // FIFO queue
    const queue: number[] = [this.source];
    const connected: number[] = [this.source];

    while (queue.length > 0) {
      const node = queue.shift();
      if (node == undefined) {
        throw new Error("Node unexpectedly undefined");
      }

      const edges = this.edges[node];
      _.forEach(edges, (edge) => {
        if (edge.resCap() > 0 && !_.includes(connected, edge.to)) {
          queue.push(edge.to);
          connected.push(edge.to);
        }
      });
    }

    const sourceAdjacent = _.pluck(this.edges[this.source], "to");
    return _.union(connected, sourceAdjacent);
  }

  minCutNodes(): number[] {
    const maxFlow = this.dinicMaxFlow();
    const connected = this.nodesConnectedToSource();
    const cut: number[] = [];
    _.forEach(connected, (node) => {
      const neighbors = _.pluck(this.edges[node], "to");
      if (_.some(neighbors, (neighbor) => !_.includes(connected, neighbor))) {
        cut.push(node);
      }
    });
    return cut;
  }

  getConnectedComponents(subgraph: number[]): number[][] {
    const remaining = [...subgraph];
    const components: number[][] = [];

    while (subgraph.length > 0) {
      const start = remaining.shift();
      if (start == undefined) {
        break;
      }

      const queue = [start];
      const component = [start];

      while (queue.length > 0) {
        const node = queue.shift();
        if (node == undefined) {
          throw new Error("Node unexpectedly undefined");
        }

        const edges = this.edges[node];
        _.forEach(edges, (edge) => {
          if (_.includes(remaining, edge.to)) {
            queue.push(edge.to);
            component.push(edge.to);
            _.pull(remaining, edge.to);
          }
        });
      }

      components.push(component);
    }

    return components;
  }

  wallPositions(): [number[], number[]] {
    const cuts = this.minCutNodes();
    const ramparts: number[] = [];
    const walls: number[] = [];

    const connectedComponents = this.getConnectedComponents(cuts);
    _.forEach(connectedComponents, (component) => {
      if (component.length <= 3) {
        ramparts.push(...component);
      } else {
        const middleIndex = Math.floor(component.length / 2);
        const rampart = _.slice(component, middleIndex - 1, middleIndex + 2);
        const wall = _.difference(component, rampart);
        ramparts.push(...rampart);
        walls.push(...wall);
      }
    });

    return [ramparts, walls];
  }

  isOpen(node: number, distance: number, blocked: number[]): boolean {
    const surrounding = this.getNeighbors(node, distance);
    // Node is open if `surrounding` and `blocked` have no intersection and it
    // has all the surrounding tiles it should have
    const area = (2 * distance + 1) ** 2 - 1;
    return (
      surrounding.length === area &&
      _.intersection(surrounding, blocked).length === 0
    );
  }

  findOpenTile(
    start: number,
    distance: number,
    blocked: number[],
  ): number | undefined {
    const queue = [start];
    const discovered = [start];

    while (queue.length > 0) {
      const node = queue.shift();
      if (node == undefined) {
        throw new Error("Queue unexpectedly has undefined");
      }

      if (this.isOpen(node, distance, blocked)) {
        return node;
      }

      const edges = this.edges[node];
      _.forEach(edges, (edge) => {
        if (!_.includes(discovered, edge.to)) {
          queue.push(edge.to);
          discovered.push(edge.to);
        }
      });
    }

    // No such tile found
    return undefined;
  }
}

export function testing(): void {
  console.log("Hello, testing time!");
  /*
  const graph = new Graph(-1, 9);

  graph.addEdge(-1, 0, 5);
  graph.addEdge(-1, 1, 10);
  graph.addEdge(-1, 2, 15);
  graph.addEdge(0, 3, 10);
  graph.addEdge(1, 0, 15);
  graph.addEdge(1, 4, 20);
  graph.addEdge(2, 5, 25);
  graph.addEdge(3, 4, 25);
  graph.addEdge(3, 6, 10);
  graph.addEdge(4, 2, 5);
  graph.addEdge(4, 7, 30);
  graph.addEdge(5, 7, 20);
  graph.addEdge(5, 8, 10);
  graph.addEdge(6, 9, 5);
  graph.addEdge(7, 3, 15);
  graph.addEdge(7, 8, 15);
  graph.addEdge(7, 9, 15);
  graph.addEdge(8, 9, 10);

  // Should be 30
  const maxFlow = graph.dinicMaxFlow();
  console.log(`Max flow: ${maxFlow}`);
  console.log(graph.toString());
  */

  const sources: number[] = [];
  let sinks: number[] = [];
  const walls: number[] = [];

  const room = Game.rooms["sim"];
  const terrain = new Room.Terrain("sim");
  for (let i = 0; i < 50 * 50; i++) {
    if (terrain.get(i % 50, Math.floor(i / 50)) === TERRAIN_MASK_WALL) {
      walls.push(i);
    }
  }
  _.forEach(
    room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_WALL } }),
    (wall) => walls.push(wall.pos.x + wall.pos.y * 50),
  );
  _.forEach(room.find(FIND_EXIT), (exit) => {
    sinks.push(exit.x + exit.y * 50);
    const unbuildable = _.difference(
      Graph.getSurrounding(exit.x + exit.y * 50),
      walls,
    );
    _.forEach(unbuildable, (node) => {
      sinks.push(node);
      // sinks.push(...Graph.getSurrounding(node));
    });
  });
  sinks = _.difference(_.uniq(sinks), walls);
  _.forEach(room.find(FIND_MY_STRUCTURES), (structure) =>
    sources.push(structure.pos.x + structure.pos.y * 50),
  );

  console.log(JSON.stringify(sources));
  console.log(JSON.stringify(sinks));
  console.log(JSON.stringify(walls));

  const graph = Graph.createScreepsGraph(sources, sinks, walls);
  const maxFlow = graph.dinicMaxFlow();
  console.log(`Max flow: ${maxFlow}`);
  const connected = graph.nodesConnectedToSource();
  const cut = graph.minCutNodes();
  const [minCutWalls, ramparts] = graph.wallPositions();
  const visual = new RoomVisual("sim");
  graph.printEdges(2 + 36 * 50);
  graph.printEdges(3 + 36 * 50);
  graph.printEdges(4 + 36 * 50);
  graph.printEdges(2 + 37 * 50);
  graph.printEdges(3 + 37 * 50);
  graph.printEdges(4 + 37 * 50);
  graph.printEdges(2 + 38 * 50);
  graph.printEdges(3 + 38 * 50);
  graph.printEdges(4 + 38 * 50);
  _.forEach(sinks, (node) => {
    visual.circle(node % 50, Math.floor(node / 50), {
      radius: 0.5,
      fill: "red",
    });
  });
  _.forEach(connected, (node) => {
    visual.circle(node % 50, Math.floor(node / 50), {
      radius: 0.5,
      fill: "green",
    });
  });
  _.forEach(cut, (node) => {
    visual.circle(node % 50, Math.floor(node / 50), {
      radius: 0.5,
      fill: "yellow",
    });
  });
  _.forEach(sources, (node) => {
    visual.circle(node % 50, Math.floor(node / 50), {
      radius: 0.5,
      fill: "blue",
    });
  });
  _.forEach(ramparts, (node) => {
    visual.circle(node % 50, Math.floor(node / 50), {
      radius: 0.3,
      fill: "white",
      opacity: 1,
    });
  });
  _.forEach(minCutWalls, (node) => {
    visual.circle(node % 50, Math.floor(node / 50), {
      radius: 0.3,
      fill: "black",
      opacity: 1,
    });
  });
  graph.showFlow();
}
