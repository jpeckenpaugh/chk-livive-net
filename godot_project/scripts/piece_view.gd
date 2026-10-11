extends Node3D

## PieceView
## 3D visual representation of a Checkers piece (Red or Black, Man or King).
## Manages materials, crown visibility, and procedural animations (slide, parabolic jump, dissipation, crowning).

@export var square_index: int = -1
@export var piece_color: int = 1 # 1 = Red, -1 = Black
@export var is_king: bool = false

# Materials
var mat_red: StandardMaterial3D
var mat_black: StandardMaterial3D
var mat_gold: StandardMaterial3D

@onready var body_mesh: MeshInstance3D = $BodyMesh
@onready var crown_mesh: MeshInstance3D = $CrownMesh

func _ready() -> void:
	_init_materials()
	_apply_visuals()

func _init_materials() -> void:
	if mat_red == null:
		mat_red = StandardMaterial3D.new()
		mat_red.albedo_color = Color(0.72, 0.11, 0.11)
		mat_red.roughness = 0.25
		mat_red.metallic = 0.1

	if mat_black == null:
		mat_black = StandardMaterial3D.new()
		mat_black.albedo_color = Color(0.12, 0.12, 0.12)
		mat_black.roughness = 0.2
		mat_black.metallic = 0.15

	if mat_gold == null:
		mat_gold = StandardMaterial3D.new()
		mat_gold.albedo_color = Color(0.95, 0.75, 0.25)
		mat_gold.metallic = 0.7
		mat_gold.roughness = 0.3

func setup(color: int, king: bool, initial_index: int, world_pos: Vector3) -> void:
	piece_color = 1 if color > 0 else -1
	is_king = king
	square_index = initial_index
	position = world_pos
	_init_materials()
	_apply_visuals()

func set_king(king: bool) -> void:
	is_king = king
	if crown_mesh != null:
		crown_mesh.visible = is_king

func _apply_visuals() -> void:
	if body_mesh != null:
		var target_mat = mat_red if piece_color > 0 else mat_black
		body_mesh.set_surface_override_material(0, target_mat)
	if crown_mesh != null:
		crown_mesh.set_surface_override_material(0, mat_gold)
		crown_mesh.visible = is_king

## Animate smooth slide to target_pos (snappy 0.25s default)
func animate_slide_to(target_pos: Vector3, duration: float = 0.25) -> Tween:
	var tween: Tween = create_tween()
	tween.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "position", target_pos, duration)
	return tween

## Animate parabolic jump arc to target_pos (snappy 0.32s, 0.55 peak height default)
func animate_jump_to(target_pos: Vector3, duration: float = 0.32, peak_height: float = 0.55) -> Tween:
	var start_pos: Vector3 = position
	var tween: Tween = create_tween()
	tween.tween_method(func(t: float):
		var x: float = lerp(start_pos.x, target_pos.x, t)
		var z: float = lerp(start_pos.z, target_pos.z, t)
		var arc_y: float = 4.0 * t * (1.0 - t) * peak_height
		var y: float = lerp(start_pos.y, target_pos.y, t) + arc_y
		position = Vector3(x, y, z)
	, 0.0, 1.0, duration)
	return tween

## Animate capture dissipation: slight rise, scale to 0, then queue_free
func animate_capture_dissipation() -> Tween:
	var tween: Tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(self, "position:y", position.y + 0.35, 0.28).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "scale", Vector3.ZERO, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(queue_free)
	return tween

## Animate crowning: crown scale pop and spin
func animate_crowning() -> Tween:
	set_king(true)
	if crown_mesh == null:
		var dummy_tween: Tween = create_tween()
		return dummy_tween
	crown_mesh.visible = true
	crown_mesh.scale = Vector3.ZERO
	crown_mesh.rotation = Vector3.ZERO
	var tween: Tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(crown_mesh, "scale", Vector3(1.25, 1.25, 1.25), 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(crown_mesh, "rotation:y", TAU, 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.chain().tween_property(crown_mesh, "scale", Vector3.ONE, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	return tween
