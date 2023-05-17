export function some<T>(iterable: Iterable<T>, fn: (item: T) => boolean) {
	for (const item of iterable) {
		if (fn(item)) {
			return true;
		}
	}
	return false;
}
