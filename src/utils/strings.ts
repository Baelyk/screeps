/**
 * Splits a string in two at the first occurance of a separator.
 * @param str str the string to split
 * @param separator the separator
 * @returns A string tuple with the two parts. If the separator was not found,
 * the second string is empty.
 */
export function splitFirst(str: string, separator: string): [string, string] {
	let index = str.indexOf(separator);
	if (index === -1) {
		index = str.length;
	}
	return [str.slice(0, index - 1), str.slice(index + 1)];
}

/**
 * Splits a string in two at the last occurance of a separator.
 * @param str str the string to split
 * @param separator the separator
 * @returns A string tuple with the two parts. If the separator was not found,
 * the second string is empty.
 */
export function splitLast(str: string, separator: string): [string, string] {
	let index = str.lastIndexOf(separator);
	if (index === -1) {
		index = str.length;
	}
	return [str.slice(0, index - 1), str.slice(index + 1)];
}
