use std::collections::HashMap;
use std::collections::HashSet;
use std::collections::VecDeque;

use screeps::CONSTRUCTION_COST_ROAD_SWAMP_RATIO;
use screeps::CONSTRUCTION_COST_ROAD_WALL_RATIO;
use screeps::{
    Direction, LocalRoomTerrain, MOVE_COST_ROAD, Position, ROOM_AREA, ROOM_USIZE, RoomName, RoomXY,
    StructureType, Terrain, XMajor, linear_index_to_xy,
};

use crate::planner::mincut::mincut;
use crate::planner::{distance_transform::distance_transform, pathfinder, room_data::RoomData};

const COST_UNWALKABLE: u32 = ROOM_AREA as u32;
const COST_ROAD: u32 = MOVE_COST_ROAD;
// Empty tile cost a little bit more than move plain cost to incentive road re-use at the cost of
// slightly longer paths
const COST_EMPTY: u32 = 10;
const SPAWN_STAMP: [[Option<StructureType>; 5]; 5] = [
    [
        Some(StructureType::Observer),
        Some(StructureType::Road),
        Some(StructureType::Road),
        Some(StructureType::Road),
        None,
    ],
    [
        Some(StructureType::Road),
        Some(StructureType::Spawn),
        Some(StructureType::Spawn),
        Some(StructureType::Spawn),
        Some(StructureType::Road),
    ],
    [
        Some(StructureType::Road),
        Some(StructureType::Link),
        Some(StructureType::Road),
        Some(StructureType::PowerSpawn),
        Some(StructureType::Road),
    ],
    [
        Some(StructureType::Road),
        Some(StructureType::Storage),
        Some(StructureType::Terminal),
        Some(StructureType::Road),
        Some(StructureType::Factory),
    ],
    [
        None,
        Some(StructureType::Road),
        Some(StructureType::Road),
        Some(StructureType::Nuker),
        None,
    ],
];

const LAB_STAMP: [[Option<StructureType>; 4]; 4] = [
    [
        Some(StructureType::Lab),
        Some(StructureType::Lab),
        Some(StructureType::Lab),
        None,
    ],
    [
        Some(StructureType::Lab),
        Some(StructureType::Road),
        Some(StructureType::Lab),
        None,
    ],
    [
        Some(StructureType::Lab),
        Some(StructureType::Lab),
        Some(StructureType::Road),
        Some(StructureType::Lab),
    ],
    [
        None,
        None,
        Some(StructureType::Lab),
        Some(StructureType::Lab),
    ],
];

const DEFAULT_COST: u32 = ROOM_AREA as u32;
struct Costs {
    costs: HashMap<RoomName, XMajor<u32>>,
}
impl Costs {
    fn new(terrain: &HashMap<RoomName, LocalRoomTerrain>) -> Self {
        let costs: HashMap<RoomName, XMajor<u32>> = terrain
            .iter()
            .map(|(&name, terrain)| {
                let mut tile_costs = [[0; ROOM_USIZE]; ROOM_USIZE];
                tile_costs.iter_mut().enumerate().for_each(|(x, row)| {
                    row.iter_mut().enumerate().for_each(|(y, cost)| {
                        *cost = match terrain.get_xy(RoomXY::checked_new(x as u8, y as u8).unwrap())
                        {
                            Terrain::Plain => COST_EMPTY,
                            Terrain::Swamp => COST_EMPTY,
                            Terrain::Wall => COST_UNWALKABLE,
                        }
                    })
                });
                (name, XMajor(tile_costs))
            })
            .collect();

        Self { costs }
    }

    fn get(&self, position: Position) -> u32 {
        self.costs
            .get(&position.room_name())
            .map(|costs| costs[position.into()])
            .unwrap_or(DEFAULT_COST)
    }

    fn set(&mut self, position: Position, cost: u32) {
        let Some(room_costs) = self.costs.get_mut(&position.room_name()) else {
            return;
        };
        room_costs[position.into()] = cost;
    }
}

fn neighbors(pos: Position) -> impl Iterator<Item = Position> {
    screeps::Direction::iter()
        .filter_map(move |&direction| pos.checked_add_direction(direction).ok())
        .filter(move |neighbor| neighbor.room_name() == pos.room_name())
}

pub type RoomPlan = HashMap<StructureType, Vec<RoomXY>>;
pub fn plan_room(room: &RoomData) -> Result<RoomPlan, &'static str> {
    // Terrain walls used for spawn_spot placement and ramparts
    let terrain_walls: HashSet<RoomXY> = (0..ROOM_AREA)
        .map(linear_index_to_xy)
        .filter(|&xy| room.terrain.get(&room.room_name).unwrap().get_xy(xy) == Terrain::Wall)
        .collect();
    // Distance transform from terrain walls for spawn_spot placement
    let wall_distances = distance_transform(terrain_walls.iter().copied(), [].into_iter());
    // Exit tiles, will be used for mincut to place ramparts
    let exits: HashSet<RoomXY> = (0..ROOM_AREA)
        .map(linear_index_to_xy)
        .filter(|xy| xy.is_room_edge() && !terrain_walls.contains(xy))
        .flat_map(|xy| {
            Direction::iter().filter_map(move |&direction| xy.checked_add_direction(direction))
        })
        .filter(|neighbor| !terrain_walls.contains(neighbor))
        .collect();

    // Distance transform from the controller for the spawn spot
    let Some(controller) = room.controller else {
        return Err("Cannot plan room without controller");
    };
    let controller_distances = distance_transform(
        [controller.xy()].iter().copied(),
        terrain_walls.iter().copied(),
    );

    // Distance transforms from the sources for the spawn spot
    if room.sources.len() != 2 {
        return Err("Can only plan rooms with exactly two sources");
    }
    let mut sources = [room.sources[0], room.sources[1]];
    let source_distances = sources
        .map(|pos| distance_transform([pos.xy()].into_iter(), terrain_walls.iter().copied()));

    // Potential spawn spots
    let mut spawn_spots: Vec<RoomXY> = (0..ROOM_AREA)
        .map(linear_index_to_xy)
        .filter(|&xy| wall_distances[xy] >= 3)
        .collect();
    spawn_spots.sort_by_key(|&xy| {
        2 * controller_distances[xy] + source_distances[0][xy] + source_distances[1][xy]
    });

    let Some(plan) = spawn_spots
        .into_iter()
        .take(10)
        .filter_map(|spawn_spot| {
            plan_room_from_spawn_spot(
                Position::new(spawn_spot.x, spawn_spot.y, room.room_name),
                room,
                controller,
                &mut sources,
                &terrain_walls,
                &exits,
            )
            .ok()
        })
        .min_by_key(|plan| score_plan(plan, room.terrain.get(&room.room_name).unwrap()))
    else {
        return Err("Unable to plan room");
    };

    Ok(plan)
}

fn plan_room_from_spawn_spot(
    spawn_spot: Position,
    room: &RoomData,
    controller: Position,
    sources: &mut [Position; 2],
    terrain_walls: &HashSet<RoomXY>,
    exits: &HashSet<RoomXY>,
) -> Result<RoomPlan, &'static str> {
    // StructureType -> RoomXY[] map for the plan
    let mut structures = HashMap::new();
    // Tiles to be protected by the ramparts
    let mut inside = HashSet::new();
    // Tile costs for the pathfinder
    let mut costs = Costs::new(&room.terrain);

    let spawn_top_left = spawn_spot - (2, 2);
    SPAWN_STAMP.iter().enumerate().for_each(|(y, row)| {
        row.iter().enumerate().for_each(|(x, &structure)| {
            if let Some(structure) = structure {
                let xy = spawn_top_left + (x as i32, y as i32);
                inside.insert(xy.xy());
                structures
                    .entry(structure)
                    .and_modify(|xys: &mut Vec<Position>| xys.push(xy))
                    .or_insert(vec![xy]);
                costs.set(
                    xy,
                    if structure == StructureType::Road {
                        COST_ROAD
                    } else {
                        COST_UNWALKABLE
                    },
                );
            }
        })
    });
    costs.set(spawn_spot, COST_ROAD);
    let storage = spawn_spot + (-1, 1);

    // Find upgrade area
    let Some(upgrade_area) = (-2..=2)
        .flat_map(|dx| {
            (-2..=2).map(move |dy| controller + (dx, dy)).filter(|pos| {
                Direction::iter().all(|&direction| {
                    pos.checked_add_direction(direction)
                        .map(|neighbor| costs.get(neighbor) == COST_EMPTY)
                        .unwrap_or_default()
                })
            })
        })
        .min_by_key(|pos| pos.get_range_to(spawn_spot))
    else {
        return Err("Unable to find upgrade area");
    };
    // Add a ring of roads around the center of the upgrade area
    Direction::iter()
        .filter_map(|&d| upgrade_area.checked_add_direction(d).ok())
        .for_each(|pos| {
            inside.insert(pos.xy());
            costs.set(pos, COST_ROAD);
            structures
                .entry(StructureType::Road)
                .and_modify(|xys: &mut Vec<Position>| xys.push(pos));
        });

    // 2. Economy setup
    // Path from spawn to source, starting with the closer source
    sources.sort_by_key(|xy| xy.get_range_to(spawn_spot));
    for source in sources {
        let Ok(mut path) = pathfinder::find_path(
            |pos| costs.get(pos),
            spawn_spot,
            *source,
            pathfinder::Options {
                range: 1,
                ..Default::default()
            },
        ) else {
            return Err("Unable to path from spawn to source");
        };
        // Container replaces the end of the source-side of the path
        let Some(container) = path.pop() else {
            return Err("Path from spawn to source empty");
        };
        structures
            .entry(StructureType::Container)
            .and_modify(|xys: &mut Vec<Position>| xys.push(container))
            .or_insert(vec![container]);
        costs.set(container, COST_UNWALKABLE);
        // Add the road to the plan
        path.iter().for_each(|&xy| costs.set(xy, COST_ROAD));
        structures
            .entry(StructureType::Road)
            .and_modify(|xys: &mut Vec<Position>| xys.append(&mut path));
        // Source links on an unoccupied (including by roads) tile adjacent to the container
        let Some(link) = neighbors(container).find(|&xy| costs.get(xy) == COST_EMPTY) else {
            return Err("Unable to find unoccupied tile for source link");
        };
        costs.set(link, COST_UNWALKABLE);
        structures
            .entry(StructureType::Link)
            .and_modify(|xys: &mut Vec<Position>| xys.push(link));
    }
    // Path from the spawn to controller
    let Ok(mut controller_path) = pathfinder::find_path(
        |pos| costs.get(pos),
        spawn_spot,
        upgrade_area,
        Default::default(),
    ) else {
        return Err("Unable to path from spawn to controller");
    };
    // Add the spawn-controller road to the plan
    controller_path
        .iter()
        .for_each(|&xy| costs.set(xy, COST_ROAD));
    structures
        .entry(StructureType::Road)
        .and_modify(|xys: &mut Vec<Position>| xys.append(&mut controller_path));
    // Controller link is at the center of the upgrade area
    let controller_link = upgrade_area;
    costs.set(controller_link, COST_UNWALKABLE);
    structures
        .entry(StructureType::Link)
        .and_modify(|xys: &mut Vec<Position>| xys.push(controller_link));

    // 3. Sort the links so that the furthest are built first after the spawn link
    structures
        .entry(StructureType::Link)
        .and_modify(|links: &mut Vec<Position>| {
            let spawn_link = links.remove(0);
            links.sort_by_key(|xy| std::cmp::Reverse(xy.get_range_to(spawn_link)));
            links.insert(0, spawn_link);
        });

    // 4. If there is a mineral, and an extractor to it and build a road to it from the spawn
    if let Some(mineral) = room.mineral {
        structures.insert(StructureType::Extractor, vec![mineral]);
        let Ok(mut path) = pathfinder::find_path(
            |pos| costs.get(pos),
            spawn_spot,
            mineral,
            pathfinder::Options {
                range: 1,
                ..Default::default()
            },
        ) else {
            return Err("Unable to path from spawn to mineral");
        };
        // Add the road to the plan
        path.iter().for_each(|&xy| costs.set(xy, COST_ROAD));
        structures
            .entry(StructureType::Road)
            .and_modify(|xys: &mut Vec<Position>| xys.append(&mut path));
    }

    // 5. Lab stamp
    let occupied = costs
        .costs
        .get(&room.room_name)
        .unwrap()
        .0
        .iter()
        .flatten()
        .enumerate()
        .filter(|(_, cost)| **cost != COST_EMPTY)
        .map(|(index, _)| linear_index_to_xy(index));
    let distances = distance_transform(occupied, [].into_iter());
    let mut queue: VecDeque<Position> = Direction::iter()
        .filter_map(|&d| storage.checked_add_direction(d).ok())
        .collect();
    let mut visited = XMajor([[false; ROOM_USIZE]; ROOM_USIZE]);
    let mut lab_center = None;
    while let Some(current) = queue.pop_front() {
        if distances[current.into()] as usize >= LAB_STAMP.len() / 2 {
            lab_center = Some(current);
            break;
        }

        neighbors(current).for_each(|n| {
            if !visited[n.into()] {
                visited[n.into()] = true;
                queue.push_back(n)
            }
        });
    }
    let Some(lab_center) = lab_center else {
        return Err("Unable to place lab stamp");
    };
    let lab_top_left = lab_center - (1, 1);
    LAB_STAMP.iter().enumerate().for_each(|(y, row)| {
        row.iter().enumerate().for_each(|(x, &structure)| {
            if let Some(structure) = structure {
                let xy = lab_top_left + (x as i32, y as i32);
                inside.insert(xy.xy());
                structures
                    .entry(structure)
                    .and_modify(|xys: &mut Vec<Position>| xys.push(xy))
                    .or_insert(vec![xy]);
                costs.set(
                    xy,
                    if structure == StructureType::Road {
                        COST_ROAD
                    } else {
                        COST_UNWALKABLE
                    },
                );
            }
        })
    });

    // 6. Plan extensions
    let extension_hub = storage;
    let mut queue: VecDeque<Position> = Direction::iter()
        .filter_map(|&d| extension_hub.checked_add_direction(d).ok())
        .collect();
    let mut visited = XMajor([[false; ROOM_USIZE]; ROOM_USIZE]);
    let mut extensions = Vec::new();

    while let Some(current) = queue.pop_front() {
        // Stop at 60 extensions
        if extensions.len() == 60 {
            break;
        }

        // Skip if current is no longer valid to search along
        if current != extension_hub && costs.get(current) == COST_UNWALKABLE {
            continue;
        }

        // If unoccupied, maybe do extensions here
        if costs.get(current) != COST_UNWALKABLE && extension_hub.get_range_to(current) > 1 {
            let Ok(mut path) = pathfinder::find_path(
                |pos| costs.get(pos),
                extension_hub,
                current,
                pathfinder::Options::default(),
            ) else {
                return Err("Unable to path from spawn to extension candidate");
            };
            // The entry road to this extension area is the second-to-last tile in the path, and
            // the last is the filler spot
            let entry_road = path[path.len() - 2];
            let filler_spot = path[path.len() - 1];
            let exit_road = filler_spot + entry_road.get_direction_to(filler_spot).unwrap();
            let mut unoccupied_neighbors: Vec<Position> = neighbors(current)
                .filter(|&xy| {
                    costs.get(xy) == COST_EMPTY
                        // Can't place a tile on the entry road, and don't block off the exit
                        && xy != entry_road
                        && xy != exit_road
                        // Don't place extensions within two tiles of the controller
                        && !xy.in_range_to(controller, 2)
                        // Don't place extensions within two tiles of the room edge
                        && xy.x().u8() != 0 && xy.x().u8() != 1 && xy.x().u8() != 48 && xy.x().u8() != 49
                        && xy.y().u8() != 0 && xy.y().u8() != 1 && xy.y().u8() != 48 && xy.y().u8() != 49
                })
                .collect();
            // Place extensions if there are at least six spots or enough to finish
            if unoccupied_neighbors.len() >= std::cmp::min(6, 60 - extensions.len()) {
                while extensions.len() + unoccupied_neighbors.len() > 60 {
                    unoccupied_neighbors.pop();
                }
                unoccupied_neighbors.iter().for_each(|&xy| {
                    inside.insert(xy.xy());
                    costs.set(xy, COST_UNWALKABLE);
                });
                extensions.append(&mut unoccupied_neighbors);
                // Remove the extension hub (storage) from the path to prevent placing a road there
                path.remove(0);
                // Add the road to the plan
                path.iter().for_each(|&xy| {
                    inside.insert(xy.xy());
                    costs.set(xy, COST_ROAD)
                });
                structures
                    .entry(StructureType::Road)
                    .and_modify(|xys: &mut Vec<Position>| xys.append(&mut path));
            }
        }

        // Traverse along its unoccupied neighbors
        neighbors(current)
            .filter(|&xy| costs.get(xy) != COST_UNWALKABLE)
            .for_each(|xy| {
                if !visited[xy.into()] {
                    visited[xy.into()] = true;
                    queue.push_back(xy);
                }
            });
    }

    if extensions.len() != 60 {
        return Err("Unable to plan 60 extensions");
    }
    structures.insert(StructureType::Extension, extensions);

    // Mincut ramparts
    let Ok(ramparts) = mincut(&inside, terrain_walls, exits) else {
        return Err("Unable to run mincut");
    };
    let ramparts = ramparts
        .into_iter()
        .map(|xy| Position::new(xy.x, xy.y, room.room_name))
        .collect();
    structures.insert(StructureType::Rampart, ramparts);

    Ok(structures
        .into_iter()
        .map(|(s, xys)| (s, xys.into_iter().map(|xy| xy.xy()).collect()))
        .collect())
}

fn score_plan(plan: &RoomPlan, terrain: &LocalRoomTerrain) -> u32 {
    plan.iter()
        .map(|(structure_type, xys)| match structure_type {
            StructureType::Road => xys
                .iter()
                .map(|&xy| {
                    structure_type.construction_cost().unwrap()
                        * match terrain.get_xy(xy) {
                            Terrain::Plain => 1,
                            Terrain::Swamp => CONSTRUCTION_COST_ROAD_SWAMP_RATIO,
                            Terrain::Wall => CONSTRUCTION_COST_ROAD_WALL_RATIO,
                        }
                })
                .sum(),
            _ => structure_type.construction_cost().unwrap_or(0) * xys.len() as u32,
        })
        .sum()
}
