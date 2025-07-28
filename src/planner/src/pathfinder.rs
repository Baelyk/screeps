use std::collections::{hash_map::Entry, BinaryHeap, HashMap};

use screeps::{Direction, Position, ROOM_AREA};

#[derive(Copy, Clone)]
pub struct Options {
    pub range: u32,
    pub max_iters: u32,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            range: 0,
            max_iters: u32::MAX,
        }
    }
}

type Cost = u32;

#[derive(Copy, Clone, Debug)]
struct OpenSetItem {
    node: Position,
    direction: Direction,
    cost: Cost,
}

impl std::cmp::PartialEq for OpenSetItem {
    fn eq(&self, other: &Self) -> bool {
        self.cost == other.cost
    }
}

impl Eq for OpenSetItem {}

impl std::cmp::Ord for OpenSetItem {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Want to sort lower costs as greater for the BinaryHeap
        if self.cost == other.cost {
            std::cmp::Ordering::Equal
        } else if self.cost < other.cost {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Less
        }
    }
}

impl std::cmp::PartialOrd for OpenSetItem {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

fn jump<F1, F2>(
    cost_fn: F1,
    dest_fn: F2,
    pos: Position,
    direction: Direction,
) -> Option<(Position, Cost)>
where
    F1: Copy + Fn(Position) -> Cost,
    F2: Copy + Fn(Position) -> bool,
{
    let cost = cost_fn(pos);
    let mut current = pos;
    let mut jumps = 0;
    loop {
        // Stop jumping if the next tile is out of bounds
        let next = current.checked_add_direction(direction).ok()?;
        let next_cost = cost_fn(next);
        // TODO Stop jumping if the next tile is a wall
        if next_cost == ROOM_AREA as u32 {
            return None;
        }
        // If the next tile has a different cost, stop jumping and add the current tile to the open
        // set
        if next_cost != cost {
            // TODO: actually returning `next` not `current` to handle paths starting on unpathable
            // tiles, is that okay?
            return Some((next, cost * jumps));
        }
        jumps += 1;
        // If the next tile is the goal, stop jumping and add the the next tile to the open set
        if dest_fn(next) {
            return Some((next, cost * jumps));
        }
        // If the tiles above or below the next have a different cost, stop jumping and add the
        // next tile to the open set. Rotating the direction twice clockwise and counterclockwise
        // provide the correct analogies for above and below for any direction.
        if let Ok(next_below) = next.checked_add_direction(direction.multi_rot(2)) {
            if cost_fn(next_below) != cost {
                return Some((next, cost * jumps));
            }
        }
        if let Ok(next_above) = next.checked_add_direction(direction.multi_rot(-2)) {
            if cost_fn(next_above) != cost {
                return Some((next, cost * jumps));
            }
        }

        // If the direction is diagonal, check jumping in the horizontal and vertical components
        // and add the next tile to the open set if they run in to anything.
        if direction.is_diagonal() {
            let horizontal = jump(cost_fn, dest_fn, next, direction.multi_rot(1));
            if horizontal.is_some() {
                return Some((next, cost * jumps));
            }
            let vertical = jump(cost_fn, dest_fn, next, direction.multi_rot(-1));
            if vertical.is_some() {
                return Some((next, cost * jumps));
            }
        }

        // Keep jumping
        current = next;
    }
}

pub fn a_star<F1, F2>(
    cost_fn: F1,
    dest_fn: F2,
    start: Position,
    goal: Position,
    options: Options,
) -> Result<Vec<Position>, &'static str>
where
    F1: Fn(Position) -> Cost,
    F2: Fn(Position) -> bool,
{
    let mut open_set = BinaryHeap::new();
    let mut previous = HashMap::new();
    open_set.push(OpenSetItem {
        node: start,
        direction: Direction::Top,
        cost: start.get_range_to(goal),
    });

    let mut iters = 0;
    while let Some(OpenSetItem {
        node,
        direction,
        cost,
    }) = open_set.pop()
    {
        iters += 1;
        if iters > options.max_iters {
            return Err("Too many iters");
        }
        if dest_fn(node) {
            let mut path = Vec::with_capacity(cost as usize);
            let mut next = node;
            loop {
                let current = next;
                if current == start {
                    break;
                }
                next = *previous.get(&current).unwrap();
                let Some(direction) = current.get_direction_to(next) else {
                    return Err("Unable to get jump direction");
                };
                let mut jump_next = current;
                while jump_next != next {
                    path.push(jump_next);
                    jump_next = jump_next + direction;
                }
            }
            path.push(start);
            path.reverse();
            return Ok(path);
        }

        [
            Direction::Top,
            Direction::Right,
            Direction::Bottom,
            Direction::Left,
            Direction::TopRight,
            Direction::BottomRight,
            Direction::BottomLeft,
            Direction::TopLeft,
        ]
        .into_iter()
        .filter_map(|direction| {
            jump(&cost_fn, &dest_fn, node, direction).map(|(next, cost)| (next, cost, direction))
        })
        .map(|(next, jump_cost, next_direction)| {
            let previous_cost = cost - node.get_range_to(goal);
            let next_cost = previous_cost + jump_cost + next.get_range_to(goal);
            OpenSetItem {
                node: next,
                direction: next_direction,
                cost: next_cost,
            }
        })
        .for_each(|item| {
            if let Entry::Vacant(e) = previous.entry(item.node) {
                e.insert(node);
                open_set.push(item);
            }
        })
    }

    Err("Unable to reach goal")
}

pub fn find_path<F>(
    cost_fn: F,
    start: Position,
    goal: Position,
    options: Options,
) -> Result<Vec<Position>, &'static str>
where
    F: Fn(Position) -> Cost,
{
    let dest_fn = |pos: Position| pos == goal || pos.get_range_to(goal) <= options.range;
    a_star(cost_fn, dest_fn, start, goal, options)
}
