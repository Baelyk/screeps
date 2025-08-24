use std::collections::HashMap;
use std::collections::VecDeque;

use screeps::{
    Direction, LocalRoomTerrain, MOVE_COST_ROAD, Position, ROOM_AREA, ROOM_USIZE, RoomCoordinate,
    RoomName, RoomXY, StructureType, Terrain, XMajor, linear_index_to_xy,
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
        None,
        Some(StructureType::Road),
        Some(StructureType::Tower),
        Some(StructureType::Road),
        None,
    ],
    [
        Some(StructureType::Road),
        Some(StructureType::Spawn),
        Some(StructureType::Road),
        Some(StructureType::Spawn),
        Some(StructureType::Road),
    ],
    [
        Some(StructureType::Link),
        Some(StructureType::Road),
        None,
        Some(StructureType::Road),
        None,
    ],
    [
        Some(StructureType::Road),
        Some(StructureType::Storage),
        Some(StructureType::Road),
        Some(StructureType::Spawn),
        Some(StructureType::Road),
    ],
    [
        None,
        Some(StructureType::Road),
        None,
        Some(StructureType::Road),
        None,
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
    let mut structures = HashMap::new();

    // 0. Prepare cost function for the pathfinder
    let mut costs = Costs::new(&room.terrain);
    let terrain_walls: Vec<RoomXY> = (0..ROOM_AREA)
        .map(linear_index_to_xy)
        .filter(|&xy| room.terrain.get(&room.room_name).unwrap().get_xy(xy) == Terrain::Wall)
        .collect();
    let wall_distances = distance_transform(&terrain_walls, &[]);

    // 1. Place spawn stamp
    let Some(controller) = room.controller else {
        return Err("Cannot plan room without controller");
    };
    if room.sources.len() != 2 {
        return Err("Can only plan rooms with exactly two sources");
    }

    let controller_distances = distance_transform(&[controller.xy()], &terrain_walls);
    let mut sources = [room.sources[0], room.sources[1]];
    let source_distances = sources.map(|pos| distance_transform(&[pos.xy()], &terrain_walls));

    let spawn_spot = (0..ROOM_AREA)
        .map(linear_index_to_xy)
        .filter(|&xy| wall_distances[xy] >= 3)
        .min_by_key(|&xy| {
            2 * controller_distances[xy] + source_distances[0][xy] + source_distances[1][xy]
        });

    let Some(spawn_spot) = spawn_spot.map(|xy| Position::new(xy.x, xy.y, room.room_name)) else {
        return Err("Unable to find spawn spot with enough space");
    };

    let spawn_top_left = spawn_spot - (2, 2);
    SPAWN_STAMP.iter().enumerate().for_each(|(y, row)| {
        row.iter().enumerate().for_each(|(x, &structure)| {
            if let Some(structure) = structure {
                let xy = spawn_top_left + (x as i32, y as i32);
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

    let sources: Vec<RoomXY> = structures.values().flatten().map(|pos| pos.xy()).collect();
    let obstacles = terrain_walls;
    let sinks: Vec<RoomXY> = (0..ROOM_AREA)
        .map(linear_index_to_xy)
        .filter(|xy| xy.is_room_edge())
        .collect();
    println!("mincut starting");
    let ramparts = mincut(&sources, &obstacles, &sinks);
    println!("mincut done");
    let ramparts = ramparts
        .into_iter()
        .map(|xy| Position::new(xy.x, xy.y, room.room_name))
        .collect();
    structures.insert(StructureType::Rampart, ramparts);
    let sinks = sinks
        .into_iter()
        .map(|xy| Position::new(xy.x, xy.y, room.room_name))
        .collect();
    structures.insert(StructureType::Road, sinks);
    let sources = sources
        .into_iter()
        .map(|xy| Position::new(xy.x, xy.y, room.room_name))
        .collect();
    structures.insert(StructureType::Wall, sources);

    //// Find upgrade area
    //let Some(upgrade_area) = (-2..=2)
    //    .flat_map(|dx| {
    //        (-2..=2).map(move |dy| controller + (dx, dy)).filter(|pos| {
    //            Direction::iter().all(|&direction| {
    //                pos.checked_add_direction(direction)
    //                    .map(|neighbor| costs.get(neighbor) == COST_EMPTY)
    //                    .unwrap_or_default()
    //            })
    //        })
    //    })
    //    .min_by_key(|pos| pos.get_range_to(spawn_spot))
    //else {
    //    return Err("Unable to find upgrade area");
    //};
    //// Add a ring of roads around the center of the upgrade area
    //Direction::iter()
    //    .filter_map(|&d| upgrade_area.checked_add_direction(d).ok())
    //    .for_each(|pos| {
    //        costs.set(pos, COST_ROAD);
    //        structures
    //            .entry(StructureType::Road)
    //            .and_modify(|xys: &mut Vec<Position>| xys.push(pos));
    //    });
    //
    //// 2. Economy setup
    //// Path from spawn to source, starting with the closer source
    //sources.sort_by_key(|xy| xy.get_range_to(spawn_spot));
    //for source in sources {
    //    let Ok(mut path) = pathfinder::find_path(
    //        |pos| costs.get(pos),
    //        spawn_spot,
    //        source,
    //        pathfinder::Options {
    //            range: 1,
    //            ..Default::default()
    //        },
    //    ) else {
    //        return Err("Unable to path from spawn to source");
    //    };
    //    // Container replaces the end of the source-side of the path
    //    let Some(container) = path.pop() else {
    //        return Err("Path from spawn to source empty");
    //    };
    //    structures
    //        .entry(StructureType::Container)
    //        .and_modify(|xys: &mut Vec<Position>| xys.push(container))
    //        .or_insert(vec![container]);
    //    costs.set(container, COST_UNWALKABLE);
    //    // Add the road to the plan
    //    path.iter().for_each(|&xy| costs.set(xy, COST_ROAD));
    //    structures
    //        .entry(StructureType::Road)
    //        .and_modify(|xys: &mut Vec<Position>| xys.append(&mut path));
    //    // Source links on an unoccupied (including by roads) tile adjacent to the container
    //    let Some(link) = neighbors(container).find(|&xy| costs.get(xy) == COST_EMPTY) else {
    //        return Err("Unable to find unoccupied tile for source link");
    //    };
    //    costs.set(link, COST_UNWALKABLE);
    //    structures
    //        .entry(StructureType::Link)
    //        .and_modify(|xys: &mut Vec<Position>| xys.push(link));
    //}
    //// Path from the spawn to controller
    //let Ok(mut controller_path) = pathfinder::find_path(
    //    |pos| costs.get(pos),
    //    spawn_spot,
    //    upgrade_area,
    //    Default::default(),
    //) else {
    //    return Err("Unable to path from spawn to controller");
    //};
    //// Add the spawn-controller road to the plan
    //controller_path
    //    .iter()
    //    .for_each(|&xy| costs.set(xy, COST_ROAD));
    //structures
    //    .entry(StructureType::Road)
    //    .and_modify(|xys: &mut Vec<Position>| xys.append(&mut controller_path));
    //// Controller link is at the center of the upgrade area
    //let controller_link = upgrade_area;
    //costs.set(controller_link, COST_UNWALKABLE);
    //structures
    //    .entry(StructureType::Link)
    //    .and_modify(|xys: &mut Vec<Position>| xys.push(controller_link));
    //
    //// 3. Sort the links so that the furthest are built first after the spawn link
    //structures
    //    .entry(StructureType::Link)
    //    .and_modify(|links: &mut Vec<Position>| {
    //        let spawn_link = links.remove(0);
    //        links.sort_by_key(|xy| std::cmp::Reverse(xy.get_range_to(spawn_link)));
    //        links.insert(0, spawn_link);
    //    });
    //
    //// 4. If there is a mineral, and an extractor to it and build a road to it from the spawn
    //if let Some(mineral) = room.mineral {
    //    structures.insert(StructureType::Extractor, vec![mineral]);
    //    let Ok(mut path) = pathfinder::find_path(
    //        |pos| costs.get(pos),
    //        spawn_spot,
    //        mineral,
    //        pathfinder::Options {
    //            range: 1,
    //            ..Default::default()
    //        },
    //    ) else {
    //        return Err("Unable to path from spawn to mineral");
    //    };
    //    // Add the road to the plan
    //    path.iter().for_each(|&xy| costs.set(xy, COST_ROAD));
    //    structures
    //        .entry(StructureType::Road)
    //        .and_modify(|xys: &mut Vec<Position>| xys.append(&mut path));
    //}
    //
    //// 5. Path to exits
    ////room.exits.iter().for_each(|&exit_name| {
    ////    let middle = Position::new(
    ////        RoomCoordinate::new(24).unwrap(),
    ////        RoomCoordinate::new(24).unwrap(),
    ////        exit_name,
    ////    );
    ////    if let Ok(path) = pathfinder::find_path(
    ////        |pos| costs.get(pos),
    ////        spawn_spot,
    ////        middle,
    ////        pathfinder::Options {
    ////            range: 22,
    ////            multiroom: true,
    ////            //debug: exit_name.to_string().as_str() == "W5S1",
    ////            ..Default::default()
    ////        },
    ////    ) {
    ////        // Remove the part of the path in the other room
    ////        let mut path: Vec<Position> = path
    ////            .into_iter()
    ////            .filter(|pos| pos.room_name() == room.room_name)
    ////            .collect();
    ////        // Remove the two unbuildable parts of the road on the room edge
    ////        path.pop();
    ////        path.pop();
    ////        // Add the road to the plan
    ////        path.iter().for_each(|&xy| costs.set(xy, COST_ROAD));
    ////        structures
    ////            .entry(StructureType::Road)
    ////            .and_modify(|xys: &mut Vec<Position>| xys.append(&mut path));
    ////    } else {
    ////        eprintln!("[WARN] unable to path to {exit_name}");
    ////    }
    ////});
    //
    //// 6. Plan extensions
    //let extension_hub = spawn_spot + (-1, 1);
    //let mut queue: VecDeque<Position> = Direction::iter()
    //    .filter_map(|&d| extension_hub.checked_add_direction(d).ok())
    //    .collect();
    //let mut visited = XMajor([[false; ROOM_USIZE]; ROOM_USIZE]);
    //let mut extensions = Vec::new();
    //
    //while let Some(current) = queue.pop_front() {
    //    // Stop at 60 extensions
    //    if extensions.len() == 60 {
    //        break;
    //    }
    //
    //    // Skip if current is no longer valid to search along
    //    if current != extension_hub && costs.get(current) == COST_UNWALKABLE {
    //        continue;
    //    }
    //
    //    // If unoccupied, maybe do extensions here
    //    if costs.get(current) != COST_UNWALKABLE {
    //        let Ok(mut path) = pathfinder::find_path(
    //            |pos| costs.get(pos),
    //            extension_hub,
    //            current,
    //            pathfinder::Options::default(),
    //        ) else {
    //            return Err("Unable to path from spawn to extension candidate");
    //        };
    //        // The entry road to this extension area is the second-to-last tile in the path, and
    //        // the last is the filler spot
    //        let entry_road = path[path.len() - 2];
    //        let filler_spot = path[path.len() - 1];
    //        let exit_road = filler_spot + entry_road.get_direction_to(filler_spot).unwrap();
    //        let mut unoccupied_neighbors: Vec<Position> = neighbors(current)
    //            .filter(|&xy| {
    //                costs.get(xy) == COST_EMPTY
    //                    // Can't place a tile on the entry road, and don't block off the exit
    //                    && xy != entry_road
    //                    && xy != exit_road
    //                    // Don't place extensions within two tiles of the controller
    //                    && !xy.in_range_to(controller, 2)
    //                    // Don't place extensions within two tiles of the room edge
    //                    && xy.x().u8() != 0 && xy.x().u8() != 1 && xy.x().u8() != 48 && xy.x().u8() != 49
    //                    && xy.y().u8() != 0 && xy.y().u8() != 1 && xy.y().u8() != 48 && xy.y().u8() != 49
    //            })
    //            .collect();
    //        // Place extensions if there are at least six spots or enough to finish
    //        if unoccupied_neighbors.len() >= std::cmp::min(6, 60 - extensions.len()) {
    //            println!(
    //                "{} {} {} {}",
    //                current,
    //                unoccupied_neighbors.len(),
    //                extensions.len(),
    //                std::cmp::min(6, 60 - extensions.len())
    //            );
    //            while extensions.len() + unoccupied_neighbors.len() > 60 {
    //                unoccupied_neighbors.pop();
    //            }
    //            unoccupied_neighbors
    //                .iter()
    //                .for_each(|&xy| costs.set(xy, COST_UNWALKABLE));
    //            extensions.append(&mut unoccupied_neighbors);
    //            // Add the road to the plan
    //            path.iter().for_each(|&xy| costs.set(xy, COST_ROAD));
    //            structures
    //                .entry(StructureType::Road)
    //                .and_modify(|xys: &mut Vec<Position>| xys.append(&mut path));
    //        }
    //    }
    //
    //    // Traverse along its unoccupied neighbors
    //    neighbors(current)
    //        .filter(|&xy| costs.get(xy) != COST_UNWALKABLE)
    //        .for_each(|xy| {
    //            if !visited[xy.into()] {
    //                visited[xy.into()] = true;
    //                queue.push_back(xy);
    //            }
    //        });
    //}
    //
    //if extensions.len() != 60 {
    //    return Err("Unable to plan 60 extensions");
    //}
    //structures.insert(StructureType::Extension, extensions);

    Ok(structures
        .into_iter()
        .map(|(s, xys)| (s, xys.into_iter().map(|xy| xy.xy()).collect()))
        .collect())
}
