extends Node3D

## MainController
## Coordinates 3D Scene components, Camera Gimbal/Pivot, Lighting,
## and connects Autoload Bridge signals to BoardView.

@onready var camera_pivot: Node3D = $CameraPivot
@onready var camera: Camera3D = $CameraPivot/Camera3D
@onready var board: Node3D = $Board

func _ready() -> void:
	# Orient camera to look directly at center of board
	if camera != null:
		camera.look_at(Vector3.ZERO, Vector3.UP)

	# Connect Autoload Bridge signals
	if Bridge != null:
		Bridge.board_updated.connect(_on_board_updated)
		Bridge.move_animation_requested.connect(_on_move_animation_requested)
		Bridge.board_flipped.connect(_on_board_flipped)
		Bridge.show_notation_changed.connect(_on_show_notation_changed)

	print("[MainController] Checkers 3D scene initialized and ready.")

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
