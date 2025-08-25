use std::{
    collections::{HashSet, VecDeque},
    ops::{Index, IndexMut},
};

use screeps::{Direction, ROOM_AREA, RoomXY, linear_index_to_xy, xy_to_linear_index};

pub fn mincut(
    sources: &HashSet<RoomXY>,
    obstacles: &HashSet<RoomXY>,
    sinks: &HashSet<RoomXY>,
) -> Result<Vec<RoomXY>, &'static str> {
    let mut capacities = Capacities::new(obstacles);

    loop {
        let (levels, reachable) = construct_levels(sources, sinks, &capacities);
        if !reachable {
            let boundary = find_boundary(&levels);
            return Ok(boundary);
        }
        let should_continue = blocking_flow(sources, sinks, &mut capacities, &levels);
        if !should_continue {
            return Err("Source connected to sink");
        }
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
            // Only propagate if the neighbor hasn't been reached and the current -> neighbor edge
            // has capacity
            if let Some(neighbor) = current.neighbor(direction)
                && levels[neighbor] == u16::MAX
                && capacities[current][direction]
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
) -> bool {
    let mut stack: Vec<Tile> = Vec::new();
    let mut flow: Vec<(Tile, EdgeDirection)> = Vec::new();
    let mut edges = EdgeTracker::new();

    // Run searches until the sink cannot be reached
    'searches: loop {
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
                // If a source is directly connected to a sink, it is not possible to find a
                // minimum-cut since that edge has infinite capacity.
                if flow.len() == 1 {
                    return false;
                }
                flow.drain(..)
                    .for_each(|(tile, direction)| capacities.update(tile, direction));
                continue 'searches;
            }

            // Immediately proceed to valid neighbors
            while let Some(direction) = edges.peek(current) {
                if capacities[current][direction]
                    && let Some(neighbor) = current.neighbor(direction)
                    && levels[neighbor] == levels[current] + 1
                    && edges.peek(neighbor).is_some()
                {
                    stack.push(neighbor);
                    flow.push((current, direction));
                    continue 'dfs;
                }

                edges.next(current);
            }

            // No more neighbors, pop the stack
            stack.pop();
            flow.pop();
        }

        // Failed to reach sink, stop searches
        return true;
    }
}

fn find_boundary(levels: &Levels) -> Vec<RoomXY> {
    (0..ROOM_AREA)
        .map(linear_index_to_xy)
        .filter(|&xy| levels[Tile::Input(xy)] < u16::MAX && levels[Tile::Output(xy)] == u16::MAX)
        .collect()
}

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
    fn is_input(&self) -> bool {
        match self {
            Tile::Input(_) => true,
            Tile::Output(_) => false,
        }
    }

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

// Capacities can be representated as bool "has flow" since each blocking flow will be restricted
// by the inner edge that has capacity 1
#[derive(Copy, Clone, Default)]
struct TileCapacities([bool; 9]);

impl std::fmt::Debug for TileCapacities {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let directions: Vec<EdgeDirection> = self
            .0
            .iter()
            .enumerate()
            .filter(|(_, has_capacity)| **has_capacity)
            .map(|(direction, _)| EDGE_DIRECTIONS[direction])
            .collect();
        write!(f, "{directions:?}")
    }
}

impl Index<EdgeDirection> for TileCapacities {
    type Output = bool;
    fn index(&self, index: EdgeDirection) -> &Self::Output {
        &self.0[index as usize]
    }
}

impl IndexMut<EdgeDirection> for TileCapacities {
    fn index_mut(&mut self, index: EdgeDirection) -> &mut Self::Output {
        &mut self.0[index as usize]
    }
}

#[derive(Debug)]
struct Capacities([TileCapacities; 2 * ROOM_AREA]);

impl Capacities {
    fn new(obstacles: &HashSet<RoomXY>) -> Capacities {
        // Initialize all capacities to zero
        let mut capacities = Capacities([TileCapacities::default(); 2 * ROOM_AREA]);

        (0..ROOM_AREA).map(linear_index_to_xy).for_each(|xy| {
            if obstacles.contains(&xy) {
                return;
            }

            // Each tiles input -> output edge has capacity
            capacities[Tile::Input(xy)][EdgeDirection::Inner] = true;
            // Every grid edge from this tile's output -> it's neighbor's input has capacity
            EdgeDirection::iter().for_each(|direction| {
                if direction == EdgeDirection::Inner {
                    return;
                }
                if let Some(neighbor) = Tile::Output(xy).neighbor(direction)
                    && !obstacles.contains(&neighbor.xy())
                {
                    capacities[Tile::Output(xy)][direction] = true;
                }
            });
        });

        capacities
    }

    fn update(&mut self, tile: Tile, direction: EdgeDirection) {
        // Non-inner edges from outputs have infinite capacity, so only remove capacity from edges
        // going from inputs or inner edges going from outputs
        if tile.is_input() || direction == EdgeDirection::Inner {
            self[tile][direction] = false;
        }
        self[tile.neighbor(direction).unwrap()][direction.reverse()] = true;
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
struct Levels([u16; 2 * ROOM_AREA]);

impl Index<Tile> for Levels {
    type Output = u16;
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
        Self([u16::MAX; 2 * ROOM_AREA])
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
