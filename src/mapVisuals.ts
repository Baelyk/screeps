import { RoomInfo, VisibleRoom } from "roomMemory";

export function mapVisualManager(): void {
  for (const roomName in Memory.rooms) {
    const pos = new RoomPosition(0, 5, roomName);
    const scoutTime = Game.time - VisibleRoom.getScoutingTime(roomName);
    Game.map.visual.text(`${scoutTime} ago`, pos);
  }
}
