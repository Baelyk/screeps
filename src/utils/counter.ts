import { zip } from "./iterators";
import { info } from "./logger";

export class Counter<T> extends Map<T, number> {
	static zeros = (function* () {
		while (true) yield 0;
	})();

	push(item: T): number {
		const count = this.get(item) || 0;
		this.set(item, count + 1);
		return count + 1;
	}

	pushMany(items: T[]): void {
		for (const item of items) {
			this.push(item);
		}
	}
}
