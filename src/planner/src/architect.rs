use std::collections::{HashMap, HashSet, VecDeque};

use screeps::{
    LocalRoomTerrain, RoomCoordinate, RoomXY, StructureType, Terrain, XMajor, MOVE_COST_PLAIN,
    MOVE_COST_ROAD, ROOM_AREA, ROOM_USIZE,
};

use crate::{pathfinder, room_data::RoomData};

const COST_UNWALKABLE: u32 = ROOM_AREA as u32;
const COST_ROAD: u32 = MOVE_COST_ROAD;
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

pub fn plan_room(room: &RoomData) -> Result<HashMap<StructureType, Vec<RoomXY>>, &'static str> {
    let mut structures = HashMap::new();
    let mut tile_costs = [[0; ROOM_USIZE]; ROOM_USIZE];
    tile_costs.iter_mut().enumerate().for_each(|(x, row)| {
        row.iter_mut().enumerate().for_each(|(y, cost)| {
            *cost = match room
                .terrain
                .get_xy(RoomXY::checked_new(x as u8, y as u8).unwrap())
            {
                Terrain::Plain => MOVE_COST_PLAIN,
                Terrain::Swamp => MOVE_COST_PLAIN,
                Terrain::Wall => ROOM_AREA as u32,
            }
        })
    });
    let mut tile_costs = XMajor(tile_costs);

    // 1. Place spawn stamp
    let Some(controller) = room.controller else {
        return Err("Cannot plan room without controller");
    };

    if room.sources.len() != 2 {
        return Err("Can only plan rooms with exactly two sources");
    }
    let path_options = pathfinder::Options {
        range: 1,
        ..Default::default()
    };
    let mut sources = [room.sources[0], room.sources[1]];
    let source_roads =
        sources.map(|xy| pathfinder::find_path(&tile_costs, xy, controller, path_options));
    let source_roads = match source_roads {
        [Ok(road1), Ok(road2)] => [road1, road2],
        _ => return Err("Unable to path to the controller from one or more of the sources"),
    };

    let source_iters = source_roads.clone().map(|road| road.into_iter().rev());
    let search_start = if let Some((first_intersection, _)) = source_iters[0]
        .clone()
        .zip(source_iters[1].clone())
        .take_while(|(a, b)| a == b)
        .last()
    {
        first_intersection
    } else {
        controller
    };

    // BFS from first_intersection for spot with three free tiles in all directions
    let mut visited = XMajor([[false; ROOM_USIZE]; ROOM_USIZE]);
    let mut queue = VecDeque::new();
    let mut spawn_spot = None;
    queue.push_back(search_start);
    visited[search_start] = true;
    while let Some(current) = queue.pop_front() {
        let is_free = (-3..=3)
            .flat_map(|x| (-3..=3).filter_map(move |y| current.checked_add((x, y))))
            .all(|tile| tile_costs[tile] == MOVE_COST_PLAIN);
        if is_free {
            spawn_spot = Some(current);
            break;
        }
        current.neighbors().into_iter().for_each(|n| {
            if !visited[n] {
                visited[n] = true;
                queue.push_back(n);
            }
        });
    }
    let Some(spawn_spot) = spawn_spot else {
        return Err("Unable to find spawn spot with enough space");
    };

    let spawn_top_left = spawn_spot - (2, 2);
    SPAWN_STAMP.iter().enumerate().for_each(|(y, row)| {
        row.iter().enumerate().for_each(|(x, &structure)| {
            if let Some(structure) = structure {
                let xy = spawn_top_left + (x as i8, y as i8);
                structures
                    .entry(structure)
                    .and_modify(|xys: &mut Vec<RoomXY>| xys.push(xy))
                    .or_insert(vec![xy]);
                tile_costs[xy] = if structure == StructureType::Road {
                    COST_ROAD
                } else {
                    COST_UNWALKABLE
                };
            }
        })
    });
    tile_costs[spawn_spot] = COST_UNWALKABLE;

    // 2. Economy setup
    // Path from spawn to source, starting with the closer source
    sources.sort_by_key(|xy| xy.get_range_to(spawn_spot));
    for source in sources {
        let Ok(mut path) = pathfinder::find_path(
            &tile_costs,
            spawn_spot,
            source,
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
            .and_modify(|xys: &mut Vec<RoomXY>| xys.push(container))
            .or_insert(vec![container]);
        tile_costs[container] = COST_UNWALKABLE;
        // Add the road to the plan
        path.iter().for_each(|&xy| tile_costs[xy] = COST_ROAD);
        structures
            .entry(StructureType::Road)
            .and_modify(|xys: &mut Vec<RoomXY>| xys.append(&mut path));
        // Source links on an unoccupied (including by roads) tile adjacent to the container
        let Some(link) = container
            .neighbors()
            .into_iter()
            .find(|&xy| tile_costs[xy] == MOVE_COST_PLAIN)
        else {
            return Err("Unable to find unoccupied tile for source link");
        };
        tile_costs[link] = COST_UNWALKABLE;
        structures
            .entry(StructureType::Link)
            .and_modify(|xys: &mut Vec<RoomXY>| xys.push(link));
    }
    // Path from the spawn to controller
    let Ok(mut controller_path) = pathfinder::find_path(
        &tile_costs,
        spawn_spot,
        controller,
        pathfinder::Options {
            range: 1,
            ..Default::default()
        },
    ) else {
        return Err("Unable to path from spawn to controller");
    };
    // Controller link is at the controller end of the spawn-controller road
    let Some(controller_path_end) = controller_path.last() else {
        return Err("Path from spawn to controller empty");
    };
    let Some(controller_link) = controller_path_end
        .neighbors()
        .into_iter()
        .find(|&neighbor| tile_costs[neighbor] == MOVE_COST_PLAIN)
    else {
        return Err("No unoccupied spot for controller link");
    };
    tile_costs[controller_link] = COST_UNWALKABLE;
    structures
        .entry(StructureType::Link)
        .and_modify(|xys: &mut Vec<RoomXY>| xys.push(controller_link));
    // Add the spawn-controller road to the plan
    controller_path
        .iter()
        .for_each(|&xy| tile_costs[xy] = COST_ROAD);
    structures
        .entry(StructureType::Road)
        .and_modify(|xys: &mut Vec<RoomXY>| xys.append(&mut controller_path));

    // 3. Sort the links so that the furthest are built first after the spawn link
    structures
        .entry(StructureType::Link)
        .and_modify(|links: &mut Vec<RoomXY>| {
            let spawn_link = links.remove(0);
            links.sort_by_key(|xy| std::cmp::Reverse(xy.get_range_to(spawn_link)));
            links.insert(0, spawn_link);
        });

    // 4. If there is a mineral, and an extractor to it and build a road to it from the spawn
    if let Some(mineral) = room.mineral {
        structures.insert(StructureType::Extractor, vec![mineral]);
        let Ok(mut path) = pathfinder::find_path(
            &tile_costs,
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
        path.iter().for_each(|&xy| tile_costs[xy] = COST_ROAD);
        structures
            .entry(StructureType::Road)
            .and_modify(|xys: &mut Vec<RoomXY>| xys.append(&mut path));
    }

    // 5. TODO Path to exits

    // 6. Plan extensions
    let mut queue = VecDeque::from([spawn_spot]);
    let mut visited = XMajor([[false; ROOM_USIZE]; ROOM_USIZE]);
    let mut extensions = Vec::new();

    while let Some(current) = queue.pop_front() {
        // Stop at 60 extensions
        if extensions.len() == 60 {
            break;
        }

        // Skip if current is no longer valid to search along
        if current != spawn_spot && tile_costs[current] == COST_UNWALKABLE {
            continue;
        }

        // If unoccupied, maybe do extensions here
        if tile_costs[current] != COST_UNWALKABLE {
            let Ok(mut path) = pathfinder::find_path(
                &tile_costs,
                spawn_spot,
                current,
                pathfinder::Options::default(),
            ) else {
                return Err("Unable to path from spawn to extension candidate");
            };
            let mut unoccupied_neighbors: Vec<RoomXY> = current
                .neighbors()
                .into_iter()
                .filter(|&xy| {
                    tile_costs[xy] == MOVE_COST_PLAIN
                        && !path.contains(&xy)
                        // Don't place extensions within two tiles of the controller
                        && !xy.in_range_to(controller, 2)
                })
                .collect();
            // Place extensions if there are at least six spots
            if unoccupied_neighbors.len() >= 6 {
                while extensions.len() + unoccupied_neighbors.len() > 60 {
                    unoccupied_neighbors.pop();
                }
                unoccupied_neighbors
                    .iter()
                    .for_each(|&xy| tile_costs[xy] = COST_UNWALKABLE);
                extensions.append(&mut unoccupied_neighbors);
                // Add the road to the plan
                path.iter().for_each(|&xy| tile_costs[xy] = COST_ROAD);
                structures
                    .entry(StructureType::Road)
                    .and_modify(|xys: &mut Vec<RoomXY>| xys.append(&mut path));
            }
        }

        // Traverse along its unoccupied neighbors
        current
            .neighbors()
            .into_iter()
            .filter(|&xy| tile_costs[xy] != COST_UNWALKABLE)
            .for_each(|xy| {
                if !visited[xy] {
                    visited[xy] = true;
                    queue.push_back(xy);
                }
            });
    }

    if extensions.len() != 60 {
        return Err("Unable to plan 60 extensions");
    }
    structures.insert(StructureType::Extension, extensions);

    Ok(structures)
}
