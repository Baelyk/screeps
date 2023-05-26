export function some<T>(
	iterable: Iterable<T>,
	fn: (item: T) => boolean,
): boolean {
	for (const item of iterable) {
		if (fn(item)) {
			return true;
		}
	}
	return false;
}

export function count<T>(
	iterable: Iterable<T>,
	fn: (item: T) => boolean,
): number {
	let num = 0;
	for (const item of iterable) {
		if (fn(item)) {
			num++;
		}
	}
	return num;
}

export function sum(iterable: Iterable<number>): number {
	let sum = 0;
	for (const item of iterable) {
		sum += item;
	}
	return sum;
}

export function zip<A, B>(
	iterableA: Iterable<A>,
	iterableB: Iterable<B>,
): Iterator<[A, B]> {
	const iteratorA = iterableA[Symbol.iterator]();
	const iteratorB = iterableB[Symbol.iterator]();
	const iterator = function* () {
		// Written out so TypeScript knows
		const nextA = iteratorA.next();
		if (nextA.done) {
			return;
		}
		const nextB = iteratorB.next();
		if (nextB.done) {
			return;
		}
		const next: [A, B] = [nextA.value, nextB.value];
		yield next;
	};

	return iterator();
}

export function all<T>(
	iterable: Iterable<T>,
	fn: (item: T) => boolean,
): boolean {
	for (const item of iterable) {
		if (!fn(item)) {
			return false;
		}
	}
	return true;
}
