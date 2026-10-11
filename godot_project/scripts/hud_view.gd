extends Control

## hud_view.gd
## Heads-Up Display: Player Cards, Turn Capsule, Speech Balloons, and Control Toolbar.

signal open_mode_select_requested
signal reopen_game_over_requested

# Red Player Card
@onready var card_red: PanelContainer = $TopBar/PlayerRedCard
@onready var avatar_red: Label = $TopBar/PlayerRedCard/Margin/HBox/Avatar
@onready var name_red: Label = $TopBar/PlayerRedCard/Margin/HBox/VBox/Name
@onready var pieces_red: Label = $TopBar/PlayerRedCard/Margin/HBox/VBox/Pieces
@onready var kings_red: Label = $TopBar/PlayerRedCard/Margin/HBox/VBox/Kings

# Black Player Card
@onready var card_black: PanelContainer = $TopBar/PlayerBlackCard
@onready var avatar_black: Label = $TopBar/PlayerBlackCard/Margin/HBox/Avatar
@onready var name_black: Label = $TopBar/PlayerBlackCard/Margin/HBox/VBox/Name
@onready var pieces_black: Label = $TopBar/PlayerBlackCard/Margin/HBox/VBox/Pieces
@onready var kings_black: Label = $TopBar/PlayerBlackCard/Margin/HBox/VBox/Kings

# Turn & Alert Indicators
@onready var turn_capsule: PanelContainer = $TopBar/TurnCapsule
@onready var turn_dot: ColorRect = $TopBar/TurnCapsule/Margin/HBox/TurnDot
@onready var turn_label: Label = $TopBar/TurnCapsule/Margin/HBox/TurnLabel
@onready var jump_alert: PanelContainer = $JumpAlert

# Speech Balloons (anchored below player cards)
@onready var bubble_red: PanelContainer = $BanterContainer/SpeechBubbleRed
@onready var bubble_red_label: Label = $BanterContainer/SpeechBubbleRed/Margin/VBox/TextLabel
@onready var bubble_black: PanelContainer = $BanterContainer/SpeechBubbleBlack
@onready var bubble_black_label: Label = $BanterContainer/SpeechBubbleBlack/Margin/VBox/TextLabel

# Toolbar Buttons
@onready var btn_flip: Button = $Toolbar/Margin/HBox/BtnFlip
@onready var btn_notation: Button = $Toolbar/Margin/HBox/BtnNotation
@onready var btn_mute: Button = $Toolbar/Margin/HBox/BtnMute
@onready var btn_reset: Button = $Toolbar/Margin/HBox/BtnReset
@onready var btn_menu: Button = $Toolbar/Margin/HBox/BtnMenu
@onready var btn_recap: Button = $Toolbar/Margin/HBox/BtnRecap

# Local State
var _is_flipped: bool = false
var _show_notation: bool = false
var _is_muted: bool = false
var _pulse_time: float = 0.0

var _red_bubble_timer: float = 0.0
var _black_bubble_timer: float = 0.0

const COLOR_RED_ACCENT: Color = Color(0.91, 0.3, 0.24, 1.0)
const COLOR_BLACK_ACCENT: Color = Color(0.18, 0.18, 0.22, 1.0)
const COLOR_GOLD_ACCENT: Color = Color(0.96, 0.69, 0.25, 1.0)
const COLOR_MUTED_BORDER: Color = Color(0.35, 0.3, 0.26, 0.6)

func _ready() -> void:
	# Hide overlays initially
	if bubble_red:
		bubble_red.modulate.a = 0.0
		bubble_red.visible = false
	if bubble_black:
		bubble_black.modulate.a = 0.0
		bubble_black.visible = false
	if jump_alert:
		jump_alert.visible = false
	if btn_recap:
		btn_recap.visible = false

	# Connect bridge signals
	if Bridge != null:
		Bridge.board_updated.connect(_on_board_updated)
		Bridge.player_info_updated.connect(_on_player_info_updated)
		Bridge.banter_streamed.connect(_on_banter_streamed)
		Bridge.board_flipped.connect(_on_board_flipped)
		Bridge.show_notation_changed.connect(_on_show_notation_changed)

	# Connect button clicks
	if btn_flip:
		btn_flip.pressed.connect(_on_btn_flip_pressed)
	if btn_notation:
		btn_notation.pressed.connect(_on_btn_notation_pressed)
	if btn_mute:
		btn_mute.pressed.connect(_on_btn_mute_pressed)
	if btn_reset:
		btn_reset.pressed.connect(_on_btn_reset_pressed)
	if btn_menu:
		btn_menu.pressed.connect(_on_btn_menu_pressed)
	if btn_recap:
		btn_recap.pressed.connect(_on_btn_recap_pressed)

func _process(delta: float) -> void:
	# Flashing / pulsing animation for Mandatory Jump alert pill
	if jump_alert and jump_alert.visible:
		_pulse_time += delta * 6.0
		var alpha: float = 0.6 + 0.4 * sin(_pulse_time)
		jump_alert.modulate.a = alpha

	# Fadeout timers for speech bubbles
	if _red_bubble_timer > 0.0:
		_red_bubble_timer -= delta
		if _red_bubble_timer <= 0.0 and bubble_red and bubble_red.visible:
			_fade_out_bubble(bubble_red)

	if _black_bubble_timer > 0.0:
		_black_bubble_timer -= delta
		if _black_bubble_timer <= 0.0 and bubble_black and bubble_black.visible:
			_fade_out_bubble(bubble_black)

func _on_board_updated(data: Dictionary) -> void:
	var board: Array = data.get("board", [])
	var turn: int = data.get("turn", 1)
	var must_jump: bool = data.get("mustJump", false)
	var winner = data.get("winner", null)

	# Count pieces and kings on the board
	var r_pieces: int = 0
	var r_kings: int = 0
	var b_pieces: int = 0
	var b_kings: int = 0

	for piece in board:
		var p: int = int(piece)
		if p == 1:
			r_pieces += 1
		elif p == 2:
			r_pieces += 1
			r_kings += 1
		elif p == -1:
			b_pieces += 1
		elif p == -2:
			b_pieces += 1
			b_kings += 1

	if pieces_red:
		pieces_red.text = "%d pieces" % r_pieces
	if kings_red:
		kings_red.text = "👑 %d" % r_kings
	if pieces_black:
		pieces_black.text = "%d pieces" % b_pieces
	if kings_black:
		kings_black.text = "👑 %d" % b_kings

	# Update active player highlight
	_set_card_active(card_red, turn == 1)
	_set_card_active(card_black, turn == -1)

	# Update Turn Indicator Capsule
	if turn_label:
		if winner != null:
			turn_label.text = "Game Over"
			if turn_dot:
				turn_dot.color = COLOR_GOLD_ACCENT
		elif turn == 1:
			turn_label.text = "Red's Turn"
			if turn_dot:
				turn_dot.color = COLOR_RED_ACCENT
		else:
			turn_label.text = "Black's Turn"
			if turn_dot:
				turn_dot.color = Color(0.12, 0.12, 0.15)

	# Mandatory Jump Alert Banner
	if jump_alert:
		jump_alert.visible = (must_jump and winner == null)

	# Hide recap button when ongoing match has no winner
	if winner == null and btn_recap:
		btn_recap.visible = false

func _set_card_active(card: PanelContainer, is_active: bool) -> void:
	if card == null:
		return
	var style: StyleBoxFlat = card.get_theme_stylebox("panel") as StyleBoxFlat
	if style != null:
		if is_active:
			style.border_color = COLOR_GOLD_ACCENT
			style.border_width_left = 2
			style.border_width_top = 2
			style.border_width_right = 2
			style.border_width_bottom = 2
			style.shadow_size = 8
			style.shadow_color = Color(0.96, 0.69, 0.25, 0.35)
		else:
			style.border_color = COLOR_MUTED_BORDER
			style.border_width_left = 1
			style.border_width_top = 1
			style.border_width_right = 1
			style.border_width_bottom = 1
			style.shadow_size = 0

func _on_player_info_updated(color: int, info: Dictionary) -> void:
	var pname: String = info.get("name", "")
	var avatar: String = info.get("avatar", "")

	if color == 1:
		if name_red and pname != "":
			name_red.text = pname
		if avatar_red and avatar != "":
			avatar_red.text = avatar
	elif color == -1:
		if name_black and pname != "":
			name_black.text = pname
		if avatar_black and avatar != "":
			avatar_black.text = avatar

func _on_banter_streamed(color: int, text: String) -> void:
	if text.strip_edges() == "":
		if color == 1 and bubble_red:
			_fade_out_bubble(bubble_red)
		elif color == -1 and bubble_black:
			_fade_out_bubble(bubble_black)
		return

	# Show speech bubble with silent streaming text (Option A)
	if color == 1 and bubble_red and bubble_red_label:
		bubble_red_label.text = text
		_show_bubble(bubble_red)
		_red_bubble_timer = 4.0
	elif color == -1 and bubble_black and bubble_black_label:
		bubble_black_label.text = text
		_show_bubble(bubble_black)
		_black_bubble_timer = 4.0

func _show_bubble(bubble: PanelContainer) -> void:
	bubble.visible = true
	var tween: Tween = create_tween()
	tween.tween_property(bubble, "modulate:a", 1.0, 0.2)

func _fade_out_bubble(bubble: PanelContainer) -> void:
	var tween: Tween = create_tween()
	tween.tween_property(bubble, "modulate:a", 0.0, 0.3)
	tween.tween_callback(func(): bubble.visible = false)

func _on_btn_flip_pressed() -> void:
	_is_flipped = !_is_flipped
	if Bridge != null:
		Bridge.notify_board_flipped(_is_flipped)

func _on_btn_notation_pressed() -> void:
	_show_notation = !_show_notation
	if Bridge != null:
		Bridge.notify_show_notation(_show_notation)

func _on_btn_mute_pressed() -> void:
	_is_muted = !_is_muted
	if btn_mute:
		btn_mute.text = "🔇 Muted" if _is_muted else "🔊 Sound"
	if Bridge != null:
		Bridge.notify_muted(_is_muted)

func _on_btn_reset_pressed() -> void:
	if Bridge != null:
		Bridge.notify_reset_game()

func _on_btn_menu_pressed() -> void:
	open_mode_select_requested.emit()

func _on_btn_recap_pressed() -> void:
	if btn_recap:
		btn_recap.visible = false
	reopen_game_over_requested.emit()

func show_recap_button(show: bool) -> void:
	if btn_recap:
		btn_recap.visible = show

func _on_board_flipped(flipped: bool) -> void:
	_is_flipped = flipped

func _on_show_notation_changed(show: bool) -> void:
	_show_notation = show
