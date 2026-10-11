extends Control

## mode_select_view.gd
## Controller for the Game Mode Selection modal dialog.
## Supports Pass & Play, vs Minimax AI, vs WebLLM AI, Spectator Arena,
## and live Theme selection across Wood, Marble, Glass, Metal, and Cyber.

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
@onready var persona_option: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM/PersonaHBox/PersonaOption
@onready var model_option: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM/ModelHBox/ModelOption
@onready var btn_llm_color_red: Button = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM/ColorHBox/BtnRed
@onready var btn_llm_color_black: Button = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelLLM/ColorHBox/BtnBlack

# Arena Controls
@onready var arena_red_type: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelArena/RedHBox/RedTypeOption
@onready var arena_black_type: OptionButton = $Backdrop/Dialog/Margin/VBox/ContentPanels/PanelArena/BlackHBox/BlackTypeOption

# Theme Selector
@onready var theme_option: OptionButton = $Backdrop/Dialog/Margin/VBox/ThemeHBox/ThemeOption

# Action Buttons
@onready var btn_start: Button = $Backdrop/Dialog/Margin/VBox/Actions/BtnStart
@onready var btn_close: Button = $Backdrop/Dialog/Margin/VBox/Header/BtnClose

# Selected state values
var _selected_mode: String = "minimax"
var _minimax_diff: String = "medium"
var _minimax_color: String = "red"
var _llm_color: String = "red"
var _llm_persona: String = "victorian"
var _llm_model: String = "Llama-3.2-1B-Instruct-q4f16_1-MLC"

# Clean persona list without emoji glyph issues
const PERSONAS = [
	{ "id": "victorian", "label": "Lord Worthington (Victorian)" },
	{ "id": "pirate", "label": "Captain Redbeard (Pirate)" },
	{ "id": "cyber", "label": "Unit 734 (Robot Core)" },
	{ "id": "anime", "label": "Kenji Kurogane (Anime Rival)" },
	{ "id": "grandma", "label": "Granny Edna (Warm Baker)" }
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

func _exit_tree() -> void:
	if ThemeManager != null and ThemeManager.theme_changed.is_connected(_on_theme_changed):
		ThemeManager.theme_changed.disconnect(_on_theme_changed)

func _setup_options() -> void:
	if persona_option:
		persona_option.clear()
		for p in PERSONAS:
			persona_option.add_item(p.label)
		persona_option.selected = 0

	if model_option:
		model_option.clear()
		for m in MODELS:
			model_option.add_item(m.label)
		model_option.selected = 0

	if arena_red_type:
		arena_red_type.clear()
		arena_red_type.add_item("Captain Redbeard (LLM)")
		arena_red_type.add_item("Minimax Medium")
		arena_red_type.selected = 0

	if arena_black_type:
		arena_black_type.clear()
		arena_black_type.add_item("Lord Worthington (LLM)")
		arena_black_type.add_item("Minimax Medium")
		arena_black_type.selected = 0

	if theme_option:
		theme_option.clear()
		for opt in THEME_OPTIONS:
			theme_option.add_item(opt.label)
		theme_option.item_selected.connect(_on_theme_option_selected)

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
	if btn_close:
		btn_close.pressed.connect(func(): visible = false)

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
		var p_idx: int = persona_option.selected if persona_option else 0
		var selected_persona: String = PERSONAS[p_idx].id if p_idx < PERSONAS.size() else "victorian"
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
		var red_is_llm: bool = (arena_red_type.selected == 0) if arena_red_type else true
		var black_is_llm: bool = (arena_black_type.selected == 0) if arena_black_type else true

		config = {
			"mode": "arena",
			"arenaRedType": "llm" if red_is_llm else "minimax",
			"arenaRedPersona": "pirate",
			"arenaBlackType": "llm" if black_is_llm else "minimax",
			"arenaBlackPersona": "victorian",
			"modelId": "Llama-3.2-1B-Instruct-q4f16_1-MLC"
		}

	print("[ModeSelect] Launching match with configuration: ", config)
	if Bridge != null:
		Bridge.notify_launch_match(config)

	match_launched.emit(config)
	visible = false
