extends Node3D

## PieceView
## 3D visual representation of an authentic tournament Checkers piece (Red or Black, Man or King).
## Upgraded geometry with beveled outer body, concentric annular ridge, recessed finger dish, and accent ring.
## Supports dynamic live Theme switching (Wood, Marble, Glass, Metal, Cyber).
## Manages materials, crown visibility, and procedural animations (slide, parabolic jump, dissipation, crowning).

@export var square_index: int = -1
@export var piece_color: int = 1 # 1 = Red, -1 = Black
@export var is_king: bool = false

@onready var body_mesh: MeshInstance3D = $BodyMesh
@onready var bottom_rim_mesh: MeshInstance3D = $BottomRimMesh
@onready var annular_ridge: MeshInstance3D = $AnnularRidge
@onready var center_dish: MeshInstance3D = $CenterDish
@onready var accent_ring: MeshInstance3D = $AccentRing
@onready var crown_mesh: MeshInstance3D = $CrownMesh
@onready var area3d: Area3D = $Area3D

func _ready() -> void:
	if ThemeManager != null and not ThemeManager.theme_changed.is_connected(_on_theme_changed):
		ThemeManager.theme_changed.connect(_on_theme_changed)

	_apply_visuals()
	if area3d != null:
		area3d.input_event.connect(_on_area_input_event)

func _exit_tree() -> void:
	if ThemeManager != null and ThemeManager.theme_changed.is_connected(_on_theme_changed):
		ThemeManager.theme_changed.disconnect(_on_theme_changed)

func _on_theme_changed(_theme_id: String) -> void:
	_apply_visuals()

func _on_area_input_event(_camera: Node, event: InputEvent, _position: Vector3, _normal: Vector3, _shape_idx: int) -> void:
	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event
		if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			if square_index >= 0 and Bridge != null:
				Bridge.notify_square_clicked(square_index)
	elif event is InputEventScreenTouch:
		var st: InputEventScreenTouch = event
		if st.pressed:
			if square_index >= 0 and Bridge != null:
				Bridge.notify_square_clicked(square_index)

func setup(color: int, king: bool, initial_index: int, world_pos: Vector3) -> void:
	piece_color = 1 if color > 0 else -1
	is_king = king
	square_index = initial_index
	position = world_pos
	_apply_visuals()

func set_king(king: bool) -> void:
	is_king = king
	if crown_mesh != null:
		crown_mesh.visible = is_king

func _apply_visuals() -> void:
	var mats: Dictionary = {}
	if ThemeManager != null:
		mats = ThemeManager.get_piece_materials(piece_color)

	var mat_body = mats.get("body", null)
	var mat_accent = mats.get("accent", null)
	var mat_crown = mats.get("crown", null)

	# Fallback materials if ThemeManager is missing
	if mat_body == null:
		var def_body = StandardMaterial3D.new()
		def_body.albedo_color = Color(0.72, 0.11, 0.11) if piece_color > 0 else Color(0.12, 0.12, 0.12)
		def_body.roughness = 0.25
		def_body.metallic = 0.1
		mat_body = def_body

	if mat_accent == null:
		mat_accent = mat_body

	if mat_crown == null:
		var def_crown = StandardMaterial3D.new()
		def_crown.albedo_color = Color(0.95, 0.75, 0.25)
		def_crown.metallic = 0.8
		def_crown.roughness = 0.25
		mat_crown = def_crown

	# Apply body material to all main checker body surfaces
	if body_mesh != null:
		body_mesh.set_surface_override_material(0, mat_body)
	if bottom_rim_mesh != null:
		bottom_rim_mesh.set_surface_override_material(0, mat_body)
	if annular_ridge != null:
		annular_ridge.set_surface_override_material(0, mat_body)
	if center_dish != null:
		center_dish.set_surface_override_material(0, mat_body)

	# Apply accent material to top ring detail (e.g. glowing neon ring in Cyber)
	if accent_ring != null:
		accent_ring.set_surface_override_material(0, mat_accent)

	# Apply crown material and visibility
	if crown_mesh != null:
		crown_mesh.set_surface_override_material(0, mat_crown)
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
