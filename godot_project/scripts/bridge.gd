extends Node

## Bridge.gd
## Autoload Singleton for Bidirectional Godot <-> JavaScript WebAssembly communication.
## Bridges game state, 3D piece animation, raycast selections, spectator actions, and WebLLM banter.

signal board_updated(data: Dictionary)
signal move_animation_requested(data: Dictionary)
signal banter_streamed(color: int, text: String)
signal player_info_updated(color: int, info: Dictionary)
signal spectator_mode_changed(active: bool, paused: bool)
signal board_flipped(flipped: bool)
signal show_notation_changed(show: bool)
signal download_progress(data: Dictionary)

# Persistent callback references to prevent garbage collection in Godot 4 WebAssembly
var _cb_ready: JavaScriptObject
var _cb_render: JavaScriptObject
var _cb_animate_move: JavaScriptObject
var _cb_banter_stream: JavaScriptObject
var _cb_player_info: JavaScriptObject
var _cb_spectator_mode: JavaScriptObject
var _cb_board_flipped: JavaScriptObject
var _cb_show_notation: JavaScriptObject
var _cb_download_progress: JavaScriptObject

var _is_web: bool = false
var _js_bridge: JavaScriptObject = null
var is_mock_mode: bool = false

func _ready() -> void:
	_is_web = OS.has_feature("web")
	if _is_web:
		_setup_web_bridge()
	else:
		_setup_mock_mode()

func _setup_web_bridge() -> void:
	_js_bridge = JavaScriptBridge.get_interface("GodotCheckersBridge")
	if _js_bridge == null:
		print("[Bridge] Warning: 'window.GodotCheckersBridge' not detected. Falling back to Mock Mode.")
		_setup_mock_mode()
		return

	print("[Bridge] Web client connected to JavaScript bridge. Registering callbacks...")

	# Create persistent callbacks
	_cb_render = JavaScriptBridge.create_callback(_on_js_render)
	_cb_animate_move = JavaScriptBridge.create_callback(_on_js_animate_move)
	_cb_banter_stream = JavaScriptBridge.create_callback(_on_js_banter_stream)
	_cb_player_info = JavaScriptBridge.create_callback(_on_js_player_info)
	_cb_spectator_mode = JavaScriptBridge.create_callback(_on_js_spectator_mode)
	_cb_board_flipped = JavaScriptBridge.create_callback(_on_js_board_flipped)
	_cb_show_notation = JavaScriptBridge.create_callback(_on_js_show_notation)
	_cb_download_progress = JavaScriptBridge.create_callback(_on_js_download_progress)

	# Bind callbacks to JS bridge private hooks
	_js_bridge["_onGodotRender"] = _cb_render
	_js_bridge["_onGodotAnimateMove"] = _cb_animate_move
	_js_bridge["_onGodotBanterStream"] = _cb_banter_stream
	_js_bridge["_onGodotPlayerInfo"] = _cb_player_info
	_js_bridge["_onGodotSpectatorMode"] = _cb_spectator_mode
	_js_bridge["_onGodotBoardFlipped"] = _cb_board_flipped
	_js_bridge["_onGodotShowNotation"] = _cb_show_notation
	_js_bridge["_onGodotDownloadProgress"] = _cb_download_progress

	# Notify JS that Godot is ready
	if _js_bridge.has("onGodotReady") and _js_bridge["onGodotReady"] != null:
		_js_bridge.onGodotReady()

func _setup_mock_mode() -> void:
	is_mock_mode = true
	print("[Bridge] Initialized in Mock Mode (Desktop / Editor environment).")
	# Emit sample initial board state after short delay for desktop editor preview
	call_deferred("_emit_mock_initial_state")

func _emit_mock_initial_state() -> void:
	# Standard Draughts opening board (12 black pieces, 8 empty, 12 red pieces)
	# 1=RED_MAN, 2=BLACK_MAN
	var mock_board: Array = []
	for i in range(12):
		mock_board.append(2) # Black pieces on rows 0..2
	for i in range(8):
		mock_board.append(0) # Empty squares on rows 3..4
	for i in range(12):
		mock_board.append(1) # Red pieces on rows 5..7

	var mock_state: Dictionary = {
		"board": mock_board,
		"turn": 1, # Red turn
		"selectedSquare": null,
		"mustContinueJumpFrom": null,
		"winner": null,
		"legalMovesForSelected": [],
		"selectableIndices": [20, 21, 22, 23], # 7 standard opening moves
		"preyIndices": [],
		"lastMove": null,
		"mustJump": false,
		"message": "Mock Mode: Select a piece to move.",
		"newlyCrownedIndex": null,
		"stats": {
			"turnCount": 0,
			"redCaptures": 0,
			"blackCaptures": 0,
			"redKingsCrowned": 0,
			"blackKingsCrowned": 0
		},
		"winReason": null
	}
	board_updated.emit(mock_state)

# ==============================================================================
# Inbound JS -> Godot Callback Handlers
# ==============================================================================

func _on_js_render(args: Array) -> void:
	if args.size() > 0 and args[0] != null:
		var json_str: String = str(args[0])
		var parsed = JSON.parse_string(json_str)
		if parsed is Dictionary:
			board_updated.emit(parsed)
		else:
			push_error("[Bridge] Failed to parse render JSON: " + json_str)

func _on_js_animate_move(args: Array) -> void:
	if args.size() > 0 and args[0] != null:
		var json_str: String = str(args[0])
		var parsed = JSON.parse_string(json_str)
		if parsed is Dictionary:
			move_animation_requested.emit(parsed)
		else:
			push_error("[Bridge] Failed to parse move animation JSON: " + json_str)

func _on_js_banter_stream(args: Array) -> void:
	if args.size() >= 2:
		var color: int = int(args[0])
		var text: String = str(args[1])
		banter_streamed.emit(color, text)

func _on_js_player_info(args: Array) -> void:
	if args.size() >= 2:
		var color: int = int(args[0])
		var json_str: String = str(args[1])
		var parsed = JSON.parse_string(json_str)
		if parsed is Dictionary:
			player_info_updated.emit(color, parsed)

func _on_js_spectator_mode(args: Array) -> void:
	if args.size() >= 2:
		var active: bool = bool(args[0])
		var paused: bool = bool(args[1])
		spectator_mode_changed.emit(active, paused)

func _on_js_board_flipped(args: Array) -> void:
	if args.size() > 0:
		var flipped: bool = bool(args[0])
		board_flipped.emit(flipped)

func _on_js_show_notation(args: Array) -> void:
	if args.size() > 0:
		var show: bool = bool(args[0])
		show_notation_changed.emit(show)

func _on_js_download_progress(args: Array) -> void:
	if args.size() > 0 and args[0] != null:
		var json_str: String = str(args[0])
		var parsed = JSON.parse_string(json_str)
		if parsed is Dictionary:
			download_progress.emit(parsed)

# ==============================================================================
# Outbound Godot -> JS Helper Functions
# ==============================================================================

## Notifies JS controller that player clicked dark square (index 0..31)
func notify_square_clicked(index: int) -> void:
	if is_mock_mode:
		print("[Bridge Mock] Square clicked: ", index)
		return

	if _js_bridge and _js_bridge.has("onSquareClicked") and _js_bridge["onSquareClicked"] != null:
		_js_bridge.onSquareClicked(index)

## Notifies JS controller that piece move/hop animation has concluded
func notify_animation_complete() -> void:
	if is_mock_mode:
		print("[Bridge Mock] Move animation complete.")
		return

	if _js_bridge and _js_bridge.has("onAnimationComplete") and _js_bridge["onAnimationComplete"] != null:
		_js_bridge.onAnimationComplete()

## Requests JS controller to launch match with configuration
func notify_launch_match(config: Dictionary) -> void:
	var json_str: String = JSON.stringify(config)
	if is_mock_mode:
		print("[Bridge Mock] Launch match requested: ", json_str)
		return

	if _js_bridge and _js_bridge.has("onLaunchMatch") and _js_bridge["onLaunchMatch"] != null:
		_js_bridge.onLaunchMatch(json_str)

## Requests JS controller to reset the current game
func notify_reset_game() -> void:
	if is_mock_mode:
		print("[Bridge Mock] Reset game requested.")
		_emit_mock_initial_state()
		return

	if _js_bridge and _js_bridge.has("onResetGame") and _js_bridge["onResetGame"] != null:
		_js_bridge.onResetGame()

## Notifies JS spectator controls (e.g. "play", "pause", "step", "speed")
func notify_spectator_action(action: String, value: Variant = null) -> void:
	if is_mock_mode:
		print("[Bridge Mock] Spectator action: ", action, " value: ", value)
		return

	if _js_bridge and _js_bridge.has("onSpectatorAction") and _js_bridge["onSpectatorAction"] != null:
		_js_bridge.onSpectatorAction(action, value)
