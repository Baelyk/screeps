import { overlayManager } from "overlay";
import { VisibleRoom } from "roomMemory";
export function roomVisualManager(room: VisibleRoom): void {
  overlayManager(room);
}
