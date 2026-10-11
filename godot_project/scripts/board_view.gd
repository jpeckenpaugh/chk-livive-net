extends Node3D

## BoardView
## 3D Checkers Board representation:
## - 8x8 squares (32 light squares, 32 dark squares) with dynamic theme materials
## - Outer perimeter bezel and base plate
## - Area3D raycast click handlers on dark squares
## - 1..32 Draughts notation labels with toggle
## - Square highlight indicators (Selected, Legal Moves, Prey Targets, Last Move, Selectable)
## - Piece management, syncing, and move animations
## - Live ThemeManager integration (Wood, Marble, Glass, Metal, Cyber)

const PieceScene = preload("res://scenes/piece.tscn")

@onready var squares_container: Node3D = $Squares
@onready var pieces_container: Node3D = $Pieces
@onready var base_plate: MeshInstance3D = $BasePlate
@onready var rail_north: MeshInstance3D = $RailNorth
@onready var rail_south: MeshInstance3D = $RailSouth
@onready var rail_west: MeshInstance3D = $RailWest
@onready var rail_east: MeshInstance3D = $RailEast

var _pieces: Dictionary = {} # square_index (int) -> PieceView
var _dark_squares: Array[Dictionary] = [] # 32 items: { "area": Area3D, "mesh": MeshInstance3D, "highlight": MeshInstance3D, "label": Label3D }
var _light_squares: Array[MeshInstance3D] = [] # 32 light square meshes
var _show_notation: bool = false

# Materials
var mat_light_sq: StandardMaterial3D
var mat_dark_sq: StandardMaterial3D
var mat_hl_selected: StandardMaterial3D
var mat_hl_legal: StandardMaterial3D
var mat_hl_prey: StandardMaterial3D
var mat_hl_last_move: StandardMaterial3D
var mat_hl_selectable: StandardMaterial3D

func _ready() -> void:
	_init_materials()
	_build_board()
	if ThemeManager != null:
		ThemeManager.theme_changed.connect(_on_theme_changed)
		_apply_theme_materials()

func _exit_tree() -> void:
	if ThemeManager != null and ThemeManager.theme_changed.is_connected(_on_theme_changed):
		ThemeManager.theme_changed.disconnect(_on_theme_changed)

func _on_theme_changed(_theme_id: String) -> void:
	_apply_theme_materials()

func _init_materials() -> void:
	# Default Light squares: cream lacquer
	mat_light_sq = StandardMaterial3D.new()
	mat_light_sq.albedo_color = Color(0.88, 0.82, 0.72)
	mat_light_sq.roughness = 0.25
	mat_light_sq.metallic = 0.05

	# Default Dark squares: walnut lacquer
	mat_dark_sq = StandardMaterial3D.new()
	mat_dark_sq.albedo_color = Color(0.18, 0.12, 0.08)
	mat_dark_sq.roughness = 0.25
	mat_dark_sq.metallic = 0.05

	# Selected square: gold / amber (#f5b041)
	mat_hl_selected = StandardMaterial3D.new()
	mat_hl_selected.albedo_color = Color(0.96, 0.69, 0.25, 0.8)
	mat_hl_selected.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_hl_selected.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	# Legal move destination: emerald green (#2ecc71)
	mat_hl_legal = StandardMaterial3D.new()
	mat_hl_legal.albedo_color = Color(0.18, 0.8, 0.44, 0.8)
	mat_hl_legal.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_hl_legal.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	# Prey target: crimson (#e74c3c)
	mat_hl_prey = StandardMaterial3D.new()
	mat_hl_prey.albedo_color = Color(0.91, 0.3, 0.24, 0.85)
	mat_hl_prey.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_hl_prey.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	# Last move square: subtle cyan / sky (#3498db)
	mat_hl_last_move = StandardMaterial3D.new()
	mat_hl_last_move.albedo_color = Color(0.2, 0.6, 0.85, 0.5)
	mat_hl_last_move.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_hl_last_move.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	# Selectable piece hint: subtle warm amber
	mat_hl_selectable = StandardMaterial3D.new()
	mat_hl_selectable.albedo_color = Color(0.96, 0.75, 0.35, 0.3)
	mat_hl_selectable.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_hl_selectable.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

func _apply_theme_materials() -> void:
	if ThemeManager == null:
		return
	var mats: Dictionary = ThemeManager.get_board_materials()
	var l_mat = mats.get("light", null)
	var d_mat = mats.get("dark", null)
	var f_mat = mats.get("frame", null)

	if l_mat != null:
		mat_light_sq = l_mat
		for l_mesh in _light_squares:
			if l_mesh != null:
				l_mesh.set_surface_override_material(0, l_mat)

	if d_mat != null:
		mat_dark_sq = d_mat
		for sq in _dark_squares:
			if sq.has("mesh") and sq["mesh"] != null:
				sq["mesh"].set_surface_override_material(0, d_mat)

	if f_mat != null:
		if base_plate != null: base_plate.set_surface_override_material(0, f_mat)
		if rail_north != null: rail_north.set_surface_override_material(0, f_mat)
		if rail_south != null: rail_south.set_surface_override_material(0, f_mat)
		if rail_west != null: rail_west.set_surface_override_material(0, f_mat)
		if rail_east != null: rail_east.set_surface_override_material(0, f_mat)

func _build_board() -> void:
	_dark_squares.resize(32)
	_light_squares.clear()

	# Shared meshes
	var box_mesh: BoxMesh = BoxMesh.new()
	box_mesh.size = Vector3(0.98, 0.1, 0.98)

	var hl_mesh: BoxMesh = BoxMesh.new()
	hl_mesh.size = Vector3(0.94, 0.004, 0.94)

	var shape: BoxShape3D = BoxShape3D.new()
	shape.size = Vector3(0.98, 0.1, 0.98)

	for row in range(8):
		for col in range(8):
			var pos_x: float = (float(col) - 3.5) * 1.0
			var pos_z: float = (float(row) - 3.5) * 1.0
			var is_dark: bool = ((row + col) % 2 == 1)

			if is_dark:
				var sq_index: int = row * 4 + (col / 2)

				# Dark Square Area3D for clicks
				var area: Area3D = Area3D.new()
				area.name = "DarkSquare_" + str(sq_index)
				area.position = Vector3(pos_x, 0.0, pos_z)
				area.input_ray_pickable = true

				var col_shape: CollisionShape3D = CollisionShape3D.new()
				col_shape.shape = shape
				area.add_child(col_shape)

				# Mesh
				var mesh_inst: MeshInstance3D = MeshInstance3D.new()
				mesh_inst.mesh = box_mesh
				mesh_inst.position = Vector3(0.0, -0.05, 0.0)
				mesh_inst.set_surface_override_material(0, mat_dark_sq)
				area.add_child(mesh_inst)

				# Highlight Overlay
				var hl_inst: MeshInstance3D = MeshInstance3D.new()
				hl_inst.name = "Highlight"
				hl_inst.mesh = hl_mesh
				hl_inst.position = Vector3(0.0, 0.002, 0.0)
				hl_inst.visible = false
				area.add_child(hl_inst)

				# 1..32 Notation Label
				var label: Label3D = Label3D.new()
				label.name = "NotationLabel"
				label.text = str(sq_index + 1)
				label.position = Vector3(0.32, 0.005, 0.32)
				label.rotation_degrees = Vector3(-90, 0, 0)
				label.font_size = 28
				label.modulate = Color(0.9, 0.85, 0.75, 0.65)
				label.outline_size = 4
				label.outline_modulate = Color(0, 0, 0, 0.7)
				label.visible = _show_notation
				area.add_child(label)

				# Connect input event
				area.input_event.connect(_on_square_input_event.bind(sq_index))

				squares_container.add_child(area)
				_dark_squares[sq_index] = {
					"area": area,
					"mesh": mesh_inst,
					"highlight": hl_inst,
					"label": label
				}
			else:
				# Light Square Mesh
				var light_mesh: MeshInstance3D = MeshInstance3D.new()
				light_mesh.name = "LightSquare_" + str(row) + "_" + str(col)
				light_mesh.mesh = box_mesh
				light_mesh.position = Vector3(pos_x, -0.05, pos_z)
				light_mesh.set_surface_override_material(0, mat_light_sq)
				squares_container.add_child(light_mesh)
				_light_squares.append(light_mesh)

func index_to_coord(index: int) -> Vector2i:
	var row: int = index / 4
	var col: int = (index % 4) * 2 + 1 if (row % 2 == 0) else (index % 4) * 2
	return Vector2i(col, row)

func index_to_world_pos(index: int) -> Vector3:
	var c: Vector2i = index_to_coord(index)
	return Vector3((float(c.x) - 3.5) * 1.0, 0.0, (float(c.y) - 3.5) * 1.0)

func _on_square_input_event(_camera: Node, event: InputEvent, _position: Vector3, _normal: Vector3, _shape_idx: int, square_index: int) -> void:
	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event
		if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			Bridge.notify_square_clicked(square_index)
	elif event is InputEventScreenTouch:
		var st: InputEventScreenTouch = event
		if st.pressed:
			Bridge.notify_square_clicked(square_index)

func set_show_notation(show: bool) -> void:
	_show_notation = show
	for sq in _dark_squares:
		if sq.has("label") and sq["label"] != null:
			sq["label"].visible = show

## Update highlights based on render payload
func update_highlights(render_data: Dictionary) -> void:
	var selected_sq = render_data.get("selectedSquare", null)
	var legal_moves = render_data.get("legalMovesForSelected", [])
	var prey_indices = render_data.get("preyIndices", [])
	var last_move = render_data.get("lastMove", null)
	var selectable = render_data.get("selectableIndices", [])

	var legal_to_indices: Array[int] = []
	for move in legal_moves:
		if move is Dictionary and move.has("to"):
			legal_to_indices.append(int(move["to"]))
		elif move is int:
			legal_to_indices.append(int(move))

	var last_move_indices: Array[int] = []
	if last_move is Dictionary:
		if last_move.has("from") and last_move["from"] != null:
			last_move_indices.append(int(last_move["from"]))
		if last_move.has("to") and last_move["to"] != null:
			last_move_indices.append(int(last_move["to"]))

	for i in range(32):
		var sq = _dark_squares[i]
		if not sq.has("highlight") or sq["highlight"] == null:
			continue
		var hl: MeshInstance3D = sq["highlight"]

		if selected_sq != null and int(selected_sq) == i:
			hl.set_surface_override_material(0, mat_hl_selected)
			hl.visible = true
		elif i in prey_indices:
			hl.set_surface_override_material(0, mat_hl_prey)
			hl.visible = true
		elif i in legal_to_indices:
			hl.set_surface_override_material(0, mat_hl_legal)
			hl.visible = true
		elif i in last_move_indices:
			hl.set_surface_override_material(0, mat_hl_last_move)
			hl.visible = true
		elif selected_sq == null and i in selectable:
			hl.set_surface_override_material(0, mat_hl_selectable)
			hl.visible = true
		else:
			hl.visible = false

## Synchronize 32-element board state array with active 3D pieces
func sync_board_state(board_array: Array) -> void:
	if board_array.size() < 32:
		return

	for i in range(32):
		var val: int = int(board_array[i])
		if val == 0:
			if _pieces.has(i):
				var p = _pieces[i]
				_pieces.erase(i)
				p.queue_free()
		else:
			var color: int = 1 if val > 0 else -1
			var is_king: bool = abs(val) == 2
			if _pieces.has(i):
				var p = _pieces[i]
				if p.piece_color != color:
					p.queue_free()
					var new_p = _spawn_piece(color, is_king, i)
					_pieces[i] = new_p
				else:
					p.set_king(is_king)
					p.position = index_to_world_pos(i)
			else:
				var new_p = _spawn_piece(color, is_king, i)
				_pieces[i] = new_p

func _spawn_piece(color: int, is_king: bool, index: int) -> Node3D:
	var piece = PieceScene.instantiate()
	pieces_container.add_child(piece)
	var world_pos: Vector3 = index_to_world_pos(index)
	piece.setup(color, is_king, index, world_pos)
	return piece

## Execute piece move animation (slide or parabolic jump), dissipation, and crowning
func execute_move_animation(move_data: Dictionary) -> void:
	var from_idx: int = int(move_data.get("from", -1))
	var to_idx: int = int(move_data.get("to", -1))
	var is_jump: bool = bool(move_data.get("isJump", false))
	var captured = move_data.get("captured", null)

	var piece = _pieces.get(from_idx, null)
	if piece == null:
		Bridge.notify_animation_complete()
		return

	_pieces.erase(from_idx)
	if _pieces.has(to_idx) and _pieces[to_idx] != piece:
		_pieces[to_idx].queue_free()
	_pieces[to_idx] = piece
	piece.square_index = to_idx

	var target_pos: Vector3 = index_to_world_pos(to_idx)

	# Concurrent capture dissipation
	if captured != null:
		var cap_idx: int = int(captured)
		if _pieces.has(cap_idx):
			var cap_piece = _pieces[cap_idx]
			_pieces.erase(cap_idx)
			cap_piece.animate_capture_dissipation()

	# Check if move crowns the piece
	var should_crown: bool = false
	if not piece.is_king:
		if piece.piece_color == 1 and to_idx <= 3:
			should_crown = true
		elif piece.piece_color == -1 and to_idx >= 28:
			should_crown = true

	# Run slide or parabolic jump
	var tween: Tween
	if is_jump:
		tween = piece.animate_jump_to(target_pos, 0.32, 0.55)
	else:
		tween = piece.animate_slide_to(target_pos, 0.25)

	if should_crown:
		tween.finished.connect(func():
			var crown_tween = piece.animate_crowning()
			crown_tween.finished.connect(func():
				Bridge.notify_animation_complete()
			)
		)
	else:
		tween.finished.connect(func():
			Bridge.notify_animation_complete()
		)

func on_board_updated(data: Dictionary) -> void:
	if data.has("board") and data["board"] is Array:
		sync_board_state(data["board"])
	update_highlights(data)

func on_move_animation_requested(data: Dictionary) -> void:
	execute_move_animation(data)
