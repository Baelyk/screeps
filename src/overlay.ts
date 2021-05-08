// Use RoomVisual to display info about rooms in the room
export function overlayManager(room: Room): void {
  const lines: string[] = [];

  // Show room name
  lines.push(showRoomName(room), "");

  if (room.memory.roomType != RoomType.remote) {
    // Show queue lengths
    lines.push(
      `Spawn queue:        ${room.memory.spawnQueue.length}`,
      `Construction queue: ${room.memory.constructionQueue.length}`,
      `Repair queue:       ${room.memory.repairQueue.length}`,
    );
    // Show available energy
    lines.push(
      `${Math.round(
        (room.energyAvailable / room.energyCapacityAvailable) * 100,
      )}% spawn energy`,
    );
    // Show storage energy
    if (room.storage != undefined) {
      lines.push(
        `Stored energy: ${room.storage.store.getUsedCapacity(RESOURCE_ENERGY)}`,
      );
    } else {
      lines.push("");
    }
  }

  // Show lines
  addTextLines(room.visual, lines, { x: 0, y: 1 });
}

const TEXT_STYLE: Partial<TextStyle> = {
  align: "left",
  font: "1 monospace",
};

function showRoomName(room: Room): string {
  const controller = room.controller;
  let text = room.name;
  if (controller != undefined) {
    if (controller.reservation != undefined) {
      text += ` reserved by ${controller.reservation.username} for ${controller.reservation.ticksToEnd}`;
    } else if (controller.my) {
      text += ` lvl ${controller.level} (${Math.round(
        (controller.progress / controller.progressTotal) * 100,
      )}%)`;
    } else {
      text += ` unreservered`;
    }
  }
  return text;
}

function addTextLines(
  visual: RoomVisual,
  lines: string[],
  position: { x: number; y: number },
): void {
  let lineOffset = position.y;
  lines.forEach((line) => {
    if (line !== "") {
      visual.text(line, position.x, lineOffset, TEXT_STYLE);
    }
    lineOffset++;
  });
}
