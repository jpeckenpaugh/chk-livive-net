extends Control

## game_over_modal_view.gd
## Modal dialog shown at match conclusion displaying outcome, reasons, stats,
## and navigation actions (Play Again, Game Modes, Review Board).

signal open_mode_select_requested
signal review_board_requested

@onready var title_label: Label = $Backdrop/Dialog/Margin/VBox/Title
@onready var reason_badge: Label = $Backdrop/Dialog/Margin/VBox/ReasonBadge/Margin/ReasonText
@onready var stat_turns: Label = $Backdrop/Dialog/Margin/VBox/StatsBox/Grid/StatTurns
@onready var stat_time: Label = $Backdrop/Dialog/Margin/VBox/StatsBox/Grid/StatTime
@onready var stat_red_captures: Label = $Backdrop/Dialog/Margin/VBox/StatsBox/Grid/StatRedCaptures
@onready var stat_black_captures: Label = $Backdrop/Dialog/Margin/VBox/StatsBox/Grid/StatBlackCaptures
@onready var stat_kings: Label = $Backdrop/Dialog/Margin/VBox/StatsBox/Grid/StatKings

@onready var btn_play_again: Button = $Backdrop/Dialog/Margin/VBox/Actions/BtnPlayAgain
@onready var btn_game_modes: Button = $Backdrop/Dialog/Margin/VBox/Actions/BtnGameModes
@onready var btn_review_board: Button = $Backdrop/Dialog/Margin/VBox/Actions/BtnReviewBoard

var _has_shown_for_current_game: bool = false

func _ready() -> void:
	visible = false

	if Bridge != null:
		Bridge.board_updated.connect(_on_board_updated)

	if btn_play_again:
		btn_play_again.pressed.connect(_on_play_again_pressed)
	if btn_game_modes:
		btn_game_modes.pressed.connect(_on_game_modes_pressed)
	if btn_review_board:
		btn_review_board.pressed.connect(_on_review_board_pressed)

func _on_board_updated(data: Dictionary) -> void:
	var winner = data.get("winner", null)
	if winner == null:
		_has_shown_for_current_game = false
		visible = false
		return

	if not _has_shown_for_current_game:
		_has_shown_for_current_game = true
		_display_results(winner, data)

func _display_results(winner, data: Dictionary) -> void:
	# Winner title
	var w: int = int(winner)
	if title_label:
		if w == 1:
			title_label.text = "RED WINS!"
			title_label.modulate = Color(0.91, 0.3, 0.24)
		elif w == -1:
			title_label.text = "BLACK WINS!"
			title_label.modulate = Color(0.85, 0.85, 0.9)
		else:
			title_label.text = "MATCH DRAW!"
			title_label.modulate = Color(0.96, 0.69, 0.25)

	# Win reason
	var reason = data.get("winReason", null)
	var reason_text: String = "Opponent eliminated"
	if reason != null and str(reason) != "":
		reason_text = str(reason)
	if reason_badge:
		reason_badge.text = reason_text

	# Stats
	var stats = data.get("stats", null)
	if stats is Dictionary:
		var turns: int = stats.get("turnCount", 0)
		var red_caps: int = stats.get("redCaptures", 0)
		var black_caps: int = stats.get("blackCaptures", 0)
		var r_kings: int = stats.get("redKingsCrowned", 0)
		var b_kings: int = stats.get("blackKingsCrowned", 0)
		var start_time = stats.get("startTime", null)

		if stat_turns:
			stat_turns.text = "%d turns" % turns
		if stat_red_captures:
			stat_red_captures.text = "%d" % red_caps
		if stat_black_captures:
			stat_black_captures.text = "%d" % black_caps
		if stat_kings:
			stat_kings.text = "%d" % (r_kings + b_kings)

		if stat_time:
			if start_time != null and start_time > 0:
				var elapsed_sec: int = int((Time.get_unix_time_from_system() * 1000.0 - float(start_time)) / 1000.0)
				if elapsed_sec < 0 or elapsed_sec > 86400:
					elapsed_sec = turns * 4
				var mins: int = elapsed_sec / 60
				var secs: int = elapsed_sec % 60
				stat_time.text = "%02d:%02d" % [mins, secs]
			else:
				stat_time.text = "--:--"

	visible = true

func _on_play_again_pressed() -> void:
	visible = false
	if Bridge != null:
		Bridge.notify_reset_game()

func _on_game_modes_pressed() -> void:
	visible = false
	open_mode_select_requested.emit()

func _on_review_board_pressed() -> void:
	visible = false
	review_board_requested.emit()

func reopen() -> void:
	visible = true
