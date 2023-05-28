import { info, warn } from "./../utils/logger";

const GRID_OFFSET = 0.5;
const TEXT_Y_OFFSET = 0.2;
const TEXT_SIZE = 0.8;

const TEXT_STYLE: Partial<TextStyle> = {
	align: "left",
	font: `${TEXT_SIZE} monospace`,
};

export function textLines(
	visual: RoomVisual,
	lines: string[],
	x: number,
	y: number,
	style?: Partial<TextStyle>,
): void {
	lines.forEach((line, lineNum) => {
		if (line !== "") {
			visual.text(
				line,
				x + GRID_OFFSET,
				y - TEXT_Y_OFFSET + GRID_OFFSET + lineNum,
				{ ...TEXT_STYLE, ...style },
			);
		}
	});
}

export function progressBar(
	visual: RoomVisual,
	progress: number,
	text: string | null,
	x: number,
	y: number,
	width: number,
	showProgress = true,
) {
	const height = 0.95;
	const strokeWidth = 0.1;
	visual.rect(
		x + GRID_OFFSET + strokeWidth / 2,
		y + GRID_OFFSET + strokeWidth / 2 + (1 - height) / 2,
		width - strokeWidth,
		height - strokeWidth,
		{
			fill: "",
			stroke: "#ffffff",
			strokeWidth,
		},
	);
	visual.rect(
		x + GRID_OFFSET,
		y + GRID_OFFSET + (1 - height) / 2,
		Math.min(1, progress) * width,
		height,
		{
			fill: "#ffffff",
			stroke: "",
		},
	);

	if (text != null) {
		visual.text(
			text,
			x + GRID_OFFSET + strokeWidth,
			y + 1 + GRID_OFFSET - TEXT_Y_OFFSET,
			{
				...TEXT_STYLE,
			},
		);
	}

	if (showProgress) {
		visual.text(
			displayPercent(progress),
			x + GRID_OFFSET + width - strokeWidth,
			y + 1 + GRID_OFFSET - TEXT_Y_OFFSET,
			{
				...TEXT_STYLE,
				align: "right",
			},
		);
	}
}

export function box(
	visual: RoomVisual,
	x: number,
	y: number,
	width: number,
	height: number,
	color: string,
	style?: Partial<PolyStyle>,
): void {
	const strokeWidth = 0.1;
	visual.rect(
		x - 1 + GRID_OFFSET + strokeWidth / 2,
		y - 1 + GRID_OFFSET + strokeWidth / 2,
		width - strokeWidth,
		height - strokeWidth,
		{
			...style,
			fill: "",
			stroke: color,
			strokeWidth,
		},
	);
}

function hexToRgb(hex: string): [number, number, number] {
	return [
		parseInt(hex.substring(1, 3), 16),
		parseInt(hex.substring(3, 5), 16),
		parseInt(hex.substring(5, 7), 16),
	];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
	const rStr = leftPad(r.toString(16), 2, "0");
	const gStr = leftPad(g.toString(16), 2, "0");
	const bStr = leftPad(b.toString(16), 2, "0");
	return `#${rStr}${gStr}${bStr}`;
}

function interpolate(a: number, b: number, t: number): number {
	return (1 - t) * a + b * t;
}

function leftPad(str: string, padTo: number, padFill = " "): string {
	return `${padFill.repeat(
		Math.floor((padTo - str.length) / padFill.length),
	)}${str}`;
}

export function interpolateColors(
	color0: string,
	color1: string,
	t: number,
): string {
	const [r0, g0, b0] = hexToRgb(color0);
	const [r1, g1, b1] = hexToRgb(color1);

	const r = Math.round(interpolate(r0, r1, t));
	const g = Math.round(interpolate(g0, g1, t));
	const b = Math.round(interpolate(b0, b1, t));

	const hex = rgbToHex([r, g, b]);
	return hex;
}

export function displayPercent(percent: number): string {
	const percentage = Math.round(percent * 100);
	return `${percentage < 999 ? percentage : ">999"}%`;
}

export function displayPerTick(perTick: number): string {
	return `${Math.round(perTick)}/t`;
}
