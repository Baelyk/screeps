export function serialize<K, V>(map: Map<K, V>): string {
	// Turns `undefined` into `"null"`
	return JSON.stringify(Array.from(map));
}

export function deserialize(serialized: string): Map<number, string> {
	const array = JSON.parse(serialized);
	return new Map(array) as Map<number, string>;
}
