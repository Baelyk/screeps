use std::collections::{BinaryHeap, HashMap};

use screeps::{Direction, Position, ROOM_AREA};

#[derive(Copy, Clone, Debug)]
pub struct Options {
    pub range: u32,
    pub max_iters: u32,
    pub multiroom: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            range: 0,
            max_iters: u32::MAX,
            multiroom: false,
        }
    }
}

type Cost = u32;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
struct OpenSetItem {
    node: Position,
    score: Cost,
}

impl std::cmp::Ord for OpenSetItem {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Want to sort lower costs as greater for the BinaryHeap
        self.score.cmp(&other.score).reverse()
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
        // If the next tile has a different cost, stop jumping and add the next tile to the open set
        if next_cost != cost {
            return Some((next, cost.saturating_mul(jumps).saturating_add(next_cost)));
        }
        jumps += 1;
        // If the next tile is the goal, stop jumping and add the the next tile to the open set
        if dest_fn(next) {
            return Some((next, cost.saturating_mul(jumps)));
        }
        // If the tiles above or below the next have a different cost, stop jumping and add the
        // next tile to the open set. Rotating the direction twice clockwise and counterclockwise
        // provide the correct analogies for above and below for any direction.
        if let Ok(next_below) = next.checked_add_direction(direction.multi_rot(2))
            && cost_fn(next_below) != cost
        {
            return Some((next, cost.saturating_mul(jumps)));
        }
        if let Ok(next_above) = next.checked_add_direction(direction.multi_rot(-2))
            && cost_fn(next_above) != cost
        {
            return Some((next, cost.saturating_mul(jumps)));
        }

        // If the direction is diagonal, check jumping in the horizontal and vertical components
        // and add the next tile to the open set if they run in to anything.
        if direction.is_diagonal() {
            let horizontal = jump(cost_fn, dest_fn, next, direction.multi_rot(1));
            if horizontal.is_some() {
                return Some((next, cost.saturating_mul(jumps)));
            }
            let vertical = jump(cost_fn, dest_fn, next, direction.multi_rot(-1));
            if vertical.is_some() {
                return Some((next, cost.saturating_mul(jumps)));
            }
        }

        // Keep jumping
        current = next;
    }
}

type PreviousMap = HashMap<Position, (Position, Cost)>;
pub fn jump_point_search<F1, F2, F3>(
    cost_fn: F1,
    heur_fn: F2,
    dest_fn: F3,
    starts: impl IntoIterator<Item = Position>,
    options: Options,
) -> Result<(Cost, Position, PreviousMap), &'static str>
where
    F1: Fn(Position) -> Cost,
    F2: Fn(Position) -> Cost,
    F3: Fn(Position) -> bool,
{
    let mut open_set = BinaryHeap::new();
    let mut previous: PreviousMap = HashMap::new();
    starts.into_iter().for_each(|start| {
        previous.insert(start, (start, 0));
        open_set.push(OpenSetItem {
            node: start,
            score: heur_fn(start),
        })
    });

    let mut iters = 0;
    while let Some(OpenSetItem { node, score }) = open_set.pop() {
        iters += 1;
        if iters > options.max_iters {
            return Err("Too many iters");
        }

        if dest_fn(node) {
            let cost = score - heur_fn(node);
            return Ok((cost, node, previous));
        }

        Direction::iter()
            .filter_map(|&direction| jump(&cost_fn, &dest_fn, node, direction))
            .for_each(|(next, jump_cost)| {
                // Cost of the path to the current node
                let cost = score - heur_fn(node);
                // Cost of the path to this next node
                let next_cost = cost.saturating_add(jump_cost);
                // Previously found cost of the path to this next node
                let previous_cost = previous.get(&next).map(|prev| prev.1).unwrap_or(u32::MAX);
                // Add this next node to the open set if the path cost from the current node is
                // lower than the previous path cost
                if next_cost < previous_cost {
                    previous.insert(next, (node, next_cost));
                    open_set.push(OpenSetItem {
                        node: next,
                        score: next_cost.saturating_add(heur_fn(next)),
                    });
                }
            })
    }

    Err("Unable to reach goal")
}

fn reconstruct_path(end: Position, previous: PreviousMap) -> Vec<Position> {
    let mut path = Vec::new();
    let mut current = end;
    while let Some(&(next, cost)) = previous.get(&current)
        && cost > 0
    {
        let direction = current.get_direction_to(next).unwrap();
        let mut jump_next = current;
        while jump_next != next {
            path.push(jump_next);
            jump_next = jump_next + direction;
        }

        current = next;
    }
    path.reverse();
    path
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
    let new_cost_fn = |pos: Position| {
        if options.multiroom || pos.room_name() == start.room_name() {
            cost_fn(pos)
        } else {
            Cost::MAX
        }
    };
    let dest_fn = |pos: Position| pos == goal || pos.get_range_to(goal) <= options.range;
    let heur_fn = |pos: Position| pos.get_range_to(goal);
    let (_, end, previous) = jump_point_search(new_cost_fn, heur_fn, dest_fn, [start], options)?;
    let path = reconstruct_path(end, previous);
    Ok(path)
}
