# Room Planner
1. Get room data
2. Construct terrain costs for pathfinding
3. Distance transform from walls
4. Calculate spawn spot score:
    - Consider tiles with distance transform 3 or more
    - Calculate distances from each source and from the controller
    - Score for a tile is: distance from sources + 2 * distance from controller
5. Find upgrade area
