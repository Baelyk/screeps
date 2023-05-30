### A Pluto.jl notebook ###
# v0.19.26

using Markdown
using InteractiveUtils

# ╔═╡ 1233a311-1ca7-4588-93ea-7c8dc12432e8
const CREEP_LIFE_TIME = 1500

# ╔═╡ f0129564-ff17-11ed-17c6-c59dcefd72e6
function bodyCost(size)
	# One CARRY + size number of [MOVE, WORk, WORK]
	50 + size * 250
end

# ╔═╡ a07366dd-a42c-4405-8d50-825436845188
function harvestTicks(size)
	# HARVEST_POWER * 2 WORKs per size
	ceil(3000 / (2 * 2 * size))
end

# ╔═╡ 74fcd29e-9a0e-4db5-aace-4abdafb6b375
function miningCost(size)
	# The cost to spawn the miner
	@show minerCost = bodyCost(size)
	# The time to source regen with this miner
	regenTime = max((@show harvestTicks(size)), 300)
	# The number of source cycles mined
	cycles = CREEP_LIFE_TIME / regenTime
	# The amount of energy mined over time by this miner
	@show energy = cycles * 3000
	# Energy cost per energy mined
	@show energyCost = minerCost / energy
	# CPU cost
	@show cpuCost = 0.2 / (2 * size)
	energyCost, cpuCost
end

# ╔═╡ f5541b52-b463-4f13-947b-8a7ff6290abd
# Seems like it makes most sense energy cost wise to prioritize small miners, CPU cost wise to prioritize large miners
miningCost(4)

# ╔═╡ Cell order:
# ╠═1233a311-1ca7-4588-93ea-7c8dc12432e8
# ╠═f0129564-ff17-11ed-17c6-c59dcefd72e6
# ╠═a07366dd-a42c-4405-8d50-825436845188
# ╠═74fcd29e-9a0e-4db5-aace-4abdafb6b375
# ╠═f5541b52-b463-4f13-947b-8a7ff6290abd
