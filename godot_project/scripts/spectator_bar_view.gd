extends Control

## spectator_bar_view.gd
## Bottom-docked spectator control bar for AI vs AI match observation.

@onready var btn_play_pause: Button = $Panel/Margin/HBox/BtnPlayPause
@onready var btn_step: Button = $Panel/Margin/HBox/BtnStep
@onready var btn_speed_slow: Button = $Panel/Margin/HBox/BtnSpeedSlow
@onready var btn_speed_normal: Button = $Panel/Margin/HBox/BtnSpeedNormal
@onready var btn_speed_fast: Button = $Panel/Margin/HBox/BtnSpeedFast

var _is_paused: bool = false

func _ready() -> void:
	visible = false

	if Bridge != null:
		Bridge.spectator_mode_changed.connect(_on_spectator_mode_changed)

	if btn_play_pause:
		btn_play_pause.pressed.connect(_on_play_pause_pressed)
	if btn_step:
		btn_step.pressed.connect(_on_step_pressed)
	if btn_speed_slow:
		btn_speed_slow.pressed.connect(func(): _set_speed(2500, btn_speed_slow))
	if btn_speed_normal:
		btn_speed_normal.pressed.connect(func(): _set_speed(1200, btn_speed_normal))
	if btn_speed_fast:
		btn_speed_fast.pressed.connect(func(): _set_speed(500, btn_speed_fast))

	_highlight_speed_button(btn_speed_normal)

func _on_spectator_mode_changed(active: bool, paused: bool) -> void:
	visible = active
	_is_paused = paused
	_update_play_pause_ui()

func _update_play_pause_ui() -> void:
	if btn_play_pause:
		btn_play_pause.text = "Play" if _is_paused else "Pause"

func _on_play_pause_pressed() -> void:
	if _is_paused:
		_is_paused = false
		if Bridge != null:
			Bridge.notify_spectator_action("play")
	else:
		_is_paused = true
		if Bridge != null:
			Bridge.notify_spectator_action("pause")
	_update_play_pause_ui()

func _on_step_pressed() -> void:
	if Bridge != null:
		Bridge.notify_spectator_action("step")

func _set_speed(ms: int, active_btn: Button) -> void:
	if Bridge != null:
		Bridge.notify_spectator_action("speed", ms)
	_highlight_speed_button(active_btn)

func _highlight_speed_button(active_btn: Button) -> void:
	var buttons = [btn_speed_slow, btn_speed_normal, btn_speed_fast]
	for b in buttons:
		if b != null:
			if b == active_btn:
				b.modulate = Color(1.0, 0.9, 0.6, 1.0)
			else:
				b.modulate = Color(0.7, 0.7, 0.7, 1.0)
