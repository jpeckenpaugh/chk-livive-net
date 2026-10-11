extends Node3D

## MainController
## Coordinates 3D Scene components, Camera Gimbal/Pivot, Lighting,
## connects Autoload Bridge signals to BoardView, and wires 2D UI views.

@onready var camera_pivot: Node3D = $CameraPivot
@onready var camera: Camera3D = $CameraPivot/Camera3D
@onready var board: Node3D = $Board

@onready var hud: Control = $UI/HUD
@onready var spectator_bar: Control = $UI/SpectatorBar
@onready var mode_select: Control = $UI/ModeSelect
@onready var preload_staging: Control = $UI/PreloadStaging
@onready var game_over_modal: Control = $UI/GameOverModal

func _ready() -> void:
	# Orient camera to look at the board center with slight forward bias to clear top HUD
	if camera != null:
		camera.look_at(Vector3(0, 0, -0.15), Vector3.UP)

	# Connect Autoload Bridge signals
	if Bridge != null:
		Bridge.board_updated.connect(_on_board_updated)
		Bridge.move_animation_requested.connect(_on_move_animation_requested)
		Bridge.board_flipped.connect(_on_board_flipped)
		Bridge.show_notation_changed.connect(_on_show_notation_changed)

	# Wire UI navigation signals
	if hud != null:
		hud.open_mode_select_requested.connect(_on_open_mode_select)
		hud.reopen_game_over_requested.connect(_on_reopen_game_over)

	if game_over_modal != null:
		game_over_modal.open_mode_select_requested.connect(_on_open_mode_select)
		game_over_modal.review_board_requested.connect(_on_review_board)

	if mode_select != null:
		mode_select.match_launched.connect(_on_match_launched)

	print("[MainController] Checkers 3D scene initialized and ready.")

func _on_open_mode_select() -> void:
	if mode_select != null:
		mode_select.visible = true

func _on_match_launched(_config: Dictionary) -> void:
	if hud != null:
		hud.show_recap_button(false)
	if game_over_modal != null:
		game_over_modal.visible = false

func _on_review_board() -> void:
	if hud != null:
		hud.show_recap_button(true)

func _on_reopen_game_over() -> void:
	if game_over_modal != null and game_over_modal.has_method("reopen"):
		game_over_modal.reopen()

func _on_board_updated(data: Dictionary) -> void:
	if board != null and board.has_method("on_board_updated"):
		board.on_board_updated(data)

func _on_move_animation_requested(data: Dictionary) -> void:
	if board != null and board.has_method("on_move_animation_requested"):
		board.on_move_animation_requested(data)

func _on_board_flipped(flipped: bool) -> void:
	if camera_pivot == null:
		return
	var target_y: float = PI if flipped else 0.0
	var tween: Tween = create_tween()
	tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(camera_pivot, "rotation:y", target_y, 0.6)

func _on_show_notation_changed(show: bool) -> void:
	if board != null and board.has_method("set_show_notation"):
		board.set_show_notation(show)
