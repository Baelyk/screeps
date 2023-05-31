export function bodyFromSegments(
	segment: BodyPartConstant[],
	energy: number,
	// 50 parts max, so 50 / parts in a segment max
	maxUnits = Math.floor(50 / segment.length),
): BodyPartConstant[] {
	const cost = _.sum(segment, (part) => {
		return BODYPART_COST[part];
	});
	const units = Math.min(maxUnits, Math.floor(energy / cost));
	const parts = _.countBy(segment, _.identity);
	const body: BodyPartConstant[] = [];
	let addMove = false;

	_.forEach(parts, (count, part) => {
		let quantity = count * units;
		if (part === MOVE) {
			addMove = true;
			quantity = count * units - 1;
		}
		for (let i = 0; i < quantity; i++) {
			body.push(part as BodyPartConstant);
		}
	});

	if (addMove) {
		body.push(MOVE);
	}

	return body;
}

export function genericBody(energy: number): BodyPartConstant[] {
	return bodyFromSegments([MOVE, WORK, CARRY], energy);
}

export function haulerBody(energy: number): BodyPartConstant[] {
	const body: BodyPartConstant[] = [];
	// Haulers/tenders don't really need more thnat 30 body parts, allowing
	// them 1000 carry capacity and 1 move speed on roads empty and full.
	// Energy capacity minus work cost divided by MOVE/CARRY cost
	//
	// Also, require at least 2 body units for a move and a carry
	const bodyUnits = Math.max(2, Math.min(30, Math.floor(energy / 50)));
	// 1/3 MOVE, rest CARRY
	for (let i = 0; i < bodyUnits; i++) {
		// Prioritize MOVE parts so that the creep always moves in 1
		if (i < Math.ceil(bodyUnits / 3)) {
			body.push(MOVE);
		} else {
			body.push(CARRY);
		}
	}
	return body;
}

export function hasBodyPart(creep: Creep, partType: BodyPartConstant): boolean {
	const body = creep.body;
	for (let i = 0; i < body.length; i++) {
		if (partType === body[i].type) return true;
	}
	return false;
}

export function countBodyPart(
	body: BodyPartDefinition[] | BodyPartConstant[],
	partType: BodyPartConstant,
): number {
	let count = 0;
	if (body.length === 0) {
		return 0;
	}
	if (typeof body[0] === "object" && body[0] !== null) {
		const partList = body as BodyPartDefinition[];

		partList.forEach((part) => {
			if (part.type === partType && part.hits > 0) count++;
		});
	} else {
		const partList = body as BodyPartConstant[];
		partList.forEach((part) => {
			if (part === partType) count++;
		});
	}
	return count;
}

export function bodyCost(
	body: BodyPartDefinition[] | BodyPartConstant[],
): number {
	let cost = 0;
	BODYPARTS_ALL.forEach((partType) => {
		const count = countBodyPart(body, partType);
		cost += count * BODYPART_COST[partType];
	});
	return cost;
}
