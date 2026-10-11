extends Control

## mode_select_view.gd
## Controller for the Game Mode Selection modal dialog.
## Supports Pass & Play, vs Minimax AI, vs WebLLM AI, Spectator Arena,
## and live Theme selection across Wood, Marble, Glass, Metal, and Cyber.
## Fully supports categorized 30-persona selection, expanded Spectator matchups,
## and dynamic initial load and on-demand randomization.

signal match_launched(config: Dictionary)

# Mode tab buttons
@onready var btn_tab_minimax: Button = $Backdrop/Dialog/Margin/VBox/TabButtons/BtnMinimax
@onready var btn_tab_llm: Button = $Backdrop/Dialog/Margin/VBox/TabButtons/BtnLLM
@onready var btn_tab_pvp: Button = $Backdrop/Dialog/Margin/VBox/TabButtons/BtnPvP
@onready var btn_tab_arena: Button = $Backdrop/Dialog/Margin/VBox/TabButtons/BtnArena

# Panels for each mode
@onready var panel_minimax: VBoxContainer = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelMinimax
@onready var panel_llm: VBoxContainer = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM
@onready var panel_pvp: VBoxContainer = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelPvP
@onready var panel_arena: VBoxContainer = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelArena

# Minimax Controls
@onready var btn_diff_easy: Button = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelMinimax/DiffHBox/BtnEasy
@onready var btn_diff_med: Button = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelMinimax/DiffHBox/BtnMedium
@onready var btn_diff_hard: Button = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelMinimax/DiffHBox/BtnHard
@onready var btn_mm_color_red: Button = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelMinimax/ColorHBox/BtnRed
@onready var btn_mm_color_black: Button = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelMinimax/ColorHBox/BtnBlack

# LLM Controls
@onready var category_option: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM/CategoryHBox/CategoryOption
@onready var persona_option: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM/PersonaHBox/PersonaOption
@onready var model_option: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM/ModelHBox/ModelOption
@onready var btn_llm_color_red: Button = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM/ColorHBox/BtnRed
@onready var btn_llm_color_black: Button = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM/ColorHBox/BtnBlack

# Arena Controls
@onready var arena_red_category: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelArena/RedHBox/RedCategoryOption
@onready var arena_red_selection: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelArena/RedHBox/RedSelectionOption
@onready var arena_black_category: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelArena/BlackHBox/BlackCategoryOption
@onready var arena_black_selection: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelArena/BlackHBox/BlackSelectionOption

# Theme Selector
@onready var theme_option: OptionButton = $Backdrop/Dialog/Margin/VBox/ThemeHBox/ThemeOption

# Action Buttons
@onready var btn_start: Button = $Backdrop/Dialog/Margin/VBox/Actions/BtnStart
@onready var btn_randomize: Button = $Backdrop/Dialog/Margin/VBox/Header/BtnRandomize
@onready var btn_close: Button = $Backdrop/Dialog/Margin/VBox/Header/BtnClose

# Selected state values
var _selected_mode: String = "minimax"
var _minimax_diff: String = "medium"
var _minimax_color: String = "red"
var _llm_color: String = "red"
var _llm_model: String = "Llama-3.2-1B-Instruct-q4f16_1-MLC"

# Categorized Persona Roster (30 total personas, 10 per category)
const CATEGORIES = [
	{ "id": "standard", "label": "Standard" },
	{ "id": "cybernetic", "label": "Cybernetic" },
	{ "id": "creative", "label": "Creative" }
]

const ALL_PERSONAS = [
	# Standard (10)
	{ "id": "grandmaster", "category": "standard", "label": "Boris Volkov (Grandmaster)" },
	{ "id": "casual", "category": "standard", "label": "Sammy Davis (Coffee-Shop)" },
	{ "id": "tactician", "category": "standard", "label": "Valeria Cruz (Tactician)" },
	{ "id": "coach", "category": "standard", "label": "Coach Dan (Strategist)" },
	{ "id": "grandma", "category": "standard", "label": "Granny Edna (Baker)" },
	{ "id": "napoleon", "category": "standard", "label": "Emperor Bonaparte (Conqueror)" },
	{ "id": "cleopatra", "category": "standard", "label": "Queen Cleopatra (Pharaoh)" },
	{ "id": "franklin", "category": "standard", "label": "Ben Franklin (Statesman)" },
	{ "id": "joan", "category": "standard", "label": "Joan of Arc (Vanguard)" },
	{ "id": "monk", "category": "standard", "label": "Master Tenzin (Zen Sage)" },

	# Cybernetic (10)
	{ "id": "cyber", "category": "cybernetic", "label": "Unit 734 (Logic Core)" },
	{ "id": "roomba", "category": "cybernetic", "label": "DustBuster 3000 (Vacuum)" },
	{ "id": "smart_fridge", "category": "cybernetic", "label": "ChillMaster 9000 (Fridge)" },
	{ "id": "glitch_phone", "category": "cybernetic", "label": "PocketDroid 4G (Phone)" },
	{ "id": "tamagotchi", "category": "cybernetic", "label": "PixelPet 96 (Virtual Pet)" },
	{ "id": "dialup", "category": "cybernetic", "label": "BaudRate 56k (Modem)" },
	{ "id": "glitched_npc", "category": "cybernetic", "label": "Error_404_NPC (Glitched NPC)" },
	{ "id": "arcade", "category": "cybernetic", "label": "CoinOp 1984 (Arcade)" },
	{ "id": "quantum_ai", "category": "cybernetic", "label": "Q-Bit Prime (Quantum AI)" },
	{ "id": "assistant", "category": "cybernetic", "label": "Clippy Assistant (Helper)" },

	# Creative (10)
	{ "id": "pirate", "category": "creative", "label": "Captain Redbeard (Pirate)" },
	{ "id": "victorian", "category": "creative", "label": "Lord Worthington (Victorian)" },
	{ "id": "anime", "category": "creative", "label": "Kenji Kurogane (Anime Rival)" },
	{ "id": "soap_opera", "category": "creative", "label": "Valentina Sterling (Diva)" },
	{ "id": "conspiracy", "category": "creative", "label": "Agent Truth (Investigator)" },
	{ "id": "noir", "category": "creative", "label": "Detective Vance (Private Eye)" },
	{ "id": "bard", "category": "creative", "label": "Master Jeffrey (Minstrel)" },
	{ "id": "goblin", "category": "creative", "label": "Grix the Greedy (Goblin)" },
	{ "id": "chef", "category": "creative", "label": "Chef Pierre (French Chef)" },
	{ "id": "thespian", "category": "creative", "label": "Sir Reginald Acton (Thespian)" }
]

const ARENA_CATEGORIES = [
	{ "id": "minimax", "label": "Minimax AI" },
	{ "id": "standard", "label": "Standard AI" },
	{ "id": "cybernetic", "label": "Cybernetic AI" },
	{ "id": "creative", "label": "Creative AI" }
]

const MINIMAX_DIFFICULTIES = [
	{ "id": "easy", "label": "Easy" },
	{ "id": "medium", "label": "Medium" },
	{ "id": "hard", "label": "Hard" }
]

const MODELS = [
	{ "id": "Llama-3.2-1B-Instruct-q4f16_1-MLC", "label": "Llama 3.2 1B (Fast, Balanced)" },
	{ "id": "SmolLM2-1.7B-Instruct-q4f16_1-MLC", "label": "SmolLM2 1.7B (Tactical)" },
	{ "id": "SmolLM2-360M-Instruct-q4f16_1-MLC", "label": "SmolLM2 360M (Ultra Fast)" },
	{ "id": "Llama-3.2-3B-Instruct-q4f16_1-MLC", "label": "Llama 3.2 3B (Grandmaster)" }
]

const THEME_OPTIONS = [
	{ "id": "wood", "label": "Classic Hardwood" },
	{ "id": "marble", "label": "Carrara Marble" },
	{ "id": "glass", "label": "Crystal Glass" },
	{ "id": "metal", "label": "Brushed Metal" },
	{ "id": "cyber", "label": "Cyber Neon" }
]

func _ready() -> void:
	_setup_options()
	_bind_events()
	_update_tab_selection("minimax")
	_update_diff_selection("medium")
	_update_color_selection("red")

	if ThemeManager != null:
		ThemeManager.theme_changed.connect(_on_theme_changed)
		_sync_theme_selection(ThemeManager.get_current_theme())

	# Initial load dynamic randomization
	_randomize_defaults()

func _exit_tree() -> void:
	if ThemeManager != null and ThemeManager.theme_changed.is_connected(_on_theme_changed):
		ThemeManager.theme_changed.disconnect(_on_theme_changed)

func _get_personas_by_category(cat_id: String) -> Array:
	var result: Array = []
	for p in ALL_PERSONAS:
		if p.category == cat_id:
			result.append(p)
	return result

func _setup_options() -> void:
	# Category Option for LLM
	if category_option:
		category_option.clear()
		for cat in CATEGORIES:
			category_option.add_item(cat.label)
		category_option.item_selected.connect(_on_llm_category_selected)
		category_option.selected = 0
		_populate_llm_personas("standard")

	# Model Option for LLM
	if model_option:
		model_option.clear()
		for m in MODELS:
			model_option.add_item(m.label)
		model_option.selected = 0

	# Spectator Arena Categories & Dropdowns
	_setup_arena_options()

	# Theme Selector
	if theme_option:
		theme_option.clear()
		for opt in THEME_OPTIONS:
			theme_option.add_item(opt.label)
		theme_option.item_selected.connect(_on_theme_option_selected)

func _on_llm_category_selected(index: int) -> void:
	if index >= 0 and index < CATEGORIES.size():
		var cat_id = CATEGORIES[index].id
		_populate_llm_personas(cat_id)

func _populate_llm_personas(cat_id: String, select_persona_id: String = "") -> void:
	if persona_option == null:
		return
	persona_option.clear()
	var list = _get_personas_by_category(cat_id)
	var selected_idx = 0
	for i in range(list.size()):
		persona_option.add_item(list[i].label)
		if list[i].id == select_persona_id:
			selected_idx = i
	persona_option.selected = selected_idx

func _setup_arena_options() -> void:
	if arena_red_category:
		arena_red_category.clear()
		for cat in ARENA_CATEGORIES:
			arena_red_category.add_item(cat.label)
		arena_red_category.item_selected.connect(_on_arena_red_category_selected)
		arena_red_category.selected = 3 # Creative AI by default

	if arena_red_selection:
		_populate_arena_selection(arena_red_selection, "creative", "pirate")

	if arena_black_category:
		arena_black_category.clear()
		for cat in ARENA_CATEGORIES:
			arena_black_category.add_item(cat.label)
		arena_black_category.item_selected.connect(_on_arena_black_category_selected)
		arena_black_category.selected = 3 # Creative AI by default

	if arena_black_selection:
		_populate_arena_selection(arena_black_selection, "creative", "victorian")

func _on_arena_red_category_selected(index: int) -> void:
	if index >= 0 and index < ARENA_CATEGORIES.size():
		_populate_arena_selection(arena_red_selection, ARENA_CATEGORIES[index].id)

func _on_arena_black_category_selected(index: int) -> void:
	if index >= 0 and index < ARENA_CATEGORIES.size():
		_populate_arena_selection(arena_black_selection, ARENA_CATEGORIES[index].id)

func _populate_arena_selection(target_option: OptionButton, cat_id: String, select_id: String = "") -> void:
	if target_option == null:
		return
	target_option.clear()
	var selected_idx = 0
	if cat_id == "minimax":
		for i in range(MINIMAX_DIFFICULTIES.size()):
			target_option.add_item(MINIMAX_DIFFICULTIES[i].label)
			if MINIMAX_DIFFICULTIES[i].id == select_id:
				selected_idx = i
	else:
		var list = _get_personas_by_category(cat_id)
		for i in range(list.size()):
			target_option.add_item(list[i].label)
			if list[i].id == select_id:
				selected_idx = i
	target_option.selected = selected_idx

func _get_arena_slot_config(cat_option: OptionButton, sel_option: OptionButton) -> Dictionary:
	var cat_idx: int = cat_option.selected if cat_option else 0
	var cat_id: String = ARENA_CATEGORIES[cat_idx].id if cat_idx < ARENA_CATEGORIES.size() else "minimax"
	var sel_idx: int = sel_option.selected if sel_option else 0

	if cat_id == "minimax":
		var diff = MINIMAX_DIFFICULTIES[sel_idx].id if sel_idx < MINIMAX_DIFFICULTIES.size() else "medium"
		return { "type": "minimax", "persona": "", "difficulty": diff }
	else:
		var list = _get_personas_by_category(cat_id)
		var persona_id = list[sel_idx].id if sel_idx < list.size() else "pirate"
		return { "type": "llm", "persona": persona_id, "difficulty": "medium" }

func _on_theme_option_selected(index: int) -> void:
	if index >= 0 and index < THEME_OPTIONS.size():
		var id = THEME_OPTIONS[index].id
		if ThemeManager != null:
			ThemeManager.set_theme(id)

func _on_theme_changed(theme_id: String) -> void:
	_sync_theme_selection(theme_id)

func _sync_theme_selection(theme_id: String) -> void:
	if theme_option == null:
		return
	for i in range(THEME_OPTIONS.size()):
		if THEME_OPTIONS[i].id == theme_id:
			theme_option.selected = i
			break

func _bind_events() -> void:
	# Tab buttons
	if btn_tab_minimax:
		btn_tab_minimax.pressed.connect(func(): _update_tab_selection("minimax"))
	if btn_tab_llm:
		btn_tab_llm.pressed.connect(func(): _update_tab_selection("llm"))
	if btn_tab_pvp:
		btn_tab_pvp.pressed.connect(func(): _update_tab_selection("pvp"))
	if btn_tab_arena:
		btn_tab_arena.pressed.connect(func(): _update_tab_selection("arena"))

	# Minimax Difficulty
	if btn_diff_easy:
		btn_diff_easy.pressed.connect(func(): _update_diff_selection("easy"))
	if btn_diff_med:
		btn_diff_med.pressed.connect(func(): _update_diff_selection("medium"))
	if btn_diff_hard:
		btn_diff_hard.pressed.connect(func(): _update_diff_selection("hard"))

	# Minimax Color
	if btn_mm_color_red:
		btn_mm_color_red.pressed.connect(func(): _update_color_selection("red"))
	if btn_mm_color_black:
		btn_mm_color_black.pressed.connect(func(): _update_color_selection("black"))

	# LLM Color
	if btn_llm_color_red:
		btn_llm_color_red.pressed.connect(func(): _update_color_selection("red"))
	if btn_llm_color_black:
		btn_llm_color_black.pressed.connect(func(): _update_color_selection("black"))

	# Actions
	if btn_start:
		btn_start.pressed.connect(_on_btn_start_pressed)
	if btn_randomize:
		btn_randomize.pressed.connect(_on_btn_randomize_pressed)
	if btn_close:
		btn_close.pressed.connect(func(): visible = false)

func _on_btn_randomize_pressed() -> void:
	_randomize_defaults()

func _randomize_defaults() -> void:
	# 1. Randomize Board Theme
	var rand_theme_idx: int = randi() % THEME_OPTIONS.size()
	var rand_theme_id: String = THEME_OPTIONS[rand_theme_idx].id
	if ThemeManager != null:
		ThemeManager.set_theme(rand_theme_id)
	if theme_option != null:
		theme_option.selected = rand_theme_idx

	# 2. Randomize LLM Category & Persona
	var rand_cat_idx: int = randi() % CATEGORIES.size()
	if category_option != null:
		category_option.selected = rand_cat_idx
	var cat_id: String = CATEGORIES[rand_cat_idx].id
	var personas_in_cat: Array = _get_personas_by_category(cat_id)
	var rand_p_idx: int = randi() % personas_in_cat.size()
	_populate_llm_personas(cat_id, personas_in_cat[rand_p_idx].id)

	# 3. Randomize Spectator Red & Black Matchup
	# Pick Red: either Minimax or one of the AI categories
	var red_cat_idx: int = randi() % ARENA_CATEGORIES.size()
	var red_cat_id: String = ARENA_CATEGORIES[red_cat_idx].id
	if arena_red_category != null:
		arena_red_category.selected = red_cat_idx

	var red_chosen_id: String = ""
	if red_cat_id == "minimax":
		var diff_idx = randi() % MINIMAX_DIFFICULTIES.size()
		red_chosen_id = MINIMAX_DIFFICULTIES[diff_idx].id
		_populate_arena_selection(arena_red_selection, red_cat_id, red_chosen_id)
	else:
		var red_list = _get_personas_by_category(red_cat_id)
		var p_idx = randi() % red_list.size()
		red_chosen_id = red_list[p_idx].id
		_populate_arena_selection(arena_red_selection, red_cat_id, red_chosen_id)

	# Pick Black: ensure it isn't identical to Red
	var black_cat_idx: int = randi() % ARENA_CATEGORIES.size()
	var black_cat_id: String = ARENA_CATEGORIES[black_cat_idx].id
	if arena_black_category != null:
		arena_black_category.selected = black_cat_idx

	if black_cat_id == "minimax":
		var diff_idx = randi() % MINIMAX_DIFFICULTIES.size()
		_populate_arena_selection(arena_black_selection, black_cat_id, MINIMAX_DIFFICULTIES[diff_idx].id)
	else:
		var black_list = _get_personas_by_category(black_cat_id)
		var b_idx = randi() % black_list.size()
		if black_list[b_idx].id == red_chosen_id and black_list.size() > 1:
			b_idx = (b_idx + 1) % black_list.size()
		_populate_arena_selection(arena_black_selection, black_cat_id, black_list[b_idx].id)

func _update_tab_selection(mode: String) -> void:
	_selected_mode = mode
	if panel_minimax:
		panel_minimax.visible = (mode == "minimax")
	if panel_llm:
		panel_llm.visible = (mode == "llm")
	if panel_pvp:
		panel_pvp.visible = (mode == "pvp")
	if panel_arena:
		panel_arena.visible = (mode == "arena")

	# Highlight active tab button
	_highlight_button(btn_tab_minimax, mode == "minimax")
	_highlight_button(btn_tab_llm, mode == "llm")
	_highlight_button(btn_tab_pvp, mode == "pvp")
	_highlight_button(btn_tab_arena, mode == "arena")

func _update_diff_selection(diff: String) -> void:
	_minimax_diff = diff
	_highlight_button(btn_diff_easy, diff == "easy")
	_highlight_button(btn_diff_med, diff == "medium")
	_highlight_button(btn_diff_hard, diff == "hard")

func _update_color_selection(color: String) -> void:
	_minimax_color = color
	_llm_color = color
	_highlight_button(btn_mm_color_red, color == "red")
	_highlight_button(btn_mm_color_black, color == "black")
	_highlight_button(btn_llm_color_red, color == "red")
	_highlight_button(btn_llm_color_black, color == "black")

func _highlight_button(btn: Button, active: bool) -> void:
	if btn == null:
		return
	if active:
		btn.modulate = Color(1.0, 0.9, 0.6, 1.0)
	else:
		btn.modulate = Color(0.7, 0.7, 0.7, 1.0)

func _on_btn_start_pressed() -> void:
	var config: Dictionary = {}

	if _selected_mode == "pvp":
		config = {
			"mode": "pvp"
		}
	elif _selected_mode == "minimax":
		config = {
			"mode": "minimax",
			"difficulty": _minimax_diff,
			"minimaxColor": _minimax_color
		}
	elif _selected_mode == "llm":
		var cat_idx: int = category_option.selected if category_option else 0
		var cat_id: String = CATEGORIES[cat_idx].id if cat_idx < CATEGORIES.size() else "standard"
		var personas: Array = _get_personas_by_category(cat_id)
		var p_idx: int = persona_option.selected if persona_option else 0
		var selected_persona: String = personas[p_idx].id if p_idx < personas.size() else "victorian"
		var m_idx: int = model_option.selected if model_option else 0
		var selected_model: String = MODELS[m_idx].id if m_idx < MODELS.size() else "Llama-3.2-1B-Instruct-q4f16_1-MLC"

		config = {
			"mode": "llm",
			"llmPersona": selected_persona,
			"llmColor": _llm_color,
			"modelId": selected_model,
			"tacticalMode": "wild"
		}
	elif _selected_mode == "arena":
		var red_cfg = _get_arena_slot_config(arena_red_category, arena_red_selection)
		var black_cfg = _get_arena_slot_config(arena_black_category, arena_black_selection)

		config = {
			"mode": "arena",
			"arenaRedType": red_cfg.type,
			"arenaRedPersona": red_cfg.persona,
			"arenaRedDifficulty": red_cfg.difficulty,
			"arenaBlackType": black_cfg.type,
			"arenaBlackPersona": black_cfg.persona,
			"arenaBlackDifficulty": black_cfg.difficulty,
			"modelId": "Llama-3.2-1B-Instruct-q4f16_1-MLC"
		}

	print("[ModeSelect] Launching match with configuration: ", config)
	if Bridge != null:
		Bridge.notify_launch_match(config)

	match_launched.emit(config)
	visible = false
