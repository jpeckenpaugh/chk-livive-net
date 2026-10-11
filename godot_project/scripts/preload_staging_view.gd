extends Control

## preload_staging_view.gd
## Staging overlay displaying WebLLM neural weights download progress.
## Offers instant fallback to Minimax if user prefers not to wait.

@onready var progress_bar: ProgressBar = $Backdrop/Card/Margin/VBox/ProgressBar
@onready var status_label: Label = $Backdrop/Card/Margin/VBox/ProgressInfo/StatusLabel
@onready var percent_label: Label = $Backdrop/Card/Margin/VBox/ProgressInfo/PercentLabel
@onready var btn_fallback_minimax: Button = $Backdrop/Card/Margin/VBox/BtnFallbackMinimax

func _ready() -> void:
	if Bridge != null:
		Bridge.download_progress.connect(_on_download_progress)

	if btn_fallback_minimax:
		btn_fallback_minimax.pressed.connect(_on_fallback_minimax_pressed)

func _on_download_progress(data: Dictionary) -> void:
	# Show modal if progress arrives
	if not visible:
		visible = true
		modulate.a = 1.0

	var text: String = data.get("text", "")
	var progress: float = float(data.get("progress", 0.0))

	# Normalize progress: if <= 1.0, convert to 0..100%
	var pct: float = progress * 100.0 if progress <= 1.0 else progress

	if progress_bar:
		progress_bar.value = pct

	if percent_label:
		percent_label.text = "%d%%" % int(pct)

	if status_label and text != "":
		status_label.text = text

	if pct >= 100.0:
		# Auto fade out smoothly when finished
		var tween: Tween = create_tween()
		tween.tween_interval(0.4)
		tween.tween_property(self, "modulate:a", 0.0, 0.4)
		tween.tween_callback(func(): visible = false)

func _on_fallback_minimax_pressed() -> void:
	print("[PreloadStaging] User selected instant fallback to Minimax.")
	if Bridge != null:
		Bridge.notify_launch_match({
			"mode": "minimax",
			"difficulty": "medium",
			"minimaxColor": "red"
		})
	visible = false
