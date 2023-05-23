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
		progress * width,
		height,
		{
			fill: "#ffffff",
			stroke: "",
		},
	);

	if (text != null) {
		visual.text(
			text,
			x + GRID_OFFSET, // + width / 2,
			y + 1 + GRID_OFFSET - TEXT_Y_OFFSET,
			{
				...TEXT_STYLE,
				//align: "center",
			},
		);
	}
}
