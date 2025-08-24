use std::{
    collections::{HashSet, VecDeque},
    ops::{Index, IndexMut},
};

use screeps::{Direction, ROOM_AREA, RoomXY, linear_index_to_xy, xy_to_linear_index};

#[derive(Copy, Clone)]
enum Tile {
    Input(RoomXY),
    Output(RoomXY),
}

impl std::fmt::Debug for Tile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Tile::Input(xy) => write!(f, " Input{xy}"),
            Tile::Output(xy) => write!(f, "Output{xy}"),
        }
    }
}

impl Tile {
    fn neighbor(&self, direction: EdgeDirection) -> Option<Tile> {
        match *self {
            Tile::Input(xy) => match direction {
                EdgeDirection::Inner => Some(Tile::Output(xy)),
                _ => xy
                    .checked_add_direction(direction.to_room_direction().unwrap())
                    .map(Tile::Output),
            },
            Tile::Output(xy) => match direction {
                EdgeDirection::Inner => Some(Tile::Input(xy)),
                _ => xy
                    .checked_add_direction(direction.to_room_direction().unwrap())
                    .map(Tile::Input),
            },
        }
    }

    fn xy(&self) -> RoomXY {
        match *self {
            Tile::Input(xy) => xy,
            Tile::Output(xy) => xy,
        }
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum EdgeDirection {
    Inner,
    Top,
    TopRight,
    Right,
    BottomRight,
    Bottom,
    BottomLeft,
    Left,
    TopLeft,
}
type EdgeDirectionIter = std::iter::Copied<std::slice::Iter<'static, EdgeDirection>>;
const EDGE_DIRECTIONS: [EdgeDirection; 9] = [
    EdgeDirection::Inner,
    EdgeDirection::Top,
    EdgeDirection::TopRight,
    EdgeDirection::Right,
    EdgeDirection::BottomRight,
    EdgeDirection::Bottom,
    EdgeDirection::BottomLeft,
    EdgeDirection::Left,
    EdgeDirection::TopLeft,
];
impl EdgeDirection {
    fn iter() -> EdgeDirectionIter {
        EDGE_DIRECTIONS.iter().copied()
    }

    fn to_room_direction(self) -> Option<Direction> {
        match self {
            Self::Inner => None,
            Self::Top => Some(Direction::Top),
            Self::TopLeft => Some(Direction::TopLeft),
            Self::Left => Some(Direction::Left),
            Self::BottomLeft => Some(Direction::BottomLeft),
            Self::Bottom => Some(Direction::Bottom),
            Self::BottomRight => Some(Direction::BottomRight),
            Self::Right => Some(Direction::Right),
            Self::TopRight => Some(Direction::TopRight),
        }
    }

    fn reverse(&self) -> EdgeDirection {
        self.to_room_direction()
            .map_or(EdgeDirection::Inner, |direction| {
                EDGE_DIRECTIONS[direction.multi_rot(4) as usize]
            })
    }
}

#[derive(Copy, Clone, Default, Debug)]
struct TileCapacities([u32; 9]);

impl Index<EdgeDirection> for TileCapacities {
    type Output = u32;
    fn index(&self, index: EdgeDirection) -> &Self::Output {
        &self.0[index as usize]
    }
}

impl IndexMut<EdgeDirection> for TileCapacities {
    fn index_mut(&mut self, index: EdgeDirection) -> &mut Self::Output {
        &mut self.0[index as usize]
    }
}

const INFINITE: u32 = 10_000;

#[derive(Debug)]
struct Capacities([TileCapacities; 2 * ROOM_AREA]);

impl Capacities {
    fn new(obstacles: &HashSet<RoomXY>) -> Capacities {
        // Initialize all capacities to zero
        let mut capacities =
            Capacities([TileCapacities([0, 0, 0, 0, 0, 0, 0, 0, 0]); 2 * ROOM_AREA]);

        (0..ROOM_AREA).map(linear_index_to_xy).for_each(|xy| {
            if obstacles.contains(&xy) {
                return;
            }

            // Each tiles input -> output edge has capacity 1
            capacities[Tile::Input(xy)][EdgeDirection::Inner] = 1;
            // Every grid edge from this tile's output -> it's neighbor's input has INFINITE
            // capacity
            EdgeDirection::iter().for_each(|direction| {
                if direction == EdgeDirection::Inner {
                    return;
                }
                if let Some(neighbor) = Tile::Output(xy).neighbor(direction)
                    && !obstacles.contains(&neighbor.xy())
                {
                    capacities[Tile::Output(xy)][direction] = INFINITE;
                }
            });
        });

        capacities
    }

    fn update(&mut self, tile: Tile, direction: EdgeDirection, amount: u32) {
        self[tile][direction] -= amount;
        self[tile.neighbor(direction).unwrap()][direction.reverse()] += amount;

        if ![0, 1, INFINITE - 1, INFINITE].contains(&self[tile][direction]) {
            println!("{:?} {direction:?} is {}", tile, self[tile][direction]);
        }

        if ![0, 1, INFINITE - 1, INFINITE].contains(&self[tile][direction]) {
            println!(
                "{:?} {direction:?} is {} (rev)",
                tile.neighbor(direction).unwrap(),
                self[tile.neighbor(direction).unwrap()][direction.reverse()]
            );
        }
    }
}

impl Index<Tile> for Capacities {
    type Output = TileCapacities;
    fn index(&self, index: Tile) -> &Self::Output {
        match index {
            Tile::Input(xy) => &self.0[2 * xy_to_linear_index(xy)],
            Tile::Output(xy) => &self.0[2 * xy_to_linear_index(xy) + 1],
        }
    }
}

impl IndexMut<Tile> for Capacities {
    fn index_mut(&mut self, index: Tile) -> &mut Self::Output {
        match index {
            Tile::Input(xy) => &mut self.0[2 * xy_to_linear_index(xy)],
            Tile::Output(xy) => &mut self.0[2 * xy_to_linear_index(xy) + 1],
        }
    }
}

/// Level of this tile's input and output node
struct Levels([u32; 2 * ROOM_AREA]);

impl Index<Tile> for Levels {
    type Output = u32;
    fn index(&self, index: Tile) -> &Self::Output {
        match index {
            Tile::Input(xy) => &self.0[2 * xy_to_linear_index(xy)],
            Tile::Output(xy) => &self.0[2 * xy_to_linear_index(xy) + 1],
        }
    }
}

impl IndexMut<Tile> for Levels {
    fn index_mut(&mut self, index: Tile) -> &mut Self::Output {
        match index {
            Tile::Input(xy) => &mut self.0[2 * xy_to_linear_index(xy)],
            Tile::Output(xy) => &mut self.0[2 * xy_to_linear_index(xy) + 1],
        }
    }
}

impl Levels {
    fn new() -> Self {
        Self([u32::MAX; 2 * ROOM_AREA])
    }
}

struct EdgeTracker([u8; 2 * ROOM_AREA]);

impl EdgeTracker {
    fn new() -> Self {
        Self([0; 2 * ROOM_AREA])
    }

    fn peek(&self, tile: Tile) -> Option<EdgeDirection> {
        let counter = match tile {
            Tile::Input(xy) => self.0[2 * xy_to_linear_index(xy)],
            Tile::Output(xy) => self.0[2 * xy_to_linear_index(xy) + 1],
        };

        if counter == 9 {
            return None;
        }

        Some(EDGE_DIRECTIONS[counter as usize])
    }

    fn next(&mut self, tile: Tile) -> Option<EdgeDirection> {
        let counter = match tile {
            Tile::Input(xy) => &mut self.0[2 * xy_to_linear_index(xy)],
            Tile::Output(xy) => &mut self.0[2 * xy_to_linear_index(xy) + 1],
        };

        if *counter == 9 {
            return None;
        }

        let direction = Some(EDGE_DIRECTIONS[*counter as usize]);
        *counter += 1;
        direction
    }
}

pub fn mincut(sources: &[RoomXY], obstacles: &[RoomXY], sinks: &[RoomXY]) -> Vec<RoomXY> {
    let sources: HashSet<RoomXY> = sources.iter().copied().collect();
    let obstacles: HashSet<RoomXY> = obstacles.iter().copied().collect();
    let sinks: HashSet<RoomXY> = sinks.iter().copied().collect();
    let mut capacities = Capacities::new(&obstacles);

    let mut iters: usize = 0;
    println!("Starting mincut");
    loop {
        let (levels, reachable) = construct_levels(&sources, &sinks, &capacities);

        println!("iter {iters}");
        iters += 1;

        if !reachable {
            println!("not reachable");
            let boundary = find_boundary(&levels);
            println!("boundary: {:?}", boundary);
            return boundary;
        }
        println!("blocking");
        blocking_flow(&sources, &sinks, &mut capacities, &levels);
    }
}

fn construct_levels(
    sources: &HashSet<RoomXY>,
    sinks: &HashSet<RoomXY>,
    capacities: &Capacities,
) -> (Levels, bool) {
    let mut queue: VecDeque<Tile> = VecDeque::new();
    let mut levels = Levels::new();
    let mut reachable = false;

    sources.iter().for_each(|&source| {
        let source = Tile::Output(source);
        queue.push_back(source);
        levels[source] = 0;
    });

    while let Some(current) = queue.pop_front() {
        EdgeDirection::iter().for_each(|direction| {
            // Only propagate if the neighbor hasn't been reached and the current -> neighbor edge has capacity
            if let Some(neighbor) = current.neighbor(direction)
                && levels[neighbor] == u32::MAX
                && capacities[current][direction] > 0
            {
                levels[neighbor] = levels[current] + 1;
                queue.push_back(neighbor);
                if sinks.contains(&neighbor.xy()) {
                    reachable = true;
                }
            }
        });
    }

    (levels, reachable)
}

fn blocking_flow(
    sources: &HashSet<RoomXY>,
    sinks: &HashSet<RoomXY>,
    capacities: &mut Capacities,
    levels: &Levels,
) {
    let mut stack: Vec<Tile> = Vec::new();
    let mut flow: Vec<(Tile, EdgeDirection, u32)> = Vec::new();
    let mut edges = EdgeTracker::new();

    // Run searches until the sink cannot be reached
    let mut iters = 0;
    'searches: loop {
        if iters > 10 {
            println!("Too many searches");
            return;
        }

        stack.clear();
        sources
            .iter()
            .copied()
            .map(Tile::Output)
            .for_each(|source| stack.push(source));

        // DFS to sink along the level graph
        'dfs: while let Some(&current) = stack.last() {
            // Reached the sink, update capacities and start a new search
            if sinks.contains(&current.xy()) {
                println!("Sink reached");
                flow.drain(..).for_each(|(tile, direction, amount)| {
                    capacities.update(tile, direction, amount)
                });
                iters += 1;
                continue 'searches;
            }

            // Immediately proceed to valid neighbors
            while let Some(direction) = edges.peek(current) {
                if capacities[current][direction] > 0
                    && let Some(neighbor) = current.neighbor(direction)
                    && levels[neighbor] == levels[current] + 1
                    && edges.peek(neighbor).is_some()
                {
                    stack.push(neighbor);
                    let amount = flow
                        .last()
                        .map_or(INFINITE, |(_, _, current)| *current)
                        .min(capacities[current][direction]);
                    flow.push((current, direction, amount));
                    continue 'dfs;
                }

                edges.next(current);
            }

            // No more neighbors, pop the stack
            stack.pop();
            flow.pop();
        }

        // Failed to reach sink, stop searches
        return;
    }
}

fn find_boundary(levels: &Levels) -> Vec<RoomXY> {
    (0..ROOM_AREA)
        .map(linear_index_to_xy)
        .filter(|&xy| levels[Tile::Input(xy)] < u32::MAX && levels[Tile::Output(xy)] == u32::MAX)
        .collect()
}
