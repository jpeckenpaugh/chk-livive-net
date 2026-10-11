extends Node3D

## MainController
## Coordinates 3D Scene components, Camera Gimbal/Pivot, Lighting,
## connects Autoload Bridge signals to BoardView, and wires 2D UI views.

@onready var camera_pivot: Node3D = $CameraPivot
@onready var camera: Camera3D = $CameraPivot/Camera3D
@onready var board: Node3D = $Board
@onready var pedestal: MeshInstance3D = $BoardPedestal
@onready var dir_light: DirectionalLight3D = $DirectionalLight3D
@onready var rim_light: DirectionalLight3D = $RimLight3D
@onready var studio_floor: MeshInstance3D = $StudioFloor
@onready var world_env: WorldEnvironment = $WorldEnvironment

@onready var hud: Control = $UI/HUD
@onready var spectator_bar: Control = $UI/SpectatorBar
@onready var mode_select: Control = $UI/ModeSelect
@onready var preload_staging: Control = $UI/PreloadStaging
@onready var game_over_modal: Control = $UI/GameOverModal
@onready var theme_modal: Control = $UI/ThemeModal

var _flip_tween: Tween

func _ready() -> void:
	# Orient camera to look at the board center with slight forward bias to clear top HUD
	if camera != null:
		camera.look_at(Vector3(0, 0, -0.15), Vector3.UP)

	# Ensure initial directional light orientation and position for subtle-to-medium specular sheen
	if dir_light != null:
		dir_light.rotation = Vector3(deg_to_rad(-50.0), deg_to_rad(30.0), 0.0)
		dir_light.position = Vector3(-3.5, 12.0, -5.0)

	if ThemeManager != null:
		ThemeManager.theme_changed.connect(_on_theme_changed)
		ThemeManager.environment_mode_changed.connect(_on_env_mode_changed)
		_apply_pedestal_material()
		_apply_environment_mode(ThemeManager.get_environment_mode(), false)

	# Connect Autoload Bridge signals
	if Bridge != null:
		Bridge.board_updated.connect(_on_board_updated)
		Bridge.move_animation_requested.connect(_on_move_animation_requested)
		Bridge.board_flipped.connect(_on_board_flipped)
		Bridge.show_notation_changed.connect(_on_show_notation_changed)

	# Wire UI navigation signals
	if hud != null:
		hud.open_mode_select_requested.connect(_on_open_mode_select)
		hud.open_theme_modal_requested.connect(_on_open_theme_modal)
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

func _on_open_theme_modal() -> void:
	if theme_modal != null and theme_modal.has_method("open"):
		theme_modal.open()
	elif theme_modal != null:
		theme_modal.visible = true

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
	if _flip_tween != null and _flip_tween.is_valid():
		_flip_tween.kill()

	var target_cam_y: float = PI if flipped else 0.0
	var target_light_y: float = deg_to_rad(210.0) if flipped else deg_to_rad(30.0)
	var target_light_pos: Vector3 = Vector3(3.5, 12.0, 5.0) if flipped else Vector3(-3.5, 12.0, -5.0)
	var target_rim_y: float = deg_to_rad(30.0) if flipped else deg_to_rad(210.0)

	_flip_tween = create_tween()
	_flip_tween.set_parallel(true)
	_flip_tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	if camera_pivot != null:
		_flip_tween.tween_property(camera_pivot, "rotation:y", target_cam_y, 0.6)
	if dir_light != null:
		_flip_tween.tween_property(dir_light, "rotation:y", target_light_y, 0.6)
		_flip_tween.tween_property(dir_light, "position", target_light_pos, 0.6)
	if rim_light != null:
		_flip_tween.tween_property(rim_light, "rotation:y", target_rim_y, 0.6)

func _on_show_notation_changed(show: bool) -> void:
	if board != null and board.has_method("set_show_notation"):
		board.set_show_notation(show)

func _on_theme_changed(_theme_id: String) -> void:
	_apply_pedestal_material()

func _on_env_mode_changed(mode: String) -> void:
	_apply_environment_mode(mode, true)

func _apply_environment_mode(mode: String, animate: bool = true) -> void:
	var is_light: bool = (mode == "light")

	var target_ambient_col: Color = Color(0.92, 0.94, 0.98) if is_light else Color(0.65, 0.6, 0.55)
	var target_ambient_nrg: float = 1.25 if is_light else 1.05
	var target_dir_col: Color = Color(0.98, 0.98, 1.0) if is_light else Color(1.0, 0.96, 0.9)
	var target_dir_nrg: float = 1.25 if is_light else 1.05
	var target_rim_col: Color = Color(1.0, 0.95, 0.9) if is_light else Color(0.65, 0.75, 0.95)
	var target_rim_nrg: float = 0.55 if is_light else 0.45
	var target_floor_col: Color = Color(0.88, 0.88, 0.92) if is_light else Color(0.06, 0.06, 0.08)
	var target_sky_top: Color = Color(0.84, 0.87, 0.92) if is_light else Color(0.18, 0.2, 0.24)
	var target_sky_horiz: Color = Color(0.88, 0.88, 0.92) if is_light else Color(0.1, 0.1, 0.12)
	var target_gnd_bot: Color = Color(0.80, 0.82, 0.86) if is_light else Color(0.06, 0.06, 0.07)

	var sky_mat: ProceduralSkyMaterial = null
	if world_env != null and world_env.environment != null and world_env.environment.sky != null:
		sky_mat = world_env.environment.sky.sky_material as ProceduralSkyMaterial

	if animate:
		var tween: Tween = create_tween()
		tween.set_parallel(true)
		tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)

		if world_env != null and world_env.environment != null:
			tween.tween_property(world_env.environment, "ambient_light_color", target_ambient_col, 0.5)
			tween.tween_property(world_env.environment, "ambient_light_energy", target_ambient_nrg, 0.5)
		if sky_mat != null:
			tween.tween_property(sky_mat, "sky_top_color", target_sky_top, 0.5)
			tween.tween_property(sky_mat, "sky_horizon_color", target_sky_horiz, 0.5)
			tween.tween_property(sky_mat, "ground_bottom_color", target_gnd_bot, 0.5)
			tween.tween_property(sky_mat, "ground_horizon_color", target_sky_horiz, 0.5)
		if dir_light != null:
			tween.tween_property(dir_light, "light_color", target_dir_col, 0.5)
			tween.tween_property(dir_light, "light_energy", target_dir_nrg, 0.5)
		if rim_light != null:
			tween.tween_property(rim_light, "light_color", target_rim_col, 0.5)
			tween.tween_property(rim_light, "light_energy", target_rim_nrg, 0.5)
		if studio_floor != null:
			var mat = studio_floor.get_surface_override_material(0) as StandardMaterial3D
			if mat == null:
				mat = StandardMaterial3D.new()
				studio_floor.set_surface_override_material(0, mat)
			tween.tween_property(mat, "albedo_color", target_floor_col, 0.5)
	else:
		if world_env != null and world_env.environment != null:
			world_env.environment.ambient_light_color = target_ambient_col
			world_env.environment.ambient_light_energy = target_ambient_nrg
		if sky_mat != null:
			sky_mat.sky_top_color = target_sky_top
			sky_mat.sky_horizon_color = target_sky_horiz
			sky_mat.ground_bottom_color = target_gnd_bot
			sky_mat.ground_horizon_color = target_sky_horiz
		if dir_light != null:
			dir_light.light_color = target_dir_col
			dir_light.light_energy = target_dir_nrg
		if rim_light != null:
			rim_light.light_color = target_rim_col
			rim_light.light_energy = target_rim_nrg
		if studio_floor != null:
			var mat = studio_floor.get_surface_override_material(0) as StandardMaterial3D
			if mat == null:
				mat = StandardMaterial3D.new()
				studio_floor.set_surface_override_material(0, mat)
			mat.albedo_color = target_floor_col


func _apply_pedestal_material() -> void:
	if pedestal == null or ThemeManager == null:
		return
	var mats = ThemeManager.get_board_materials()
	var frame_mat = mats.get("frame", null)
	if frame_mat != null:
		pedestal.set_surface_override_material(0, frame_mat)
