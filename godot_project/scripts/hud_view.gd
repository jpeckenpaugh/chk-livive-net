extends Control

## hud_view.gd
## Heads-Up Display: Player Cards, Turn Capsule, Speech Balloons, Avatar Badges, and Control Toolbar.
## Fully integrates with ThemeManager for live theme changes.
## Uses native styled badges for avatars without raw emoji characters.

signal open_mode_select_requested
signal open_theme_modal_requested
signal reopen_game_over_requested

# Red Player Card
@onready var card_red: PanelContainer = $TopBar/PlayerRedCard
@onready var avatar_badge_red: PanelContainer = $TopBar/PlayerRedCard/Margin/HBox/AvatarBadge
@onready var avatar_label_red: Label = $TopBar/PlayerRedCard/Margin/HBox/AvatarBadge/Label
@onready var name_red: Label = $TopBar/PlayerRedCard/Margin/HBox/VBox/Name
@onready var pieces_red: Label = $TopBar/PlayerRedCard/Margin/HBox/VBox/Pieces
@onready var kings_red: Label = $TopBar/PlayerRedCard/Margin/HBox/VBox/Kings

# Black Player Card
@onready var card_black: PanelContainer = $TopBar/PlayerBlackCard
@onready var avatar_badge_black: PanelContainer = $TopBar/PlayerBlackCard/Margin/HBox/AvatarBadge
@onready var avatar_label_black: Label = $TopBar/PlayerBlackCard/Margin/HBox/AvatarBadge/Label
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
@onready var toolbar_panel: PanelContainer = $Toolbar
@onready var btn_flip: Button = $Toolbar/Margin/HBox/BtnFlip
@onready var btn_notation: Button = $Toolbar/Margin/HBox/BtnNotation
@onready var btn_mute: Button = $Toolbar/Margin/HBox/BtnMute
@onready var btn_theme: Button = $Toolbar/Margin/HBox/BtnTheme
@onready var btn_env_mode: Button = $Toolbar/Margin/HBox/BtnEnvMode
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
var _current_turn: int = 1

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

	# Connect theme manager signals
	if ThemeManager != null:
		ThemeManager.theme_changed.connect(_on_theme_changed)
		ThemeManager.environment_mode_changed.connect(_on_env_mode_changed)
		_apply_theme_styling()
		_update_env_mode_button_text(ThemeManager.get_environment_mode())

	# Connect button clicks
	if btn_flip:
		btn_flip.pressed.connect(_on_btn_flip_pressed)
	if btn_notation:
		btn_notation.pressed.connect(_on_btn_notation_pressed)
	if btn_mute:
		btn_mute.pressed.connect(_on_btn_mute_pressed)
	if btn_theme:
		btn_theme.pressed.connect(_on_btn_theme_pressed)
	if btn_env_mode:
		btn_env_mode.pressed.connect(_on_btn_env_mode_pressed)
	if btn_reset:
		btn_reset.pressed.connect(_on_btn_reset_pressed)
	if btn_menu:
		btn_menu.pressed.connect(_on_btn_menu_pressed)
	if btn_recap:
		btn_recap.pressed.connect(_on_btn_recap_pressed)

func _exit_tree() -> void:
	if ThemeManager != null and ThemeManager.theme_changed.is_connected(_on_theme_changed):
		ThemeManager.theme_changed.disconnect(_on_theme_changed)

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

func _on_theme_changed(_theme_id: String) -> void:
	_apply_theme_styling()

func _apply_theme_styling() -> void:
	if ThemeManager == null:
		return
	var styling: Dictionary = ThemeManager.get_hud_styling()
	var card_bg: Color = styling.get("card_bg", Color(0.14, 0.12, 0.11, 0.92))
	var capsule_bg: Color = styling.get("capsule_bg", Color(0.12, 0.1, 0.09, 0.94))
	var active_border: Color = styling.get("active_border", Color(0.96, 0.69, 0.25, 1.0))
	var border_red: Color = styling.get("border_red", Color(0.85, 0.25, 0.2, 0.75))
	var border_black: Color = styling.get("border_black", Color(0.4, 0.4, 0.45, 0.75))

	if card_red:
		var st_red = card_red.get_theme_stylebox("panel") as StyleBoxFlat
		if st_red != null:
			st_red.bg_color = card_bg
			if _current_turn == 1:
				st_red.border_color = active_border
			else:
				st_red.border_color = border_red

	if card_black:
		var st_black = card_black.get_theme_stylebox("panel") as StyleBoxFlat
		if st_black != null:
			st_black.bg_color = card_bg
			if _current_turn == -1:
				st_black.border_color = active_border
			else:
				st_black.border_color = border_black

	if turn_capsule:
		var st_capsule = turn_capsule.get_theme_stylebox("panel") as StyleBoxFlat
		if st_capsule != null:
			st_capsule.bg_color = capsule_bg
			st_capsule.border_color = styling.get("accent", Color(0.96, 0.69, 0.25))

	if toolbar_panel:
		var st_bar = toolbar_panel.get_theme_stylebox("panel") as StyleBoxFlat
		if st_bar != null:
			st_bar.bg_color = capsule_bg
			st_bar.border_color = styling.get("accent", Color(0.96, 0.69, 0.25))

	# Update turn dot color with active theme colors
	if turn_dot:
		if _current_turn == 1:
			turn_dot.color = styling.get("turn_red", Color(0.91, 0.3, 0.24))
		else:
			turn_dot.color = styling.get("turn_black", Color(0.18, 0.18, 0.22))

func _on_board_updated(data: Dictionary) -> void:
	var board: Array = data.get("board", [])
	var turn: int = data.get("turn", 1)
	_current_turn = turn
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
		kings_red.text = "Kings: %d" % r_kings
	if pieces_black:
		pieces_black.text = "%d pieces" % b_pieces
	if kings_black:
		kings_black.text = "Kings: %d" % b_kings

	# Update active player highlight
	_set_card_active(card_red, turn == 1, true)
	_set_card_active(card_black, turn == -1, false)

	# Update Turn Indicator Capsule
	if turn_label:
		var styling: Dictionary = ThemeManager.get_hud_styling() if ThemeManager != null else {}
		if winner != null:
			turn_label.text = "Game Over"
			if turn_dot:
				turn_dot.color = styling.get("accent", Color(0.96, 0.69, 0.25))
		elif turn == 1:
			turn_label.text = "Red's Turn"
			if turn_dot:
				turn_dot.color = styling.get("turn_red", Color(0.91, 0.3, 0.24))
		else:
			turn_label.text = "Black's Turn"
			if turn_dot:
				turn_dot.color = styling.get("turn_black", Color(0.18, 0.18, 0.22))

	# Mandatory Jump Alert Banner
	if jump_alert:
		jump_alert.visible = (must_jump and winner == null)

	# Hide recap button when ongoing match has no winner
	if winner == null and btn_recap:
		btn_recap.visible = false

func _set_card_active(card: PanelContainer, is_active: bool, is_red: bool) -> void:
	if card == null:
		return
	var style: StyleBoxFlat = card.get_theme_stylebox("panel") as StyleBoxFlat
	if style != null:
		var styling: Dictionary = ThemeManager.get_hud_styling() if ThemeManager != null else {}
		var active_border: Color = styling.get("active_border", Color(0.96, 0.69, 0.25, 1.0))
		var default_border: Color = styling.get("border_red" if is_red else "border_black", Color(0.4, 0.4, 0.45, 0.75))

		if is_active:
			style.border_color = active_border
			style.border_width_left = 2
			style.border_width_top = 2
			style.border_width_right = 2
			style.border_width_bottom = 2
			style.shadow_size = 8
			style.shadow_color = Color(active_border.r, active_border.g, active_border.b, 0.35)
		else:
			style.border_color = default_border
			style.border_width_left = 1
			style.border_width_top = 1
			style.border_width_right = 1
			style.border_width_bottom = 1
			style.shadow_size = 0

## Strips all raw unicode emojis and missing-glyph symbols to ensure clean text rendering
func _clean_display_text(raw_text: String) -> String:
	var cleaned: String = raw_text
	for emoji in ["(🧐)", "(🏴‍☠️)", "(🤖)", "(⚡)", "(👵)", "(⚙️)", "(🔴)", "(⚫)"]:
		cleaned = cleaned.replace(emoji, "")

	var result: String = ""
	for i in range(cleaned.length()):
		var c: String = cleaned[i]
		var code: int = c.unicode_at(0)
		# Allow printable ASCII (32 to 126) and newline (10)
		if (code >= 32 and code <= 126) or code == 10:
			result += c
		elif code == 8217 or code == 8216:
			result += "'"
		elif code == 8220 or code == 8221:
			result += '"'
		elif code == 8211 or code == 8212:
			result += "-"

	return result.strip_edges()

func _on_player_info_updated(color: int, info: Dictionary) -> void:
	var raw_name: String = info.get("name", "")
	var raw_avatar: String = info.get("avatar", "")
	var badge_text_payload: String = info.get("badgeText", "")
	var badge_bg_hex: String = info.get("badgeBg", "")
	var badge_border_hex: String = info.get("badgeBorder", "")
	var clean_name: String = _clean_display_text(raw_name)

	var is_red: bool = (color == 1)
	var name_label = name_red if is_red else name_black
	var badge = avatar_badge_red if is_red else avatar_badge_black
	var badge_label = avatar_label_red if is_red else avatar_label_black

	if name_label != null and clean_name != "":
		name_label.text = clean_name

	if badge != null and badge_label != null:
		_configure_avatar_badge(badge, badge_label, raw_name, raw_avatar, is_red, badge_text_payload, badge_bg_hex, badge_border_hex)

func _configure_avatar_badge(badge: PanelContainer, label: Label, pname: String, avatar: String, is_red: bool, badge_text_payload: String = "", badge_bg_hex: String = "", badge_border_hex: String = "") -> void:
	var st = badge.get_theme_stylebox("panel") as StyleBoxFlat
	if st == null:
		st = StyleBoxFlat.new()
		badge.add_theme_stylebox_override("panel", st)

	var badge_text: String = "R" if is_red else "B"
	var bg_color: Color = Color(0.72, 0.15, 0.15) if is_red else Color(0.18, 0.2, 0.24)
	var border_color: Color = Color(1.0, 0.4, 0.35) if is_red else Color(0.7, 0.75, 0.8)
	var is_pill: bool = false

	if badge_text_payload != "":
		badge_text = badge_text_payload
		is_pill = (badge_text.length() > 1)
		if badge_bg_hex != "":
			bg_color = Color.from_string(badge_bg_hex, bg_color)
		if badge_border_hex != "":
			border_color = Color.from_string(badge_border_hex, border_color)
	else:
		# Detect persona from name or raw avatar string fallback
		if avatar.contains("🧐") or pname.containsn("Worthington"):
			badge_text = "LORD"
			bg_color = Color(0.25, 0.15, 0.35)
			border_color = Color(0.8, 0.65, 0.3)
			is_pill = true
		elif avatar.contains("🏴‍☠️") or pname.containsn("Redbeard") or pname.containsn("Pirate"):
			badge_text = "PIRATE"
			bg_color = Color(0.45, 0.12, 0.12)
			border_color = Color(0.9, 0.3, 0.25)
			is_pill = true
		elif avatar.contains("🤖") or pname.containsn("Unit 734") or pname.containsn("Robot"):
			badge_text = "ROBOT"
			bg_color = Color(0.08, 0.25, 0.32)
			border_color = Color(0.0, 0.94, 1.0)
			is_pill = true
		elif avatar.contains("⚡") or pname.containsn("Kenji"):
			badge_text = "KENJI"
			bg_color = Color(0.12, 0.28, 0.45)
			border_color = Color(0.35, 0.75, 0.95)
			is_pill = true
		elif avatar.contains("👵") or pname.containsn("Granny"):
			badge_text = "GRANNY"
			bg_color = Color(0.45, 0.2, 0.35)
			border_color = Color(0.9, 0.6, 0.7)
			is_pill = true
		elif avatar.contains("⚙") or pname.containsn("Minimax") or pname.containsn("CPU"):
			badge_text = "CPU"
			bg_color = Color(0.18, 0.22, 0.28)
			border_color = Color(0.45, 0.65, 0.85)
			is_pill = true

	label.text = badge_text
	st.bg_color = bg_color
	st.border_color = border_color
	st.border_width_left = 2
	st.border_width_top = 2
	st.border_width_right = 2
	st.border_width_bottom = 2

	if is_pill:
		badge.custom_minimum_size = Vector2(58, 32)
		st.corner_radius_top_left = 8
		st.corner_radius_top_right = 8
		st.corner_radius_bottom_right = 8
		st.corner_radius_bottom_left = 8
		label.add_theme_font_size_override("font_size", 11)
	else:
		badge.custom_minimum_size = Vector2(36, 36)
		st.corner_radius_top_left = 18
		st.corner_radius_top_right = 18
		st.corner_radius_bottom_right = 18
		st.corner_radius_bottom_left = 18
		label.add_theme_font_size_override("font_size", 15)

func _on_banter_streamed(color: int, text: String) -> void:
	var clean_text = _clean_display_text(text)
	if clean_text.strip_edges() == "":
		if color == 1 and bubble_red:
			_fade_out_bubble(bubble_red)
		elif color == -1 and bubble_black:
			_fade_out_bubble(bubble_black)
		return

	if color == 1 and bubble_red and bubble_red_label:
		bubble_red_label.text = clean_text
		_show_bubble(bubble_red)
		_red_bubble_timer = 4.0
	elif color == -1 and bubble_black and bubble_black_label:
		bubble_black_label.text = clean_text
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
		btn_mute.text = "Muted" if _is_muted else "Sound"
	if Bridge != null:
		Bridge.notify_muted(_is_muted)

func _on_btn_theme_pressed() -> void:
	open_theme_modal_requested.emit()

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

func _on_btn_env_mode_pressed() -> void:
	if ThemeManager != null:
		ThemeManager.toggle_environment_mode()

func _on_env_mode_changed(mode: String) -> void:
	_update_env_mode_button_text(mode)

func _update_env_mode_button_text(mode: String) -> void:
	if btn_env_mode != null:
		btn_env_mode.text = "Dark" if mode == "dark" else "Light"
