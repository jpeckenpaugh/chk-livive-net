extends Control

## theme_modal_view.gd
## Controller for the Theme Customization Modal dialog.
## Allows real-time switching between 5 themes: Wood, Marble, Glass, Metal, and Cyber.

@onready var btn_close: Button = $Backdrop/Dialog/Margin/VBox/Header/BtnClose
@onready var btn_done: Button = $Backdrop/Dialog/Margin/VBox/Footer/BtnDone

# Theme Cards
@onready var card_wood: PanelContainer = $Backdrop/Dialog/Margin/VBox/ThemeList/CardWood
@onready var card_marble: PanelContainer = $Backdrop/Dialog/Margin/VBox/ThemeList/CardMarble
@onready var card_glass: PanelContainer = $Backdrop/Dialog/Margin/VBox/ThemeList/CardGlass
@onready var card_metal: PanelContainer = $Backdrop/Dialog/Margin/VBox/ThemeList/CardMetal
@onready var card_cyber: PanelContainer = $Backdrop/Dialog/Margin/VBox/ThemeList/CardCyber

# Select Buttons
@onready var btn_wood: Button = $Backdrop/Dialog/Margin/VBox/ThemeList/CardWood/Margin/HBox/BtnSelectWood
@onready var btn_marble: Button = $Backdrop/Dialog/Margin/VBox/ThemeList/CardMarble/Margin/HBox/BtnSelectMarble
@onready var btn_glass: Button = $Backdrop/Dialog/Margin/VBox/ThemeList/CardGlass/Margin/HBox/BtnSelectGlass
@onready var btn_metal: Button = $Backdrop/Dialog/Margin/VBox/ThemeList/CardMetal/Margin/HBox/BtnSelectMetal
@onready var btn_cyber: Button = $Backdrop/Dialog/Margin/VBox/ThemeList/CardCyber/Margin/HBox/BtnSelectCyber

func _ready() -> void:
	visible = false

	if btn_close:
		btn_close.pressed.connect(func(): visible = false)
	if btn_done:
		btn_done.pressed.connect(func(): visible = false)

	if btn_wood:
		btn_wood.pressed.connect(func(): _select_theme("wood"))
	if btn_marble:
		btn_marble.pressed.connect(func(): _select_theme("marble"))
	if btn_glass:
		btn_glass.pressed.connect(func(): _select_theme("glass"))
	if btn_metal:
		btn_metal.pressed.connect(func(): _select_theme("metal"))
	if btn_cyber:
		btn_cyber.pressed.connect(func(): _select_theme("cyber"))

	if ThemeManager != null:
		ThemeManager.theme_changed.connect(_on_theme_changed)
		_update_active_ui(ThemeManager.get_current_theme())

func _exit_tree() -> void:
	if ThemeManager != null and ThemeManager.theme_changed.is_connected(_on_theme_changed):
		ThemeManager.theme_changed.disconnect(_on_theme_changed)

func open() -> void:
	if ThemeManager != null:
		_update_active_ui(ThemeManager.get_current_theme())
	visible = true

func _select_theme(theme_id: String) -> void:
	if ThemeManager != null:
		ThemeManager.set_theme(theme_id)

func _on_theme_changed(theme_id: String) -> void:
	_update_active_ui(theme_id)

func _update_active_ui(active_theme: String) -> void:
	_set_card_state(card_wood, btn_wood, active_theme == "wood")
	_set_card_state(card_marble, btn_marble, active_theme == "marble")
	_set_card_state(card_glass, btn_glass, active_theme == "glass")
	_set_card_state(card_metal, btn_metal, active_theme == "metal")
	_set_card_state(card_cyber, btn_cyber, active_theme == "cyber")

func _set_card_state(card: PanelContainer, btn: Button, is_active: bool) -> void:
	if card == null or btn == null:
		return

	var st = card.get_theme_stylebox("panel") as StyleBoxFlat
	if st != null:
		if is_active:
			st.bg_color = Color(0.22, 0.2, 0.17, 0.98)
			st.border_color = Color(0.96, 0.69, 0.25, 1.0)
			st.border_width_left = 2
			st.border_width_top = 2
			st.border_width_right = 2
			st.border_width_bottom = 2
			st.shadow_size = 4
			st.shadow_color = Color(0.96, 0.69, 0.25, 0.3)
		else:
			st.bg_color = Color(0.16, 0.15, 0.14, 0.9)
			st.border_color = Color(0.35, 0.32, 0.28, 0.7)
			st.border_width_left = 1
			st.border_width_top = 1
			st.border_width_right = 1
			st.border_width_bottom = 1
			st.shadow_size = 0

	if is_active:
		btn.text = "Active"
		btn.disabled = true
		btn.modulate = Color(1.0, 0.9, 0.6, 1.0)
	else:
		btn.text = "Select"
		btn.disabled = false
		btn.modulate = Color(1.0, 1.0, 1.0, 1.0)
