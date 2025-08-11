use screeps::{RectStyle, RoomVisual, TextStyle};

const GRID_OFFSET: f32 = 0.5;
const TEXT_Y_OFFSET: f32 = 0.2;
const TEXT_SIZE: f32 = 0.8;

pub fn text_lines(visual: &RoomVisual, lines: impl IntoIterator<Item = String>, x: f32, y: f32) {
    lines.into_iter().enumerate().for_each(|(i, line)| {
        visual.text(
            x - GRID_OFFSET,
            y - TEXT_Y_OFFSET + GRID_OFFSET + i as f32,
            line,
            Some(
                TextStyle::default()
                    .custom_font(&format!("{TEXT_SIZE} monospace"))
                    .align(screeps::TextAlign::Left),
            ),
        )
    })
}

pub fn progress_bar(visual: &RoomVisual, progress: f32, text: String, x: f32, y: f32) {
    let progress = if progress.is_nan() {
        0.0
    } else {
        progress.clamp(0.0, 1.0)
    };
    const HEIGHT: f32 = 0.95;
    const WIDTH: f32 = 10.0;
    const STROKE_WIDTH: f32 = 0.1;

    // Outline
    visual.rect(
        x - GRID_OFFSET + STROKE_WIDTH / 2.0,
        y - GRID_OFFSET + STROKE_WIDTH / 2.0 + (1.0 - HEIGHT) / 2.0,
        WIDTH - STROKE_WIDTH,
        HEIGHT - STROKE_WIDTH,
        Some(
            RectStyle::default()
                .fill("")
                .stroke("#ffffff")
                .stroke_width(STROKE_WIDTH),
        ),
    );

    // Progress fill
    visual.rect(
        x - GRID_OFFSET,
        y - GRID_OFFSET + (1.0 - HEIGHT) / 2.0,
        progress * WIDTH,
        HEIGHT,
        Some(
            RectStyle::default()
                .fill("#ffffff")
                .stroke("")
                .stroke_width(STROKE_WIDTH),
        ),
    );

    // Inside text
    visual.text(
        x - GRID_OFFSET + STROKE_WIDTH,
        y + 1.0 - GRID_OFFSET - TEXT_Y_OFFSET,
        text,
        Some(TextStyle::default().align(screeps::TextAlign::Left)),
    );

    // Percent text
    visual.text(
        x - GRID_OFFSET + WIDTH - STROKE_WIDTH,
        y + 1.0 - GRID_OFFSET - TEXT_Y_OFFSET,
        format!("{:.0}%", progress * 100.0),
        Some(TextStyle::default().align(screeps::TextAlign::Right)),
    );
}
