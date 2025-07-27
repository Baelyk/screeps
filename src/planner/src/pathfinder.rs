use std::collections::BinaryHeap;

use screeps::{RoomXY, XMajor, ROOM_USIZE};

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

#[derive(Copy, Clone)]
pub enum TileCost {
    Plain,
    Road,
    Swamp,
    Unwalkable,
}

impl TileCost {
    fn cost(&self) -> Cost {
        match self {
            TileCost::Plain => 2,
            TileCost::Road => 1,
            TileCost::Swamp => 10,
            TileCost::Unwalkable => 255,
        }
    }
}

type Cost = u32;

#[derive(Copy, Clone, Debug)]
struct OpenSetItem {
    node: RoomXY,
    cost: Cost,
    heuristic: Cost,
}

impl std::cmp::PartialEq for OpenSetItem {
    fn eq(&self, other: &Self) -> bool {
        self.cost + self.heuristic == other.cost + other.heuristic
    }
}

impl Eq for OpenSetItem {}

impl std::cmp::Ord for OpenSetItem {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        let self_cost = self.cost + self.heuristic;
        let other_cost = other.cost + other.heuristic;

        // Want to sort lower costs as greater for the BinaryHeap
        if self_cost == other_cost {
            std::cmp::Ordering::Equal
        } else if self_cost < other_cost {
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

pub fn a_star(
    costs: &XMajor<Cost>,
    start: RoomXY,
    goal: RoomXY,
    options: Options,
) -> Result<Vec<RoomXY>, &'static str> {
    let mut open_set = BinaryHeap::new();
    let mut previous = XMajor([[None; ROOM_USIZE]; ROOM_USIZE]);
    open_set.push(OpenSetItem {
        node: start,
        cost: 0,
        heuristic: start.get_range_to(goal) as u32,
    });

    let mut iters = 0;
    while let Some(OpenSetItem {
        node,
        cost,
        heuristic: _,
    }) = open_set.pop()
    {
        iters += 1;
        if iters > options.max_iters {
            break;
        }
        if node == goal || node.get_range_to(goal) as u32 <= options.range {
            let mut path = Vec::with_capacity(cost as usize);
            let mut current = node;
            loop {
                path.push(current);
                if current == start {
                    break;
                }
                current = previous[current].unwrap();
            }
            path.reverse();
            return Ok(path);
        }

        node.neighbors()
            .into_iter()
            .map(|neighbor| OpenSetItem {
                node: neighbor,
                cost: cost + costs[neighbor],
                heuristic: neighbor.get_range_to(goal) as u32,
            })
            .for_each(|item| {
                if previous[item.node].is_none() {
                    previous[item.node] = Some(node);
                    open_set.push(item);
                }
            })
    }

    Err("Unable to reach goal")
}

pub fn find_path(
    costs: &XMajor<Cost>,
    start: RoomXY,
    goal: RoomXY,
    options: Options,
) -> Result<Vec<RoomXY>, &'static str> {
    a_star(costs, start, goal, options)
}
