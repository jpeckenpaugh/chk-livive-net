extends Node

## ThemeManager.gd
## Autoload Singleton managing 3D board, piece, and 2D HUD themes.
## Supports 5 distinct visual styles:
## - "wood": Classic Hardwood (Walnut & Maple with lacquer sheen)
## - "marble": Carrara & Nero Marquina (Polished stone, high gloss)
## - "glass": Crystal & Obsidian Glass (Translucent frosted satin & smoky crystal)
## - "metal": Brushed Brass & Gunmetal (Machined metallic finishes)
## - "cyber": Cyber Neon / Tron (Stealth carbon with glowing emissive rings)
## Persists selection to localStorage in Web builds.

signal theme_changed(theme_id: String)

const THEME_IDS: Array[String] = ["wood", "marble", "glass", "metal", "cyber"]

const THEME_DEFS: Dictionary = {
	"wood": {
		"id": "wood",
		"name": "Classic Hardwood",
		"subtitle": "Walnut & Maple with lacquer sheen",
		"swatch_light": Color(0.93, 0.85, 0.72),
		"swatch_dark": Color(0.24, 0.15, 0.08),
		"accent": Color(0.96, 0.69, 0.25)
	},
	"marble": {
		"id": "marble",
		"name": "Carrara Marble",
		"subtitle": "Polished Carrara & Nero Marquina stone",
		"swatch_light": Color(0.95, 0.96, 0.97),
		"swatch_dark": Color(0.08, 0.08, 0.09),
		"accent": Color(0.4, 0.71, 0.96)
	},
	"glass": {
		"id": "glass",
		"name": "Crystal Glass",
		"subtitle": "Frosted satin glass & ruby crystal",
		"swatch_light": Color(0.53, 0.6, 0.66),
		"swatch_dark": Color(0.1, 0.11, 0.14),
		"accent": Color(0.61, 0.53, 1.0)
	},
	"metal": {
		"id": "metal",
		"name": "Brushed Metal",
		"subtitle": "Brushed brass & blued gunmetal steel",
		"swatch_light": Color(0.78, 0.82, 0.85),
		"swatch_dark": Color(0.54, 0.43, 0.21),
		"accent": Color(0.9, 0.49, 0.13)
	},
	"cyber": {
		"id": "cyber",
		"name": "Cyber Neon",
		"subtitle": "Stealth carbon with glowing neon rings",
		"swatch_light": Color(0.07, 0.08, 0.15),
		"swatch_dark": Color(0.05, 0.05, 0.08),
		"accent": Color(0.0, 0.94, 1.0)
	}
}

var _current_theme: String = "wood"
var _materials_cache: Dictionary = {}

func _ready() -> void:
	_init_all_materials()
	var initial_theme = _load_saved_theme()
	set_theme(initial_theme, false)

func get_current_theme() -> String:
	return _current_theme

func get_theme_list() -> Array[Dictionary]:
	var list: Array[Dictionary] = []
	for id in THEME_IDS:
		list.append(THEME_DEFS[id])
	return list

func get_theme_info(theme_id: String) -> Dictionary:
	return THEME_DEFS.get(theme_id, THEME_DEFS["wood"])

func set_theme(theme_id: String, save: bool = true) -> void:
	if not theme_id in THEME_IDS:
		theme_id = "wood"
	_current_theme = theme_id

	if save:
		_save_theme(theme_id)

	print("[ThemeManager] Active theme changed to: ", theme_id)
	theme_changed.emit(theme_id)

func _load_saved_theme() -> String:
	if OS.has_feature("web"):
		var val = JavaScriptBridge.eval("(function(){ try { return localStorage.getItem('chk_godot_theme') || ''; } catch(e){ return ''; } })()")
		if val != null and str(val) in THEME_IDS:
			return str(val)
	else:
		var cfg = ConfigFile.new()
		if cfg.load("user://settings.cfg") == OK:
			var val = cfg.get_value("theme", "current", "wood")
			if str(val) in THEME_IDS:
				return str(val)
	return "wood"

func _save_theme(theme_id: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("try { localStorage.setItem('chk_godot_theme', '" + theme_id + "'); } catch(e){}")
	else:
		var cfg = ConfigFile.new()
		cfg.set_value("theme", "current", theme_id)
		cfg.save("user://settings.cfg")

func _init_all_materials() -> void:
	for id in THEME_IDS:
		_materials_cache[id] = _create_theme_materials(id)

func _create_theme_materials(theme_id: String) -> Dictionary:
	var dict: Dictionary = {}

	match theme_id:
		"wood":
			# Board Light: Birch / Maple cream lacquer
			var mat_light = StandardMaterial3D.new()
			mat_light.albedo_color = Color(0.93, 0.85, 0.72)
			mat_light.roughness = 0.25
			mat_light.metallic = 0.05
			dict["board_light"] = mat_light

			# Board Dark: Rich Walnut
			var mat_dark = StandardMaterial3D.new()
			mat_dark.albedo_color = Color(0.24, 0.15, 0.08)
			mat_dark.roughness = 0.25
			mat_dark.metallic = 0.05
			dict["board_dark"] = mat_dark

			# Board Frame & Pedestal: Dark mahogany
			var mat_frame = StandardMaterial3D.new()
			mat_frame.albedo_color = Color(0.16, 0.08, 0.05)
			mat_frame.roughness = 0.35
			mat_frame.metallic = 0.08
			dict["board_frame"] = mat_frame

			# Pieces Red: Deep cherry red lacquer with clearcoat sheen
			var mat_pred = StandardMaterial3D.new()
			mat_pred.albedo_color = Color(0.55, 0.08, 0.08)
			mat_pred.roughness = 0.18
			mat_pred.metallic = 0.08
			mat_pred.clearcoat_enabled = true
			mat_pred.clearcoat = 0.85
			mat_pred.clearcoat_roughness = 0.15
			dict["piece_red"] = mat_pred

			# Pieces Black: Polished ebony black lacquer
			var mat_pblk = StandardMaterial3D.new()
			mat_pblk.albedo_color = Color(0.08, 0.08, 0.09)
			mat_pblk.roughness = 0.18
			mat_pblk.metallic = 0.12
			mat_pblk.clearcoat_enabled = true
			mat_pblk.clearcoat = 0.85
			mat_pblk.clearcoat_roughness = 0.15
			dict["piece_black"] = mat_pblk

			# Piece Accents (annular ring inlay)
			var mat_ared = StandardMaterial3D.new()
			mat_ared.albedo_color = Color(0.75, 0.15, 0.15)
			mat_ared.roughness = 0.2
			mat_ared.metallic = 0.1
			dict["accent_red"] = mat_ared

			var mat_ablk = StandardMaterial3D.new()
			mat_ablk.albedo_color = Color(0.18, 0.18, 0.2)
			mat_ablk.roughness = 0.2
			mat_ablk.metallic = 0.15
			dict["accent_black"] = mat_ablk

			# Crown: Polished rich gold
			var mat_crown = StandardMaterial3D.new()
			mat_crown.albedo_color = Color(0.96, 0.75, 0.25)
			mat_crown.metallic = 0.85
			mat_crown.roughness = 0.25
			dict["crown"] = mat_crown

		"marble":
			# Board Light: Polished white Carrara marble
			var mat_light = StandardMaterial3D.new()
			mat_light.albedo_color = Color(0.95, 0.96, 0.97)
			mat_light.roughness = 0.14
			mat_light.metallic = 0.02
			mat_light.clearcoat_enabled = true
			mat_light.clearcoat = 0.9
			mat_light.clearcoat_roughness = 0.12
			dict["board_light"] = mat_light

			# Board Dark: Nero Marquina deep black marble
			var mat_dark = StandardMaterial3D.new()
			mat_dark.albedo_color = Color(0.08, 0.08, 0.09)
			mat_dark.roughness = 0.14
			mat_dark.metallic = 0.05
			mat_dark.clearcoat_enabled = true
			mat_dark.clearcoat = 0.9
			mat_dark.clearcoat_roughness = 0.12
			dict["board_dark"] = mat_dark

			# Board Frame: Slate grey polished stone
			var mat_frame = StandardMaterial3D.new()
			mat_frame.albedo_color = Color(0.15, 0.16, 0.19)
			mat_frame.roughness = 0.18
			mat_frame.metallic = 0.1
			mat_frame.clearcoat_enabled = true
			mat_frame.clearcoat = 0.7
			dict["board_frame"] = mat_frame

			# Pieces Red: Polished Carrara stone with crimson tone
			var mat_pred = StandardMaterial3D.new()
			mat_pred.albedo_color = Color(0.88, 0.25, 0.25)
			mat_pred.roughness = 0.12
			mat_pred.metallic = 0.05
			mat_pred.clearcoat_enabled = true
			mat_pred.clearcoat = 0.9
			dict["piece_red"] = mat_pred

			# Pieces Black: Nero Marquina black marble
			var mat_pblk = StandardMaterial3D.new()
			mat_pblk.albedo_color = Color(0.06, 0.07, 0.08)
			mat_pblk.roughness = 0.12
			mat_pblk.metallic = 0.1
			mat_pblk.clearcoat_enabled = true
			mat_pblk.clearcoat = 0.9
			dict["piece_black"] = mat_pblk

			var mat_ared = StandardMaterial3D.new()
			mat_ared.albedo_color = Color(0.95, 0.96, 0.97)
			mat_ared.roughness = 0.12
			mat_ared.metallic = 0.2
			dict["accent_red"] = mat_ared

			var mat_ablk = StandardMaterial3D.new()
			mat_ablk.albedo_color = Color(0.3, 0.33, 0.38)
			mat_ablk.roughness = 0.12
			mat_ablk.metallic = 0.2
			dict["accent_black"] = mat_ablk

			# Crown: Platinum silver chrome
			var mat_crown = StandardMaterial3D.new()
			mat_crown.albedo_color = Color(0.92, 0.94, 0.98)
			mat_crown.metallic = 0.95
			mat_crown.roughness = 0.15
			dict["crown"] = mat_crown

		"glass":
			# Board Light: Frosted satin-etched glass
			var mat_light = StandardMaterial3D.new()
			mat_light.albedo_color = Color(0.72, 0.82, 0.92, 0.7)
			mat_light.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mat_light.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
			mat_light.roughness = 0.22
			mat_light.metallic = 0.05
			mat_light.clearcoat_enabled = true
			mat_light.clearcoat = 1.0
			dict["board_light"] = mat_light

			# Board Dark: Smoky obsidian glass
			var mat_dark = StandardMaterial3D.new()
			mat_dark.albedo_color = Color(0.12, 0.14, 0.18, 0.85)
			mat_dark.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mat_dark.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
			mat_dark.roughness = 0.18
			mat_dark.metallic = 0.1
			mat_dark.clearcoat_enabled = true
			mat_dark.clearcoat = 1.0
			dict["board_dark"] = mat_dark

			# Board Frame: Dark smoked acrylic with blue-violet tint (opaque foundation to prevent depth sorting bugs)
			var mat_frame = StandardMaterial3D.new()
			mat_frame.albedo_color = Color(0.08, 0.08, 0.12)
			mat_frame.roughness = 0.18
			mat_frame.metallic = 0.15
			mat_frame.clearcoat_enabled = true
			mat_frame.clearcoat = 0.8
			dict["board_frame"] = mat_frame

			# Pieces Red: Translucent ruby crystal red
			var mat_pred = StandardMaterial3D.new()
			mat_pred.albedo_color = Color(0.9, 0.15, 0.25, 0.82)
			mat_pred.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mat_pred.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
			mat_pred.roughness = 0.14
			mat_pred.metallic = 0.1
			mat_pred.clearcoat_enabled = true
			mat_pred.clearcoat = 1.0
			dict["piece_red"] = mat_pred

			# Pieces Black: Smoky obsidian glass
			var mat_pblk = StandardMaterial3D.new()
			mat_pblk.albedo_color = Color(0.1, 0.12, 0.16, 0.88)
			mat_pblk.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mat_pblk.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
			mat_pblk.roughness = 0.14
			mat_pblk.metallic = 0.15
			mat_pblk.clearcoat_enabled = true
			mat_pblk.clearcoat = 1.0
			dict["piece_black"] = mat_pblk

			var mat_ared = StandardMaterial3D.new()
			mat_ared.albedo_color = Color(1.0, 0.45, 0.55, 0.85)
			mat_ared.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mat_ared.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
			mat_ared.roughness = 0.12
			dict["accent_red"] = mat_ared

			var mat_ablk = StandardMaterial3D.new()
			mat_ablk.albedo_color = Color(0.45, 0.5, 0.6, 0.8)
			mat_ablk.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mat_ablk.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
			mat_ablk.roughness = 0.12
			dict["accent_black"] = mat_ablk

			# Crown: Prismatic crystal
			var mat_crown = StandardMaterial3D.new()
			mat_crown.albedo_color = Color(0.9, 0.95, 1.0, 0.9)
			mat_crown.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mat_crown.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
			mat_crown.metallic = 0.5
			mat_crown.roughness = 0.1
			dict["crown"] = mat_crown

		"metal":
			# Board Light: Brushed aluminum
			var mat_light = StandardMaterial3D.new()
			mat_light.albedo_color = Color(0.78, 0.82, 0.85)
			mat_light.metallic = 0.75
			mat_light.roughness = 0.25
			dict["board_light"] = mat_light

			# Board Dark: Brushed brass
			var mat_dark = StandardMaterial3D.new()
			mat_dark.albedo_color = Color(0.54, 0.43, 0.21)
			mat_dark.metallic = 0.85
			mat_dark.roughness = 0.3
			dict["board_dark"] = mat_dark

			# Board Frame: Cast iron dark frame
			var mat_frame = StandardMaterial3D.new()
			mat_frame.albedo_color = Color(0.12, 0.13, 0.15)
			mat_frame.metallic = 0.85
			mat_frame.roughness = 0.45
			dict["board_frame"] = mat_frame

			# Pieces Red: Heavy machined brass with bronze-red hue
			var mat_pred = StandardMaterial3D.new()
			mat_pred.albedo_color = Color(0.72, 0.28, 0.18)
			mat_pred.metallic = 0.9
			mat_pred.roughness = 0.25
			dict["piece_red"] = mat_pred

			# Pieces Black: Blued gunmetal steel
			var mat_pblk = StandardMaterial3D.new()
			mat_pblk.albedo_color = Color(0.11, 0.14, 0.18)
			mat_pblk.metallic = 0.95
			mat_pblk.roughness = 0.2
			dict["piece_black"] = mat_pblk

			var mat_ared = StandardMaterial3D.new()
			mat_ared.albedo_color = Color(0.9, 0.65, 0.25)
			mat_ared.metallic = 0.95
			mat_ared.roughness = 0.2
			dict["accent_red"] = mat_ared

			var mat_ablk = StandardMaterial3D.new()
			mat_ablk.albedo_color = Color(0.4, 0.5, 0.6)
			mat_ablk.metallic = 0.95
			mat_ablk.roughness = 0.2
			dict["accent_black"] = mat_ablk

			# Crown: Machined titanium gold
			var mat_crown = StandardMaterial3D.new()
			mat_crown.albedo_color = Color(1.0, 0.84, 0.0)
			mat_crown.metallic = 0.95
			mat_crown.roughness = 0.15
			dict["crown"] = mat_crown

		"cyber":
			# Board Light: Dark circuit with subtle cyber blue tint
			var mat_light = StandardMaterial3D.new()
			mat_light.albedo_color = Color(0.07, 0.08, 0.15)
			mat_light.roughness = 0.3
			mat_light.metallic = 0.35
			dict["board_light"] = mat_light

			# Board Dark: Matte stealth carbon
			var mat_dark = StandardMaterial3D.new()
			mat_dark.albedo_color = Color(0.05, 0.05, 0.08)
			mat_dark.roughness = 0.35
			mat_dark.metallic = 0.4
			dict["board_dark"] = mat_dark

			# Board Frame: Stealth matte black with edge sheen
			var mat_frame = StandardMaterial3D.new()
			mat_frame.albedo_color = Color(0.03, 0.03, 0.05)
			mat_frame.roughness = 0.25
			mat_frame.metallic = 0.5
			dict["board_frame"] = mat_frame

			# Pieces Red: Stealth carbon with emissive crimson accent
			var mat_pred = StandardMaterial3D.new()
			mat_pred.albedo_color = Color(0.06, 0.06, 0.08)
			mat_pred.roughness = 0.25
			mat_pred.metallic = 0.5
			dict["piece_red"] = mat_pred

			# Pieces Black: Stealth carbon with emissive cyan accent
			var mat_pblk = StandardMaterial3D.new()
			mat_pblk.albedo_color = Color(0.06, 0.06, 0.08)
			mat_pblk.roughness = 0.25
			mat_pblk.metallic = 0.5
			dict["piece_black"] = mat_pblk

			# Glowing emissive neon rings!
			var mat_ared = StandardMaterial3D.new()
			mat_ared.albedo_color = Color(1.0, 0.05, 0.35)
			mat_ared.emission_enabled = true
			mat_ared.emission = Color(1.0, 0.05, 0.35)
			mat_ared.emission_energy_multiplier = 2.5
			dict["accent_red"] = mat_ared

			var mat_ablk = StandardMaterial3D.new()
			mat_ablk.albedo_color = Color(0.0, 0.94, 1.0)
			mat_ablk.emission_enabled = true
			mat_ablk.emission = Color(0.0, 0.94, 1.0)
			mat_ablk.emission_energy_multiplier = 2.5
			dict["accent_black"] = mat_ablk

			# Crown: Hyper-neon gold with glow
			var mat_crown = StandardMaterial3D.new()
			mat_crown.albedo_color = Color(1.0, 0.88, 0.1)
			mat_crown.emission_enabled = true
			mat_crown.emission = Color(1.0, 0.88, 0.1)
			mat_crown.emission_energy_multiplier = 2.0
			dict["crown"] = mat_crown

	return dict

func get_board_materials() -> Dictionary:
	var cached: Dictionary = _materials_cache.get(_current_theme, {})
	return {
		"light": cached.get("board_light"),
		"dark": cached.get("board_dark"),
		"frame": cached.get("board_frame")
	}

func get_piece_materials(color: int) -> Dictionary:
	var cached: Dictionary = _materials_cache.get(_current_theme, {})
	var is_red: bool = color > 0
	return {
		"body": cached.get("piece_red" if is_red else "piece_black"),
		"accent": cached.get("accent_red" if is_red else "accent_black"),
		"crown": cached.get("crown")
	}

func get_hud_styling() -> Dictionary:
	match _current_theme:
		"wood":
			return {
				"card_bg": Color(0.14, 0.11, 0.09, 0.94),
				"border_red": Color(0.85, 0.25, 0.2, 0.75),
				"border_black": Color(0.4, 0.4, 0.45, 0.75),
				"active_border": Color(0.96, 0.69, 0.25, 1.0),
				"accent": Color(0.96, 0.69, 0.25, 1.0),
				"capsule_bg": Color(0.12, 0.1, 0.09, 0.94),
				"turn_red": Color(0.91, 0.3, 0.24, 1.0),
				"turn_black": Color(0.18, 0.18, 0.22, 1.0)
			}
		"marble":
			return {
				"card_bg": Color(0.09, 0.1, 0.14, 0.94),
				"border_red": Color(0.88, 0.3, 0.3, 0.85),
				"border_black": Color(0.82, 0.85, 0.9, 0.85),
				"active_border": Color(0.4, 0.71, 0.96, 1.0),
				"accent": Color(0.4, 0.71, 0.96, 1.0),
				"capsule_bg": Color(0.08, 0.09, 0.12, 0.95),
				"turn_red": Color(0.88, 0.25, 0.25, 1.0),
				"turn_black": Color(0.2, 0.24, 0.3, 1.0)
			}
		"glass":
			return {
				"card_bg": Color(0.06, 0.08, 0.14, 0.82),
				"border_red": Color(0.95, 0.35, 0.45, 0.8),
				"border_black": Color(0.7, 0.75, 0.9, 0.6),
				"active_border": Color(0.7, 0.6, 1.0, 1.0),
				"accent": Color(0.7, 0.6, 1.0, 1.0),
				"capsule_bg": Color(0.06, 0.08, 0.14, 0.85),
				"turn_red": Color(0.95, 0.2, 0.35, 1.0),
				"turn_black": Color(0.25, 0.28, 0.38, 1.0)
			}
		"metal":
			return {
				"card_bg": Color(0.1, 0.12, 0.15, 0.95),
				"border_red": Color(0.8, 0.35, 0.2, 0.85),
				"border_black": Color(0.5, 0.55, 0.6, 0.8),
				"active_border": Color(0.9, 0.5, 0.15, 1.0),
				"accent": Color(0.9, 0.5, 0.15, 1.0),
				"capsule_bg": Color(0.08, 0.1, 0.12, 0.96),
				"turn_red": Color(0.85, 0.35, 0.15, 1.0),
				"turn_black": Color(0.18, 0.22, 0.28, 1.0)
			}
		"cyber":
			return {
				"card_bg": Color(0.04, 0.05, 0.09, 0.96),
				"border_red": Color(1.0, 0.05, 0.35, 0.85),
				"border_black": Color(0.0, 0.94, 1.0, 0.85),
				"active_border": Color(0.0, 0.94, 1.0, 1.0),
				"accent": Color(0.0, 0.94, 1.0, 1.0),
				"capsule_bg": Color(0.03, 0.04, 0.07, 0.96),
				"turn_red": Color(1.0, 0.05, 0.35, 1.0),
				"turn_black": Color(0.0, 0.94, 1.0, 1.0)
			}
		_:
			return get_hud_styling()
