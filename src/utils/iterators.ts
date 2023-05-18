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
