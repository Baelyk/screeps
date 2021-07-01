import { RoomInfo, VisibleRoom } from "roomMemory";

const TEXT_STYLE: Partial<TextStyle> = {
  align: "left",
  font: "1 monospace",
};

export function mapVisualManager(): void {
  for (const roomName in Memory.rooms) {
    if (VisibleRoom.isVisible(roomName)) {
      // Mark rooms with vision with an outline
      Game.map.visual.poly(
        [
          new RoomPosition(0, 0, roomName),
          new RoomPosition(0, 49, roomName),
          new RoomPosition(49, 49, roomName),
          new RoomPosition(49, 0, roomName),
          new RoomPosition(0, 0, roomName),
        ],
        {
          stroke: "#ffff00",
          strokeWidth: 0.5,
        },
      );
    }
    const pos = new RoomPosition(0, 5, roomName);
    const scoutTime = Game.time - VisibleRoom.getScoutingTime(roomName);
    Game.map.visual.text(`${scoutTime} ago`, pos, TEXT_STYLE);
  }
}
