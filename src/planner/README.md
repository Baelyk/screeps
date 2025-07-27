# Room Planner
1. Find spawn spot
    1. Spawn spot is found by pathing from the sources to the controller (starting with the closest source) and then finding the intersection of those paths. Then bfs for a tile with enough space around it (3 tiles in all directions).
    2. Place spawn stamp
2. Set up economy based on spawn spot
    1. Roads from sources to spawn, starting with closest source
    2. Place container at first road tile of each road (i.e. the one adjacent to the source)
    3. Road from spawn to controller (within two tiles)
    4. Place the link for the controller at the end of the spawn-controller road
    5. Place source links on an unoccupied tile adjacent to the source container
3. Sort the links so that the furthest from the spawn link is built first
4. If there is a mineral, add an extractor to it and build a road to it from the storage
5. Path to exits
6. Place extensions
