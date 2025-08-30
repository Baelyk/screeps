use std::collections::VecDeque;

use screeps::{Direction, ROOM_USIZE, RoomXY, XMajor};

pub type DistanceTransform = XMajor<u8>;
pub fn distance_transform<'a>(
    start: impl Iterator<Item = RoomXY>,
    obstacles: impl Iterator<Item = RoomXY>,
) -> DistanceTransform {
    let mut distances = XMajor([[255; ROOM_USIZE]; ROOM_USIZE]);
    let mut queue = VecDeque::new();
    let mut visited = XMajor([[false; ROOM_USIZE]; ROOM_USIZE]);

    start.for_each(|xy| {
        distances[xy] = 0;
        queue.push_back(xy);
        visited[xy] = true;
    });

    obstacles.for_each(|xy| {
        visited[xy] = true;
    });

    while let Some(current) = queue.pop_front() {
        Direction::iter()
            .filter_map(|&direction| current.checked_add_direction(direction))
            .for_each(|neighbor| {
                if !visited[neighbor] {
                    distances[neighbor] = distances[current] + 1;
                    visited[neighbor] = true;
                    queue.push_back(neighbor);
                }
            });
    }

    distances
}
